import pytest
from webtest.app import TestApp


pytestmark = [pytest.mark.setone, pytest.mark.working, pytest.mark.schema]


@pytest.fixture
def google_analytics_tracking_data():
    return {
        "status": "released",
        "tracking_type": "google_analytics",
        "google_analytics": {
            "reports": {
                "fields_faceted": [
                    {
                        "unique_users": 1,
                        "sessions": 3,
                        "field": "type",
                        "total_events": 6
                    },
                    {
                        "users": 1,
                        "sessions": 1,
                        "field": "file_sets.assay.display_title",
                        "total_events": 1
                    }
                ],
                "views_by_file": [
                    {
                        "file_item_id": "/output-files/74523dca-9230-49d8-a07e-b7852e052716/",
                        "file_title": "SMHTCOLO829BL-X-X-M45-C005-uwsc-SMAFIPVP9ZN6-sentieon_bwamem_202308.01_GRCh38.aligned.sorted.bam",
                        "generated_by": "(not set)",
                        "total_files": 0,
                        "list_views": 2,
                        "list_clicks": 0,
                        "detail_views": 4,
                        "item_type_1": "OutputFile"
                    }
                ]
            },
            "for_date": "2023-12-19",
            "date_increment": "daily"
        }
    }


@pytest.fixture
def google_analytics(testapp: TestApp, google_analytics_tracking_data):
    return testapp.post_json('/tracking_item', google_analytics_tracking_data).json['@graph'][0]


def test_tracking_item_display_title_google_analytic(google_analytics):
    assert google_analytics.get('display_title') == 'Google Analytics for 2023-12-19'
