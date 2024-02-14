import pytest
from webtest.app import TestApp


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
