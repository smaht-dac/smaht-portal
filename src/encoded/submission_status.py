from pyramid.view import view_config
from pyramid.response import Response
from snovault.util import debug_log
from dcicutils.misc_utils import ignored
from snovault.search.search import get_iterable_search_results, search
from snovault.search.search_utils import make_search_subreq
from urllib.parse import urlencode
from typing import Tuple, NamedTuple, List
import csv
import json
from datetime import datetime
import pprint


def includeme(config):
    config.add_route("get_submission_status", "/get_submission_status/")
    config.scan(__name__)




@view_config(route_name="get_submission_status", request_method="POST")
@debug_log
def get_submission_status(context, request):

    post_params = request.json_body
    filter = post_params.get("filter")
    # Generate search total
    search_params = {}
    search_params["type"] = "FileSet"
    if filter and "fileset_status" in filter and filter["fileset_status"] != "all":
        search_params["status"] = filter["fileset_status"]
    if filter and "submission_center" in filter and filter["submission_center"] != "all":
        search_params["submission_centers.display_title"] = filter["submission_center"]
    num_total_filesets = search_total(context, request, search_params)

    # Generate search
    search_params = {}
    search_params["type"] = "FileSet"
    search_params["limit"] = min(post_params['limit'],50)
    search_params["from"] = post_params['from']
    search_params["sort"] = f"-date_created"
    if filter and "fileset_status" in filter and filter["fileset_status"] != "all":
        search_params["status"] = filter["fileset_status"]
    if filter and "submission_center" in filter and filter["submission_center"] != "all":
        search_params["submission_centers.display_title"] = filter["submission_center"]

    subreq = make_search_subreq(
        request, f"/search?{urlencode(search_params, True)}", inherit_user=True
    )
    search_res = search(context, subreq)["@graph"]
    #pprint.pprint(search_res)


    #pprint.pprint(search_result)

    #search_iter = get_iterable_search_results(request, param_lists=search_params)

    file_sets = []

    for res in search_res:
        file_set = {}
        file_set["accession"] = res["accession"]
        file_set["status"] = res["status"]
        file_set["display_title"] = res["display_title"]
        file_set["submission_date"] = res["date_created"]
        sequencing = res["sequencing"]
        file_set["sequencing"] = {
            "display_title": sequencing["display_title"],
            "uuid": sequencing["uuid"],
            "sequencer": sequencing["sequencer"]["display_title"],
        }

        file_set["submission_centers"] = [
            s["display_title"] for s in res["submission_centers"]
        ]

        file_set["libraries"] = [
            {
                "display_title": lib["display_title"],
                "uuid": lib["uuid"],
                "assay": lib["assay"]["display_title"],
            }
            for lib in res["libraries"]
        ]
        #pprint.pprint(res)
        file_set["submitted_files"] = process_files_metadata(res["files"])

        # Search for associated MWFRs
        file_set["meta_workflow_runs"] = get_associated_mwfrs(request, res["uuid"])

        # pprint.pprint(res)
        file_sets.append(file_set)

    return {
        "success": True,
        "errors": "",
        "file_sets": file_sets,
        "total_filesets": num_total_filesets,
    }


def get_associated_mwfrs(request, file_set_uuid):
    mwfrs = []
    search_param = {}
    search_param["type"] = "MetaWorkflowRun"
    search_param["file_sets.uuid"] = file_set_uuid
    search_param["field"] = [
        "meta_workflow",
        "accession",
        "final_status",
        "date_created",
    ]

    search_iter = get_iterable_search_results(request, param_lists=search_param)

    for res in search_iter:
        mwfr = {
            "accession": res["accession"],
            "final_status": res["final_status"],
            "date_created": res["date_created"],
            "meta_workflow_display_title": res["meta_workflow"]["display_title"],
        }
        mwfrs.append(mwfr)

    return mwfrs


def process_files_metadata(files_metadata):
    is_upload_complete = True
    num_files_copied_to_o2 = 0
    submitted_files = list(
        filter(lambda f: "SubmittedFile" in f["@type"], files_metadata)
    )
    for file in submitted_files:
        if file["status"] not in ["released", "uploaded"]:
            is_upload_complete = False
        if "o2_path" in file:
            num_files_copied_to_o2 += 1

    # TODO: Get correct date here
    date_uploaded = "2024-04-01T21:44:09.152427+00:00"

    return {
        "is_upload_complete": is_upload_complete,
        "num_submitted_files": len(submitted_files),
        "date_uploaded": date_uploaded,
        "num_files_copied_to_o2": num_files_copied_to_o2,
    }


def search_total(context, request, search_params):
    """Reads search params and executes a search total"""
    ignored(context)

    # Ensure this is always the case to prevent unintended slowness
    if "limit" not in search_params:
        search_params["limit"] = 0

    # This one we want consistent with what the user can see
    subreq = make_search_subreq(
        request, f"/search?{urlencode(search_params, True)}", inherit_user=True
    )
    return search(context, subreq)["total"]
