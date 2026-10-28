import json
import os

import pytest

from encoded.somatic_variant_browser import (
    HG38_CHROMSIZES_UID,
    HG38_GENES_UID,
    HIGLASS_SERVER,
    build_default_viewconf,
)

pytestmark = [pytest.mark.working]

ENDPOINT = "/get_somatic_variant_browser_config/"
HIGLASS_SCHEMA_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "node_modules", "higlass", "app", "schema.json"
)


def test_build_default_viewconf_uses_hg38_reference_tracks():
    viewconf = build_default_viewconf()
    assert len(viewconf["views"]) == 1
    view = viewconf["views"][0]
    top_tracks = {track["type"]: track for track in view["tracks"]["top"]}
    assert top_tracks["horizontal-chromosome-labels"]["tilesetUid"] == HG38_CHROMSIZES_UID
    assert top_tracks["horizontal-gene-annotations"]["tilesetUid"] == HG38_GENES_UID
    assert all(track["server"] == HIGLASS_SERVER for track in top_tracks.values())
    assert view["genomePositionSearchBox"]["chromInfoId"] == "hg38"
    assert view["tracks"]["center"] == []


def test_build_default_viewconf_matches_higlass_schema():
    if not os.path.exists(HIGLASS_SCHEMA_PATH):
        pytest.skip("higlass npm package is not installed")
    jsonschema = pytest.importorskip("jsonschema")
    with open(HIGLASS_SCHEMA_PATH) as f:
        schema = json.load(f)
    jsonschema.validate(build_default_viewconf(), schema)


def test_get_somatic_variant_browser_config_admin(testapp):
    res = testapp.post_json(ENDPOINT, {}, status=200).json
    assert res["error"] is False
    assert res["data"]["viewconf"] == build_default_viewconf()


def test_get_somatic_variant_browser_config_consortium_member(consortium_user_app):
    res = consortium_user_app.post_json(ENDPOINT, {}, status=200).json
    assert res["error"] is False
    assert "viewconf" in res["data"]


def test_get_somatic_variant_browser_config_submission_center_member(submission_center_user_app):
    res = submission_center_user_app.post_json(ENDPOINT, {}, status=200).json
    assert res["error"] is False


def test_get_somatic_variant_browser_config_without_body(testapp):
    res = testapp.post(ENDPOINT, "", content_type="application/json", status=200).json
    assert res["error"] is False


def test_get_somatic_variant_browser_config_rejects_non_object_body(testapp):
    res = testapp.post_json(ENDPOINT, [1, 2], status=400).json
    assert res["error"] is True
    assert res["data"] is None


def test_get_somatic_variant_browser_config_anonymous(anontestapp):
    res = anontestapp.post_json(ENDPOINT, {}, status=403).json
    assert res["error"] is True
    assert res["data"] is None


def test_get_somatic_variant_browser_config_unassociated_user(unassociated_user_app):
    res = unassociated_user_app.post_json(ENDPOINT, {}, status=403).json
    assert res["error"] is True
