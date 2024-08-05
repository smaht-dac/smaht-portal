from pyramid.view import view_config
from snovault.util import debug_log
from encoded.types.submitted_item import validate_submitted_id

# Module with custom validators exposed as APIs.
# First used for submitted_id validation for smaht-submitr.

def includeme(config):
    config.add_route("validators", "/validators/{validator}")
    config.scan(__name__)


def _validators_submitted_id(context, request):
    """
    Given 'value' and 'submission_centers' arguments, returns a dictionary with an indication
    of whether or not the value which represents a submitted_id is of valid format, asssuming
    that submission_centers contains the comma-separated list of known submission center names,
    e.g. washu_gcc. If the submitted_id is valid then returns something like:

    {"submitted_id": "BCM_SOFTWARE_LIMA", "status": "OK"}

    If the submitted_id is not valid then returns something like:

    {"submitted_id": "XYZ_SOFTWARE_LIMA",
     "status": "Submitted ID BCM_SOFTWARE_LIMA start (XYZ) does not match options for submission centers: ['DAC', 'WASHU']"}
    """
    EFFECTIVE_PRINCIPALS_SUBMITS_FOR_PREFIX = "submits_for."
    STATUS_OK = "OK"
    if submitted_id := request.GET.get("value"):
        if (submission_centers := request.GET.get("submission_centers")):
            # Allow passing in just in case we need it.
            submission_centers = [item.strip() for item in submission_centers.split(",")]
        elif "group.admin" in request.effective_principals:
            # For admin users we let anything be valid.
            return {"submitted_id": submitted_id, "status": STATUS_OK}
        elif (isinstance(request.effective_principals, list) and
              (submits_for := [item[len(EFFECTIVE_PRINCIPALS_SUBMITS_FOR_PREFIX):]
                               for item in request.effective_principals
                               if item.startswith(EFFECTIVE_PRINCIPALS_SUBMITS_FOR_PREFIX)])):
            # Common case: Look for effective_principals list for "submits_for.{submission_center_uuid}". 
            submission_centers = _lookup_submission_center_codes(request, submits_for)
        else:
            submission_centers = []
        result = validate_submitted_id(request, submitted_id=submitted_id, submission_centers=submission_centers)
        if result is None:
            status = STATUS_OK
        elif (isinstance(error_detail := result.detail, dict) and 
              isinstance(error_description := error_detail.get("description"), str)):
            status = error_description
        else:
            status = str(result)
        return {"submitted_id": submitted_id, "status": status}
    return {}


def _lookup_submission_center_codes(request, submission_centers):
    submission_center_codes = []
    for submission_center in submission_centers:
        # TODO: Do we need an as_user="INGESTION" argument or something with the request.embed call below?
        if submission_center := request.embed(f"/submission-centers/{submission_center}"):
            if submission_center_code := submission_center.get("identifier"):
                submission_center_codes.append(submission_center_code)
        pass
    return submission_center_codes


_VALIDATORS = {
    "submitted_id": _validators_submitted_id
}

@view_config(route_name="validators", request_method=["GET"])
@debug_log
def validators(context, request):
    if value := request.matchdict.get("validator"):
        if validator := _VALIDATORS.get(value):
            return validator(context, request)
    return {}
