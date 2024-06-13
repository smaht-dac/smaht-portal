from typing import Any, Dict
import pytest
from webtest.app import TestApp

from .utils import (
    get_insert_identifier_for_item_type,
)


@pytest.mark.workbook
def test_cool_uuid(es_testapp: TestApp,
                   workbook: None,
) -> None:
    """Tests cool uuid view"""
    item_type="User"
    uuid = get_insert_identifier_for_item_type(es_testapp,item_type)
    url = f"/users/{uuid}/@@cool"
    response = es_testapp.get(url, status=200)
    validation = "Cool-"+uuid == response.json['@graph']['body']
    assert validation

