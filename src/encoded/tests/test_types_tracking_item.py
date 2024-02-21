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
                        "ga:users": 1,
                        "ga:sessions": 3,
                        "ga:dimension3": "type",
                        "ga:totalEvents": 6
                    },
                    {
                        "ga:users": 1,
                        "ga:sessions": 1,
                        "ga:dimension3": "file_sets.assay.display_title",
                        "ga:totalEvents": 1
                    }
                ],
                "views_by_file": [
                    {
                        "ga:productSku": "/output-files/74523dca-9230-49d8-a07e-b7852e052716/",
                        "ga:productName": "SMHTCOLO829BL-X-X-M45-C005-uwsc-SMAFIPVP9ZN6-sentieon_bwamem_202308.01_GRCh38.aligned.sorted.bam",
                        "ga:productBrand": "(not set)",
                        "ga:uniquePurchases": 0,
                        "ga:productListViews": 2,
                        "ga:productListClicks": 0,
                        "ga:productDetailViews": 4,
                        "ga:productCategoryLevel2": "OutputFile"
                    }
                ]
            },
            "for_date": "2023-12-19",
            "date_increment": "daily"}
    }


@pytest.fixture
def google_analytics(testapp: TestApp, google_analytics_tracking_data):
    return testapp.post_json('/tracking_item', google_analytics_tracking_data).json['@graph'][0]


def test_tracking_item_display_title_google_analytic(google_analytics):
    assert google_analytics.get('display_title') == 'Google Analytics for 2023-12-19'
