from pyramid.view import view_config
from snovault.util import debug_log
from encoded.types.submitted_item import validate_submitted_id

# Module with custom validators exposed as APIs.
# First used for submitted_id validation for smaht-submitr.

def includeme(config):
    config.add_route("validators", "/validators/{validator}/{value}")
    config.scan(__name__)


def _validator_submitted_id(context, request, value):
    """
    Assuming the given value argument is a submitted_id, returns a dictionary with an indication of
    whether or not it is of valid format. An optional request submission_centers argument may be given
    representing a comma-separated list of submission center names (e.g. washu_gcc) which are allowed
    to be represented within the submitted_id; if this is NOT given then the submission centers are
    obtained from the effective_principals for the user of the request; UNLESS the user has admin
    priviliges in which case we say that the given submitted_id is valid regardless of its format.
    If the submitted_id is valid then returns something like this:

      {"submitted_id": "BCM_SOFTWARE_LIMA", "status": "OK"}

    If the submitted_id is not valid then returns something like this:

      {"submitted_id": "XYZ_SOFTWARE_LIMA",
       "status": "Submitted ID BCM_SOFTWARE_LIMA start (XYZ) does not match options for submission centers: ['DAC', 'WASHU']"}

    """
    EFFECTIVE_PRINCIPALS_SUBMITS_FOR_PREFIX = "submits_for."
    STATUS_OK = "OK"
    if submitted_id := value:
        if (submission_centers := request.GET.get("submission_centers")):
            # Allow passing in submission_centers just in case we need it explicit control.
            submission_centers = [item.strip() for item in submission_centers.split(",")]
        elif "group.admin" in request.effective_principals:
            # For admin users we let anything be valid. Not 100% technically correct; really should
            # be using the list of ALL known submission centers; but will get checked later for real
            # during server-side validation (for our smaht-submitr use-case); and (described above)
            # we can also explicitly pass in submission_centers as the allowed list.
            return {"submitted_id": submitted_id, "status": STATUS_OK}
        elif (isinstance(request.effective_principals, list) and
              (submits_for := [item[len(EFFECTIVE_PRINCIPALS_SUBMITS_FOR_PREFIX):]
                               for item in request.effective_principals
                               if item.startswith(EFFECTIVE_PRINCIPALS_SUBMITS_FOR_PREFIX)])):
            # Common case: Get the list of allowed submission centers by looking at
            # the effective_principals list for "submits_for.{submission_center_uuid}". 
            submission_centers = _lookup_submission_center_codes(request, submits_for)
        else:
            submission_centers = []
        # Call the real custom validator in submitted_item.py.
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
    return submission_center_codes


# Names of validators; i.e. the {validator} part of the endpoint /validators/{validator}.
_VALIDATORS = {
    "submitted_id": _validator_submitted_id
}

@view_config(route_name="validators", request_method=["GET"])
@debug_log
def validators(context, request):
    if (validator := request.matchdict.get("validator")) and (validator := _VALIDATORS.get(validator)):
        return validator(context, request, request.matchdict.get("value"))
    return {}
