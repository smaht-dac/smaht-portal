import pytest
from webtest import TestApp

from .utils import get_item, get_insert_identifier_for_item_type


@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure submitted_id is resource path for external quality metric within
    ExternalQualityMetric collection and uuid is resource path within QualityMetric collection.
    """

    get_item(
        es_testapp,
        "TEST_EXTERNAL-QUALITY-METRIC_HELA-HEK293-VCF",
        collection="ExternalQualityMetric",
        status=301
    )
    uuid = get_insert_identifier_for_item_type(
        es_testapp,
        "ExternalQualityMetric"
    )
    get_item(
        es_testapp,
        uuid,
        collection="QualityMetric",
        status=301
    )
    get_item(
        es_testapp,
        "TEST_EXTERNAL-QUALITY-METRIC_HELA-HEK293-VCF",
        collection="QualityMetric",
        status=301,
        datastore="database"
    )
