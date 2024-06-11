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
RESTRICTED = "restricted"
STATUS = "status"
O2_PATH = "o2_path"
SUBMITTED_FILE = "SubmittedFile"
FILE_FORMAT = "file_format"
DISPLAY_TITLE = "display_title"

WASHU_GCC = "WASHU GCC"
BCM_GCC = "BCM GCC"
NYGC_GCC = "NYGC GCC"
BROAD_GCC = "BROAD GCC"
UWSC_GCC = "UWSC GCC"


def includeme(config):
    config.add_route("get_submission_status", "/get_submission_status/")
    config.scan(__name__)


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
        search_params["limit"] = min(post_params.get("limit", 30), 30)
        search_params["from"] = post_params["from"]
        search_params["sort"] = f"-date_created"
        add_submission_status_search_filters(search_params, filter, fileSetSearchId)
        subreq = make_search_subreq(
            request, f"/search?{urlencode(search_params, True)}", inherit_user=True
        )
        search_res = search(context, subreq)["@graph"]
        file_sets = []
        file_group_color_map = {}
        for res in search_res:
            file_set = res
            file_set["submitted_files"] = process_files_metadata(res.get("files", []))

            if "file_group" in file_set:
                fg = file_set["file_group"]
                fg_str = f"{fg['submission_center']}_{fg['sample_source']}_{fg['sequencing']}_{fg['assay']}"
                file_set["file_group"] = fg_str
                # Place holder that will be replaced in the next step
                file_group_color_map[fg_str] = None
            else:
                file_set["file_group"] = "No file group assigned"
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
                fs["file_group_color"] = file_group_color_map[fs["file_group"]]

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
        search_params["libraries.analytes.samples.sample_sources.code"] = filter[
            "cell_culture_mixtures_and_tissues"
        ]
    if filter.get("include_tags"):
        search_params["tags"] = filter["include_tags"]
    if filter.get("exclude_tags"):
        search_params["tags!"] = filter["exclude_tags"]
    if filter.get("fileset_created_from"):
        search_params["date_created.from"] = filter["fileset_created_from"]
    if filter.get("fileset_created_to"):
        search_params["date_created.to"] = filter["fileset_created_to"]


def process_files_metadata(files_metadata):
    is_upload_complete = True
    num_files_copied_to_o2 = 0
    file_formats = []
    submitted_files = list(
        filter(lambda f: SUBMITTED_FILE in f["@type"], files_metadata)
    )
    for file in submitted_files:
        if file[STATUS] == UPLOADING:
            is_upload_complete = False
        file_formats.append(file.get(FILE_FORMAT, {}).get(DISPLAY_TITLE))

    for file in files_metadata:
        if O2_PATH in file:
            num_files_copied_to_o2 += 1

    # Make it unqique
    file_formats = list(set(file_formats))

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

    return {
        "is_upload_complete": is_upload_complete,
        "num_submitted_files": len(submitted_files),
        "num_fileset_files": len(files_metadata),
        "date_uploaded": date_uploaded,
        "file_formats": ", ".join(file_formats),
        "num_files_copied_to_o2": num_files_copied_to_o2,
    }


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
