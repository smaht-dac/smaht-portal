from pyramid.view import view_config
from snovault.util import debug_log
from dcicutils.misc_utils import ignored
from snovault.search.search import search
from snovault.search.search_utils import make_search_subreq
from urllib.parse import urlencode

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
        for res in search_res:
            file_set = res
            file_set["submitted_files"] = process_files_metadata(res.get("files", []))
            file_sets.append(file_set)
    except Exception as e:
        return {
            "error": f"Error when trying to get submission status: {e}",
        }

    return {
        "file_sets": file_sets,
        "total_filesets": num_total_filesets,
    }


def add_submission_status_search_filters(search_params, filter, fileSetSearchId):
    # Direct search by submitted_id takes precendence
    if fileSetSearchId:
        targeted_prop = "accession" if is_accession(fileSetSearchId) else "submitted_id"
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
    if "include_tags" in filter and len(filter["include_tags"]) > 0:
        search_params["tags"] = filter["include_tags"]
    if "exclude_tags" in filter and len(filter["exclude_tags"]) > 0:
        search_params["tags!"] = filter["exclude_tags"]
    if "fileset_created_from" in filter and filter["fileset_created_from"]:
        search_params["date_created.from"] = filter["fileset_created_from"]
    if "fileset_created_to" in filter and filter["fileset_created_to"]:
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


def is_accession(s: str) -> bool:
    return len(s) == 12 and s.startswith("SMA")


def search_total(context, request, search_params):
    """Reads search params and executes a search total"""
    ignored(context)
    search_params["limit"] = 0
    # This one we want consistent with what the user can see
    subreq = make_search_subreq(
        request, f"/search?{urlencode(search_params, True)}", inherit_user=True
    )
    return search(context, subreq)["total"]
