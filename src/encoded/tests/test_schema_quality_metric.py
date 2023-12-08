from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item


@pytest.fixture
def quality_metric(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "consortia": [test_consortium["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "category": "Testing",
        "qc_values": [
            {
                "key": "some_qc_metric",
                "value": "22",
                "visible": True,
                "flag": "Pass",
                "derived_from": "some_identifier",
                "tooltip": "A helpful message explaining this value",
            }
        ],
        "overall_quality_status": "Pass",
        "url": "https://foo.bar",
    }
    return post_item(testapp, item, "QualityMetric")


def test_quality_metric_post(quality_metric: Dict[str, Any]) -> None:
    """Ensure QualityMetric properties POST."""
    pass
