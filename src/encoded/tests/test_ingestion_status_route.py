"""
Regression test for the `ingestion_status` Pyramid route-name collision.

Snovault's ingestion listener (`snovault.ingestion.ingestion_listener.includeme`) registers a
queue-health endpoint under the Pyramid route name `ingestion_status` at `/ingestion_status`.
SMaHT's `encoded.ingestion.ingestion_status` module previously reused that same route name for
its unrelated Redis-backed per-submission endpoint at `/ingestion-status/{submission_uuid}`.
Because Pyramid route names must be unique, the later registration silently displaced Snovault's
route from the mapper, leaving `/ingestion_status` returning 404.

This test builds a bare Pyramid application that mirrors the real registration order (Snovault's
route registered first, then SMaHT's `ingestion_status` module included) without pulling in the
full snovault app/DB/ES fixture stack, and proves both routes coexist in the mapper and are both
independently reachable over HTTP.
"""

from unittest import mock

import webtest
from pyramid.config import Configurator
from pyramid.interfaces import IRoutesMapper
from pyramid.renderers import JSON

from encoded.ingestion.ingestion_status import includeme as include_smaht_ingestion_status
from encoded.ingestion.ingestion_status_cache import IngestionStatusCache

SNOVAULT_INGESTION_STATUS_ROUTE_NAME = "ingestion_status"
SNOVAULT_INGESTION_STATUS_PATH = "/ingestion_status"
SNOVAULT_QUEUE_HEALTH_RESPONSE = {"title": "Ingestion Queue", "waiting": 0, "inflight": 0}

SOME_SUBMISSION_UUID = "12345678-1234-1234-1234-123456789012"
SOME_PROGRESS_RESPONSE = {"done": True}


def _snovault_queue_health_view(request):
    """Stand-in for the real Snovault view at snovault/ingestion/ingestion_listener.py."""
    return SNOVAULT_QUEUE_HEALTH_RESPONSE


def _build_test_app():
    config = Configurator()
    config.testing_securitypolicy(userid="testuser", permissive=True)
    # Matches snovault.json_renderer.includeme, which registers a JSON renderer as the
    # application default so plain-dict view returns (as used by both endpoints) serialize.
    config.add_renderer(None, JSON())

    # Mirrors snovault.ingestion.ingestion_listener.includeme, which registers this route
    # first, before SMaHT's ingestion module is included. The intervening commit() mirrors
    # src/encoded/__init__.py's include_snovault(config); config.commit() staging, which is
    # what let SMaHT's later same-named route silently displace this one instead of raising
    # a Pyramid ConfigurationConflictError.
    config.add_route(SNOVAULT_INGESTION_STATUS_ROUTE_NAME, SNOVAULT_INGESTION_STATUS_PATH)
    config.add_view(_snovault_queue_health_view, route_name=SNOVAULT_INGESTION_STATUS_ROUTE_NAME,
                     permission="index")
    config.commit()

    include_smaht_ingestion_status(config)
    config.commit()

    return config


def test_smaht_ingestion_status_route_does_not_shadow_snovault_route():
    config = _build_test_app()

    mapper = config.registry.queryUtility(IRoutesMapper)
    routes_by_name = {route.name: route.pattern for route in mapper.get_routes()}

    assert routes_by_name[SNOVAULT_INGESTION_STATUS_ROUTE_NAME] == SNOVAULT_INGESTION_STATUS_PATH
    assert routes_by_name["submission_ingestion_status"] == "/ingestion-status/{submission_uuid}"


def test_snovault_ingestion_status_endpoint_is_reachable():
    config = _build_test_app()
    test_app = webtest.TestApp(config.make_wsgi_app())

    response = test_app.get(SNOVAULT_INGESTION_STATUS_PATH)

    assert response.json == SNOVAULT_QUEUE_HEALTH_RESPONSE


def test_smaht_ingestion_status_endpoint_is_still_reachable():
    config = _build_test_app()
    test_app = webtest.TestApp(config.make_wsgi_app())

    with mock.patch.object(IngestionStatusCache, "connection") as mock_connection:
        mock_connection.return_value.get.return_value = SOME_PROGRESS_RESPONSE

        response = test_app.get(f"/ingestion-status/{SOME_SUBMISSION_UUID}")

    assert response.json == SOME_PROGRESS_RESPONSE
    mock_connection.assert_called_once()
    assert mock_connection.call_args.args[0] == SOME_SUBMISSION_UUID
