from pyramid.view import view_config
from snovault.util import debug_log

# Public HiGlass server providing the hg38 reference tracks
HIGLASS_SERVER = "https://higlass.io/api/v1"
HG38_CHROMSIZES_UID = "NyITQvZsS_mOFNlz5C2LJg"
HG38_GENES_UID = "P0PLbQMwTYGy-5uPIQid7A"
HG38_GENOME_LENGTH = 3_100_000_000

CONSORTIUM_MEMBER_PRINCIPAL = "role.consortium_member_rw"


def includeme(config):
    config.add_route(
        "get_somatic_variant_browser_config", "/get_somatic_variant_browser_config/"
    )
    config.scan(__name__)


def _user_is_consortium_member(request):
    """Mirrors the 'protected-network' page ACL: admins, submission center and consortium members."""
    for principal in request.effective_principals:
        if principal == "group.admin" or principal.startswith(CONSORTIUM_MEMBER_PRINCIPAL):
            return True
    return False


def build_default_viewconf():
    """Returns a HiGlass view config showing an empty hg38 genome browser."""
    return {
        "editable": False,
        "zoomFixed": False,
        "trackSourceServers": [HIGLASS_SERVER],
        "views": [
            {
                "uid": "somatic-variant-browser",
                "initialXDomain": [0, HG38_GENOME_LENGTH],
                "genomePositionSearchBoxVisible": True,
                "genomePositionSearchBox": {
                    "autocompleteServer": HIGLASS_SERVER,
                    "autocompleteId": HG38_GENES_UID,
                    "chromInfoServer": HIGLASS_SERVER,
                    "chromInfoId": "hg38",
                    "visible": True,
                },
                "tracks": {
                    "top": [
                        {
                            "uid": "hg38-chromosome-labels",
                            "type": "horizontal-chromosome-labels",
                            "server": HIGLASS_SERVER,
                            "tilesetUid": HG38_CHROMSIZES_UID,
                            "height": 30,
                            "options": {},
                        },
                        {
                            "uid": "hg38-gene-annotations",
                            "type": "horizontal-gene-annotations",
                            "server": HIGLASS_SERVER,
                            "tilesetUid": HG38_GENES_UID,
                            "height": 90,
                            "options": {
                                "name": "Gene Annotations (hg38)",
                                "fontSize": 10,
                                "labelPosition": "hidden",
                                "plusStrandColor": "blue",
                                "minusStrandColor": "red",
                                "trackBorderWidth": 0,
                                "showMousePosition": True,
                            },
                        },
                    ],
                    "left": [],
                    "center": [],
                    "right": [],
                    "bottom": [],
                    "whole": [],
                    "gallery": [],
                },
                "layout": {"w": 12, "h": 6, "x": 0, "y": 0},
            }
        ],
        "zoomLocks": {"locksByViewUid": {}, "locksDict": {}},
        "locationLocks": {"locksByViewUid": {}, "locksDict": {}},
        "valueScaleLocks": {"locksByViewUid": {}, "locksDict": {}},
    }


@view_config(route_name="get_somatic_variant_browser_config", request_method="POST")
@debug_log
def get_somatic_variant_browser_config(context, request):
    """Returns the HiGlass view config for the Somatic Variant Browser page.

    The JSON body is reserved for selecting datasets; currently the default hg38 view is returned.
    """
    response = {"error": True, "error_msg": "", "data": None}

    if not _user_is_consortium_member(request):
        request.response.status_code = 403
        response["error_msg"] = "User does not have access to the Somatic Variant Browser."
        return response

    try:
        params = request.json_body if request.body else {}
    except ValueError:
        request.response.status_code = 400
        response["error_msg"] = "Request body must be valid JSON."
        return response
    if not isinstance(params, dict):
        request.response.status_code = 400
        response["error_msg"] = "Request body must be a JSON object."
        return response

    response["data"] = {"viewconf": build_default_viewconf()}
    response["error"] = False
    return response
