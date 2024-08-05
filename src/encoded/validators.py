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
    if (submitted_id := request.GET.get("value")) and (submission_centers := request.GET.get("submission_centers")):
        # Note that passing submission_centers (the known/valid set of submission-center names, e.g. smaht_dac)
        # is done for more control and for performance so we don't have to get the set of submission centers here.
        submission_centers = [item.strip() for item in submission_centers.split(",")]
        result = validate_submitted_id(request, submitted_id=submitted_id, submission_centers=submission_centers)
        if result is None:
            status = "OK"
        elif (isinstance(error_detail := result.detail, dict) and 
              isinstance(error_description := error_detail.get("description"), str)):
            status = error_description
        else:
            status = str(result)
        return {"submitted_id": submitted_id, "status": status}
    return {}


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
