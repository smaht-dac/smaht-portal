from pyramid.view import view_config
from snovault.util import debug_log
from dcicutils.misc_utils import ignored
from snovault.search.search import search
from snovault.search.search_utils import make_search_subreq
from .schema_formats import is_accession_for_server
from urllib.parse import urlencode
import colorsys

# Portal constants
FILESET = "FileSet"
UPLOADED = "uploaded"
RELEASED = "released"
PUBLIC = "public"
UPLOADING = "uploading"
ARCHIVED = "archived"
DELTED = "deleted"
RESTRICTED = "restricted"
STATUS = "status"
O2_PATH = "o2_path"
SUBMITTED_FILE = "SubmittedFile"
OUTPUT_FILE = "OutputFile"
FILE_FORMAT = "file_format"
DISPLAY_TITLE = "display_title"
QUALITY_METRICS = "quality_metrics"
UUID = "uuid"
ACCESSION = "accession"
OVERALL_QUALITY_STATUS = "overall_quality_status"
UNALIGNED_READS = "UnalignedReads"

WASHU_GCC = "WASHU GCC"
BCM_GCC = "BCM GCC"
NYGC_GCC = "NYGC GCC"
BROAD_GCC = "BROAD GCC"
UWSC_GCC = "UWSC GCC"

MAX_FILESETS = 30

CELL_CULTURE_MIXTURES = [
    'HAPMAP6',
    'COLO829BLT50',
]


def includeme(config):
    config.add_route("get_submission_status", "/get_submission_status/")
    config.add_route("get_file_group_qc", "/get_file_group_qc/")
    config.scan(__name__)


@view_config(route_name="get_file_group_qc", request_method="POST")
@debug_log
def get_file_group_qc(context, request):
    try:
        post_params = request.json_body
        file_set_uuid = post_params.get("fileSetUuid")
        file_group = post_params.get("fileGroup")
        warnings = []

        files_with_qcs = []
        filesets = {}

        MAX_FG_FILESETS = 50
        MAX_QUALITY_METRICS_ITEMS = 100

        # Search for fileset with same file group
        search_params = {}
        search_params["type"] = FILESET
        search_params["limit"] = MAX_FG_FILESETS

        if file_group:
            # Search for fileset with same file group
            search_params["file_group.assay"] = file_group["assay"]
            search_params["file_group.sample_source"] = file_group["sample_source"]
            search_params["file_group.sequencing"] = file_group["sequencing"]
            search_params["file_group.submission_center"] = file_group[
                "submission_center"
            ]
            search_params["file_group.group_tag"] = file_group[
                "group_tag"
            ]
        else:  # Just search for the current file set
            search_params["uuid"] = file_set_uuid

        subreq = make_search_subreq(
            request, f"/search?{urlencode(search_params, True)}", inherit_user=True
        )
        search_res = search(context, subreq)["@graph"]

        if len(search_res) == MAX_FG_FILESETS:
            warnings.append(
                f"Only {MAX_FG_FILESETS} file sets have been loaded for this file group"
            )

        total_submitted_files_qms = 0

        # Get all relevant MetaWorkflow run here at once. It's too expensice to retrieve them
        # individually later
        all_alignment_mwfrs = get_all_alignments_mwfrs(context, request, search_res)

        for fs in search_res:
            files = fs.get("files", [])
            meta_workflow_runs = fs.get("meta_workflow_runs", [])
            submitted_file_qc_infos = get_submitted_files_info(files).get("qc_infos")
            output_file_qc_infos = get_output_files_info(
                files, meta_workflow_runs, all_alignment_mwfrs
            ).get("qc_infos")

            filesets[fs.get(UUID)] = {
                "uuid": fs.get(UUID),
                "tags": fs.get("tags", []),
                "comments": fs.get("comments", []),
                "submitted_id": fs.get("submitted_id"),
            }

            # We need to control the number of QualityMetrics objects that we need to retrieve
            # for submitted files. We don't cap the QualityMetrics objects for output files. These
            # are controlled by the number of filesets we load.
            qms_to_get = []
            for f in output_file_qc_infos:
                for qm in f.get("quality_metrics", []):
                    qms_to_get.append(qm[UUID])

            for f in submitted_file_qc_infos:
                if total_submitted_files_qms >= MAX_QUALITY_METRICS_ITEMS:
                    break
                for qm in f.get("quality_metrics", []):
                    qms_to_get.append(qm[UUID])
                total_submitted_files_qms += 1

            # Get all QualityMetrics items at once via search (for the fileset)
            qm_search_params = [("type", "QualityMetric")]
            qm_search_params = [("limit", 2 * MAX_QUALITY_METRICS_ITEMS)]
            for uuid in qms_to_get:
                qm_search_params.append(("uuid", uuid))
            subreq = make_search_subreq(
                request,
                f"/search?{urlencode(qm_search_params, True)}",
                inherit_user=True,
            )
            qm_search_res = search(context, subreq)["@graph"]

            # Collect all QualityMetrics items that were retrieved here
            quality_metrics_items = {}
            for qm in qm_search_res:
                quality_metrics_items[qm[UUID]] = qm

            for f in submitted_file_qc_infos + output_file_qc_infos:
                for qm in f.get("quality_metrics", []):
                    if qm[UUID] not in quality_metrics_items:
                        # This will only happen if there were too many submitted files
                        continue
                    files_with_qcs.append(
                        {
                            "accession": f["accession"],
                            "display_title": f["display_title"],
                            "is_output_file": f["is_output_file"],
                            "fileset_submitted_id": fs.get("submitted_id"),
                            "fileset_uuid": fs.get(UUID),
                            "quality_metric": quality_metrics_items[qm[UUID]],
                        }
                    )

        if total_submitted_files_qms >= MAX_QUALITY_METRICS_ITEMS:
            warnings.append(
                f"Only {MAX_QUALITY_METRICS_ITEMS} submitted files have been loaded."
            )

        return {
            "files_with_qcs": files_with_qcs,
            "filesets": filesets,
            "warnings": warnings,
        }

    except Exception as e:
        return {
            "error": f"Error when trying to get file group QC data: {e}",
        }


@view_config(route_name="get_submission_status", request_method="POST")
@debug_log
def get_submission_status(context, request):

    try:
        post_params = request.json_body
        filter = post_params.get("filter")
        fileSetSearchId = post_params.get("fileSetSearchId")
        # Generate search total
        search_params = {}
        search_params["type"] = FILESET
        add_submission_status_search_filters(search_params, filter, fileSetSearchId)
        num_total_filesets = search_total(context, request, search_params)

        # Generate search
        search_params = {}
        search_params["type"] = FILESET
        search_params["limit"] = min(
            post_params.get("limit", MAX_FILESETS), MAX_FILESETS
        )
        search_params["from"] = post_params["from"]
        search_params["sort"] = f"-date_created"
        add_submission_status_search_filters(search_params, filter, fileSetSearchId)
        subreq = make_search_subreq(
            request, f"/search?{urlencode(search_params, True)}", inherit_user=True
        )
        search_res = search(context, subreq)["@graph"]

        # Get all relevant MetaWorkflow run here at once. It's too expensice to retrieve them
        # individually later
        all_alignment_mwfrs = get_all_alignments_mwfrs(context, request, search_res)

        file_sets = []
        file_group_color_map = {}
        for res in search_res:
            file_set = res
            files = res.get("files", [])
            meta_workflow_runs = res.get("meta_workflow_runs", [])
            latest_alignment_mwfr = get_latest_alignment_mwfr_for_fileset(
                meta_workflow_runs, all_alignment_mwfrs
            )
            file_set["submitted_files"] = get_submitted_files_info(files)
            file_set["output_files"] = get_output_files_info(
                files, meta_workflow_runs, all_alignment_mwfrs
            )
            output_file_info_to_release = get_output_files_info(
                [], [latest_alignment_mwfr], all_alignment_mwfrs
            )["qc_infos"] if latest_alignment_mwfr else None

            file_set["final_output_file_accession"] = (
                output_file_info_to_release[0].get(ACCESSION)
                if output_file_info_to_release
                else None
            )

            if "file_group" in file_set:
                fg = file_set["file_group"]
                fg_str = f"{fg['submission_center']}_{fg['sample_source']}_{fg['sequencing']}_{fg['assay']}"
                if fg["group_tag"]:
                    fg_str += f"_{fg['group_tag']}"
                file_set["file_group_str"] = fg_str
                file_set["file_group"] = fg
                # Place holder that will be replaced in the next step
                file_group_color_map[fg_str] = None
            else:
                file_set["file_group_str"] = "No file group assigned"
                file_set["file_group"] = None
                file_set["file_group_color"] = "#eeeeee"
            file_sets.append(file_set)

        # Generate colors and assign them to each file group. We are generating
        # colors on the fly, so that they are as distinct as possible.
        num_distinct_file_groups = len(file_group_color_map.keys())
        fg_colors = generate_html_colors(num_distinct_file_groups)
        for i, fg in enumerate(file_group_color_map.keys()):
            file_group_color_map[fg] = fg_colors[i]
        for fs in file_sets:
            if "file_group_color" not in fs:
                fs["file_group_color"] = file_group_color_map[fs["file_group_str"]]

    except Exception as e:
        return {
            "error": f"Error when trying to get submission status: {e}",
        }

    return {
        "file_sets": file_sets,
        "total_filesets": num_total_filesets,
    }


def add_submission_status_search_filters(
    search_params: dict, filter: dict, fileSetSearchId: str
):
    """Applies user specified filters to the fileset search

    Args:
        search_params (dict): search parameters that will be passed to make_search_subreq. The dict is passed in by reference and updated in this function
        filter (dict): Contains keys (and values) to use as filter. Currently supported keys are:
        - fileset_status
        - submission_center
        - assay
        - sequencer
        - include_tags
        - exlucde_tags,
        - cell_culture_mixture,
        - cell_line,
        - donor,
        - fileset_created_from,
        - fileset_created_to
        - fileSetSearchId (str): Either submitted_id or accession or a fileset.
    """
    # Direct search by submitted_id takes precendence
    if fileSetSearchId:
        targeted_prop = (
            "accession" if is_accession_for_server(fileSetSearchId) else "submitted_id"
        )
        search_params[targeted_prop] = fileSetSearchId
        return

    if not filter:
        return
    if "fileset_status" in filter:
        if filter["fileset_status"] == "released":
            search_params[STATUS] = [RESTRICTED, RELEASED, PUBLIC]
        elif filter["fileset_status"] != "all":
            search_params[STATUS] = filter["fileset_status"]
    if "submission_center" in filter:
        if filter["submission_center"] == "all_gcc":
            search_params["submission_centers.display_title"] = [
                WASHU_GCC,
                BCM_GCC,
                NYGC_GCC,
                BROAD_GCC,
                UWSC_GCC,
            ]
        elif filter["submission_center"] != "all":
            search_params["submission_centers.display_title"] = filter[
                "submission_center"
            ]
    if "assay" in filter and filter["assay"] != "all":
        search_params["libraries.assay.display_title"] = filter["assay"]
    if "sequencer" in filter and filter["sequencer"] != "all":
        search_params["sequencing.sequencer.display_title"] = filter["sequencer"]
    if "donor" in filter and filter["donor"] != "all":
        search_params["libraries.analytes.samples.sample_sources.donor.display_title"] = filter["donor"]
    if "cell_line" in filter and filter["cell_line"] != "all":
        search_params["libraries.analytes.samples.sample_sources.cell_line.code"] = (
            filter["cell_line"]
        )
        search_params["libraries.analytes.samples.sample_sources.code"] = (
            "No+value"  # Exclude mixtures from results
        )
    elif (
        "cell_culture_mixtures_and_tissues" in filter
        and filter["cell_culture_mixtures_and_tissues"] != "all"
    ):
        filter_value = filter[
            "cell_culture_mixtures_and_tissues"
        ]
        if filter_value in CELL_CULTURE_MIXTURES:
            search_params["libraries.analytes.samples.sample_sources.code"] = filter_value
        else:
            search_params["tissue_types"] = filter_value
    if filter.get("include_tags"):
        search_params["tags"] = filter["include_tags"]
    if filter.get("exclude_tags"):
        search_params["tags!"] = filter["exclude_tags"]
    if filter.get("fileset_created_from"):
        search_params["date_created.from"] = filter["fileset_created_from"]
    if filter.get("fileset_created_to"):
        search_params["date_created.to"] = filter["fileset_created_to"]


def get_output_files_info(files, mwfrs, all_alignment_mwfrs):
    output_files = list(filter(lambda f: OUTPUT_FILE in f["@type"], files))
    output_files_with_qc = []

    # Get the output files that are on the file set
    for file in output_files:
        qc_result = get_qc_result(file, is_output_file=True)
        output_files_with_qc.append(qc_result)

    # Go through all alignment MetaWorkflowRuns and collect the output files with QCs.
    for mwfr in mwfrs:
        if mwfr[UUID] not in all_alignment_mwfrs:
            continue
        mwfr_item = all_alignment_mwfrs[mwfr[UUID]]
        wfrs = mwfr_item.get("workflow_runs", [])
        for wfr in wfrs:
            outputs = wfr.get("output", [])
            for output in outputs:
                if "file" not in output:
                    continue
                file = output["file"]
                if QUALITY_METRICS not in file:
                    continue
                qc_result = get_qc_result(file, is_output_file=True)
                output_files_with_qc.append(qc_result)

    # Remove duplicates. Happens when the final output files have been released
    output_files_with_qc_unique = list({v[ACCESSION]: v for v in output_files_with_qc}.values())

    return {
        "qc_infos": output_files_with_qc_unique,
    }


def get_submitted_files_info(files_metadata):
    is_upload_complete = True
    file_formats = []
    submitted_files = list(
        filter(lambda f: SUBMITTED_FILE in f["@type"], files_metadata)
    )
    submitted_files_qc = []
    for file in submitted_files:
        if file[STATUS] == UPLOADING:
            is_upload_complete = False
        file_formats.append(file.get(FILE_FORMAT, {}).get(DISPLAY_TITLE))

        qc_result = get_qc_result(file, is_output_file=False)
        submitted_files_qc.append(qc_result)

    # Make it unique
    file_formats = list(set(file_formats))
    file_formats.sort()

    date_uploaded = None
    if is_upload_complete and len(submitted_files) > 0:
        for file in submitted_files:
            file_status_tracking = file.get("file_status_tracking")
            if file_status_tracking and UPLOADED in file_status_tracking:
                date_uploaded_current = file_status_tracking[UPLOADED]
                if not date_uploaded:
                    date_uploaded = date_uploaded_current
                    continue
                date_uploaded = (
                    date_uploaded_current
                    if date_uploaded_current > date_uploaded
                    else date_uploaded
                )

    # Submitted reads are a subset of all submitted files
    unaligned_reads = list(
        filter(lambda f: UNALIGNED_READS in f["@type"], files_metadata)
    )
    overall_status_unaligned_reads = ""
    unaligned_reads_statuses = [f[STATUS] for f in unaligned_reads]
    unaligned_reads_statuses = list(set(unaligned_reads_statuses))
    if len(unaligned_reads_statuses) == 1 and unaligned_reads_statuses[0] in [
        ARCHIVED,
        DELTED,
    ]:
        overall_status_unaligned_reads = unaligned_reads_statuses[0]

    return {
        "is_upload_complete": is_upload_complete,
        "num_submitted_files": len(submitted_files),
        "num_fileset_files": len(files_metadata),
        "num_unaligned_reads_files": len(unaligned_reads),
        "date_uploaded": date_uploaded,
        "file_formats": ", ".join(file_formats),
        "qc_infos": submitted_files_qc,
        "overall_status_unaligned_reads": overall_status_unaligned_reads,
    }


def get_qc_result(file, is_output_file):
    qc_result = {
        DISPLAY_TITLE: file[DISPLAY_TITLE],
        UUID: file[UUID],
        ACCESSION: file[ACCESSION],
        QUALITY_METRICS: [],
        "is_output_file": is_output_file,
    }
    if QUALITY_METRICS in file:
        qms = file[QUALITY_METRICS]
        qc_result[QUALITY_METRICS] = [
            {
                OVERALL_QUALITY_STATUS: qm.get(OVERALL_QUALITY_STATUS, "NA"),
                UUID: qm[UUID],
            }
            for qm in qms
        ]
    return qc_result


def get_all_alignments_mwfrs(context, request, filesets_from_search):
    mwfrs = {}
    uuids_to_get = []
    for fs in filesets_from_search:
        mwfrs_fs = fs.get("meta_workflow_runs", [])
        for mwfr in mwfrs_fs:
            final_status = mwfr.get("final_status")
            mwf_categories = mwfr.get("meta_workflow", {}).get("category", [])
            if final_status != "completed" or "Alignment" not in mwf_categories:
                continue
            uuids_to_get.append(mwfr[UUID])

    if not uuids_to_get:
        return mwfrs

    # Get all MetaWorkflowRun items at once via search
    search_params = [("type", "MetaWorkflowRun")]
    search_params = [("limit", 2 * MAX_FILESETS)]
    for uuid in uuids_to_get:
        search_params.append(("uuid", uuid))
    subreq = make_search_subreq(
        request, f"/search?{urlencode(search_params, True)}", inherit_user=True
    )
    search_res = search(context, subreq)["@graph"]

    for r in search_res:
        mwfrs[r[UUID]] = r

    return mwfrs

def get_latest_alignment_mwfr_for_fileset(fileset_mwfrs, all_alignment_mwfrs):
    """Returns the latest alignment MetaWorkflowRun of a file set from the list of all alignment MetaWorkflowRuns"""

    if not all_alignment_mwfrs:
        return None
    fileset_alignment_mwfrs = []
    for mwfr in fileset_mwfrs:
        if mwfr[UUID] in all_alignment_mwfrs:
            fileset_alignment_mwfrs.append(mwfr)

    fileset_alignment_mwfrs_sorted = sorted(
        fileset_alignment_mwfrs,
        key=lambda d: d["date_created"],
        reverse=True,  # Most recent first
    )
    #return the most recent alignment mwfr
    return fileset_alignment_mwfrs_sorted[0] if fileset_alignment_mwfrs_sorted else None


def search_total(context, request, search_params):
    """Reads search params and executes a search total"""
    ignored(context)
    search_params["limit"] = 0
    # This one we want consistent with what the user can see
    subreq = make_search_subreq(
        request, f"/search?{urlencode(search_params, True)}", inherit_user=True
    )
    return search(context, subreq)["total"]


def generate_html_colors(num_colors):
    if num_colors < 1:
        return []
    if num_colors == 1:
        return ["#30b052"]
    # Start and end colors in HSL format (Hue, Saturation, Lightness)
    start_hue = 0  # Red
    end_hue = 0.8  # Purple. Note that 1.0 is red again
    # Calculate the hue step
    hue_step = (end_hue - start_hue) / (num_colors - 1)
    colors = []
    for i in range(num_colors):
        # Calculate hue for this step
        hue = start_hue + i * hue_step
        rgb_color = colorsys.hls_to_rgb(hue, 0.5, 1.0)
        rgb_color = tuple(i * 255 for i in rgb_color)  # scaling to usual color space
        hex_color = rgb_to_hex(rgb_color)
        colors.append(hex_color)
    # We permute the color list here to get better contrast in the final table
    # ["a", "b", "c", "d", "e", "f"] -> ['a', 'd', 'b', 'e', 'c', 'f']
    lst_1 = colors[0::3]
    lst_2 = colors[1::3]
    lst_3 = colors[2::3]
    lst_1.extend(lst_2)
    lst_1.extend(lst_3)
    return lst_1


def rgb_to_hex(rgb):
    # Convert RGB tuple to hexadecimal color string
    return "#{:02x}{:02x}{:02x}".format(int(rgb[0]), int(rgb[1]), int(rgb[2]))
