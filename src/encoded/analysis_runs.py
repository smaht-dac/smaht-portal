from pyramid.view import view_config
from snovault.util import debug_log
from dcicutils.misc_utils import ignored
from snovault.search.search import search
from snovault.search.search_utils import make_search_subreq
from .schema_formats import is_accession_for_server
from urllib.parse import urlencode
from .submission_status import search_total


# Portal constants
ANALYSIS_RUN = "AnalysisRun"

LIMIT = 30


def includeme(config):
    config.add_route("get_analysis_runs", "/get_analysis_runs/")
    config.scan(__name__)


@view_config(route_name="get_analysis_runs", request_method="POST")
@debug_log
def get_analysis_runs(context, request):

    try:
        post_params = request.json_body
        filter = post_params.get("filter")
        analysisRunSearchId = post_params.get("analysisRunSearchId")
        # Generate search total
        search_params = {}
        search_params["type"] = ANALYSIS_RUN
        add_search_filters(search_params, filter, analysisRunSearchId)
        num_total_analysis_runs = search_total(context, request, search_params)

        # Generate search
        search_params = {}
        search_params["type"] = ANALYSIS_RUN
        search_params["limit"] = min(post_params.get("limit", LIMIT), LIMIT)
        search_params["from"] = post_params["from"]
        search_params["sort"] = f"-date_created"
        add_search_filters(search_params, filter, analysisRunSearchId)
        subreq = make_search_subreq(
            request, f"/search?{urlencode(search_params, True)}", inherit_user=True
        )
        search_res = search(context, subreq)["@graph"]

        analysis_runs = []

        for res in search_res:
            analysis_run = res
            # This determines the order of the MetaWorkflowRuns shown on the submission status page
            analysis_run["meta_workflow_runs"] = sorted(
                res.get("meta_workflow_runs", []),
                key=lambda d: d["date_created"],
                reverse=False,  # Oldest first
            )
            analysis_runs.append(analysis_run)

    except Exception as e:
        return {
            "error": f"Error when trying to get analysis runs: {e}",
        }

    return {
        "analysis_runs": analysis_runs,
        "total_analysis_runs": num_total_analysis_runs,
    }


def add_search_filters(search_params: dict, filter: dict, ar_accession: str):
    """Applies user specified filters to the analysis run search

    Args:
        search_params (dict): search parameters that will be passed to make_search_subreq. The dict is passed in by reference and updated in this function
        filter (dict): Contains keys (and values) to use as filter. Currently supported keys are:

        - include_tags
        - exlucde_tags,
        - donor,
        - tissue,
        - analysis_type,
        - fileSetSearchId (str): Accession of analysis run.
    """
    # Direct search by submitted_id takes precendence
    if ar_accession:
        search_params["accession"] = ar_accession
        return

    if not filter:
        return

    if "donor" in filter and filter["donor"] != "all":
        search_params["tissues.donor.display_title"] = filter["donor"]
    if "tissue" in filter and filter["tissue"] != "all":
        search_params["tissues.tissue_type"] = filter["tissue"]
    if "analysis_type" in filter and filter["analysis_type"] != "all":
        search_params["analysis_type"] = filter["analysis_type"]
    if filter.get("include_tags"):
        search_params["tags"] = filter["include_tags"]
    if filter.get("exclude_tags"):
        search_params["tags!"] = filter["exclude_tags"]
