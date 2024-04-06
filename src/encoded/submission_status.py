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
    add_search_filters(search_params, filter)
    num_total_filesets = search_total(context, request, search_params)

    # Generate search
    search_params = {}
    search_params["type"] = "FileSet"
    search_params["limit"] = min(post_params["limit"], 50)
    search_params["from"] = post_params["from"]
    search_params["sort"] = f"-date_created"
    add_search_filters(search_params, filter)

    subreq = make_search_subreq(
        request, f"/search?{urlencode(search_params, True)}", inherit_user=True
    )
    search_res = search(context, subreq)["@graph"]
    # pprint.pprint(search_res)

    # pprint.pprint(search_result)

    file_sets = []

    for res in search_res:
        file_set = {}
        file_set["accession"] = res["accession"]
        file_set["status"] = res["status"]
        file_set["display_title"] = res["display_title"]
        file_set["date_created"] = res["date_created"]
        sequencing = res["sequencing"]
        file_set["sequencing"] = {
            "display_title": sequencing.get("display_title", ""),
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
                "assay_display_title": lib["assay"]["display_title"],
            }
            for lib in res.get("libraries", [])
        ]
        # pprint.pprint(res)
        file_set["submitted_files"] = process_files_metadata(res.get("files", []))

        # Search for associated MWFRs
        file_set["meta_workflow_runs"] = []
        for mwfr in res.get("meta_workflow_runs", []):
            file_set["meta_workflow_runs"].append(
                {
                    "accession": mwfr["accession"],
                    "final_status": mwfr["final_status"],
                    "date_created": mwfr["date_created"],
                    "meta_workflow_display_title": mwfr["meta_workflow"][
                        "display_title"
                    ],
                }
            )

        # pprint.pprint(res)
        file_sets.append(file_set)

    return {
        "success": True,
        "errors": "",
        "file_sets": file_sets,
        "total_filesets": num_total_filesets,
    }


def add_search_filters(search_params, filter):
    if not filter:
        return
    if "fileset_status" in filter and filter["fileset_status"] != "all":
        search_params["status"] = filter["fileset_status"]
    if "submission_center" in filter and filter["submission_center"] != "all":
        search_params["submission_centers.display_title"] = filter["submission_center"]
    if "fileset_created_from" in filter and filter["fileset_created_from"]:
        search_params["date_created.from"] = filter["fileset_created_from"]
    if "fileset_created_to" in filter and filter["fileset_created_to"]:
        search_params["date_created.to"] = filter["fileset_created_to"]


def process_files_metadata(files_metadata):
    is_upload_complete = True
    num_files_copied_to_o2 = 0
    submitted_files = list(
        filter(lambda f: "SubmittedFile" in f["@type"], files_metadata)
    )
    for file in submitted_files:
        if file["status"] == "uploading":
            is_upload_complete = False
        if "o2_path" in file:
            num_files_copied_to_o2 += 1

    date_uploaded = None
    if is_upload_complete and len(submitted_files) > 0:
        for file in submitted_files:
            file_status_tracking = file.get("file_status_tracking")
            if file_status_tracking and "uploaded" in file_status_tracking:
                date_uploaded_current = file_status_tracking["uploaded"]
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
