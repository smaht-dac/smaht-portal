from typing import Any, Dict


import pytest
from webtest.app import TestApp

from .utils import patch_item

#use workbook inserts of three categories and patch

@pytest.pmark.workbook
@pytest.mark.parametrize(
    "tissue_sample_item,expected_status",
    [
        ({"uuid": "a311f4f4-5bbb-4be7-975a-f5b7ec7585bc",
          "patch_body": {"category": "Homogenate"},
          },422),
        ({"uuid": "0ba2e5f8-7461-4536-9162-35970477f5bd",
          "patch_body": {"category": "Core"},
          },422),
        ({"uuid": "9da7f4fd-0ac2-4561-ae30-4766138c578",
          "patch_body": {"category": "Specimen"},
          },422),
        ({"uuid": "a311f4f4-5bbb-4be7-975a-f5b7ec7585bc",
          "patch_body": {"category": "Core"},
          },200),
        ({"uuid": "0ba2e5f8-7461-4536-9162-35970477f5bd",
          "patch_body": {"category": "Specimen"},
          },200),
        ({"uuid": "9da7f4fd-0ac2-4561-ae30-4766138c578",
          "patch_body": { "category": "Homogenate"},
          },200),
    ]
)
def test_tissue_sample_compatible_category(
    tissue_sample_item: Dict[str, Any], expected_status: int, es_testapp: TestApp, workbook: None
) -> None:
    """Ensure mutual requirements for tissue sample external ID and category."""
    uuid=tissue_sample_item["uuid"]
    patch_body=tissue_sample_item["patch_body"]
    patch_item(
        es_testapp,
        patch_body,
        uuid,
        status=expected_status,
    )

# [A-F][1-6] "Core"
# Core ID for the core: ID is comprised of a letter between A–F
#, followed by a digit between 1–6 (ID is associated with the
# spatial information of the grid, representing a series of 
#cores taken from a tissue aliquot - See Figure 1). 
## [S-W][1-9] "Specimen"
# Core ID for the tissue specimen: ID is comprised of a letter 
#between S-W followed by 1–9 (no spatial information associated
#with the ID).
# X "Homogenate"
# Core ID for the homogenate benchmarking tissues: Null value 
#for the ID, i.e., “X”.