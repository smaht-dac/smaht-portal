import pytest
from webtest.app import TestApp

from .utils import get_insert_identifier_for_item_type, get_item

QUALITY_METRIC_UUID = "c2fda3d3-6330-4a97-acfc-abb443440681"


@pytest.fixture
def quality_metric_generic(testapp: TestApp, test_consortium):
    item = {
        "uuid": QUALITY_METRIC_UUID,
        "qc_values": [
            {"key": "test",
             "value": "success"}
        ],
        "consortia": [
            test_consortium['uuid']
        ]
    }
    return testapp.post_json("/quality_metric", item, status=201).json[
        "@graph"
    ][0]


def test_qc_href(quality_metric_generic) -> None:
    href = quality_metric_generic["href"]
    expected = (
        f"/quality-metrics/{QUALITY_METRIC_UUID}/@@download"
        f"/{QUALITY_METRIC_UUID}"
    )
    assert href == expected


@pytest.mark.workbook
def test_coverage_calc_prop(es_testapp: TestApp, workbook: None) -> None:
    """Ensure the coverage calc prop works."""
    qm=get_item(
        es_testapp,
        "a975fc4b-c149-449f-891a-496e24767e42",
        collection='QualityMetric',
        frame="object"
    )
    assert qm.get("coverage","") == 26.32
    
