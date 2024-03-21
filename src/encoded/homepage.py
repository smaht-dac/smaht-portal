from pyramid.view import view_config
from snovault.util import debug_log
from dcicutils.misc_utils import ignored


import structlog


log = structlog.getLogger(__name__)


def includeme(config):
    config.add_route('home', '/home')
    config.scan(__name__)


@view_config(route_name='home', request_method=['GET'])
@debug_log
def home(context, request):
    ignored(context), ignored(request)
    static_response = {
        '@graph': [
            {
                "title": "Tier 0: Benchmarking",
                "subtitle": "with all technologies",
                "categories": [
                    {
                        "title": "COLO829 Cell Line",
                        "link": "/data/benchmarking/COLO829#main",
                        "figures": [
                            { "value": 2, "unit": "Cell Lines" },
                            { "value": 3, "unit": "Assays" },
                            { "value": 30, "unit": "Files Generated" }
                        ]
                    },
                    {
                        "title": "HapMap Cell Line",
                        "link": "/data/benchmarking/HapMap#main",
                        "figures": [
                            { "value": 6, "unit": "Cell Lines" },
                            { "value": 0, "unit": "Assays" },
                            { "value": 0, "unit": "Files Generated" }
                        ]
                    },
                    {
                        "title": "iPSC & Fibroblasts",
                        "link": "/data/benchmarking/iPSC-fibroblasts#main",
                        "figures": [
                            { "value": 5, "unit": "Cell Lines" },
                            { "value": 0, "unit": "Assays" },
                            { "value": 0, "unit": "Files Generated" }
                        ]
                    },
                    {
                        "title": "Benchmarking Tissues",
                        "link": "/data/benchmarking/lung#main",
                        "figures": [
                            { "value": 0, "unit": "Donors" },
                            { "value": 0, "unit": "Tissue Types" },
                            { "value": 0, "unit": "Assays" },
                            { "value": 0, "unit": "Files Generated" }
                        ]
                    }
                ]
            },
            {
                "title": "Tier 1",
                "subtitle": "with core + additional technologies",
                "categories": [
                    {
                        "title": "Primary Tissues",
                        "figures": [
                            { "value": 0, "unit": "Donors" },
                            { "value": 0, "unit": "Tissue Types" },
                            { "value": 0, "unit": "Assays" },
                            { "value": 0, "unit": "Files Generated" }
                        ]
                    }
                ]
            },
            {
                "title": "Tier 2",
                "subtitle": "with core technologies",
                "categories": [
                    {
                        "title": "Primary Tissues",
                        "figures": [
                            { "value": 0, "unit": "Donors" },
                            { "value": 0, "unit": "Tissue Types" },
                            { "value": 0, "unit": "Assays" },
                            { "value": 0, "unit": "Files Generated" }
                        ]
                    }
                ]
            }
        ]
    }
    return static_response
