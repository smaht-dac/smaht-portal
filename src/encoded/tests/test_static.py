import json
import os
import pytest

from dcicutils.qa_checkers import ChangeLogChecker, DebuggingArtifactChecker
from .conftest_settings import REPOSITORY_ROOT_DIR


@pytest.mark.static
def test_changelog_consistency():

    class MyAppChangeLogChecker(ChangeLogChecker):
        PYPROJECT = os.path.join(REPOSITORY_ROOT_DIR, "pyproject.toml")
        CHANGELOG = os.path.join(REPOSITORY_ROOT_DIR, "CHANGELOG.rst")

    MyAppChangeLogChecker.check_version()


@pytest.mark.static
def test_utils_debugging_artifacts_pdb():
    checker = DebuggingArtifactChecker(sources_subdir="src/encoded",
                                       skip_files="(tests/data)",
                                       filter_patterns=['pdb'])
    checker.check_for_debugging_patterns()


@pytest.mark.static
def test_utils_debugging_artifacts_print():
    checker = DebuggingArtifactChecker(sources_subdir="src/encoded",
                                       skip_files="encoded/(commands|tests)/",
                                       filter_patterns=['print'],
                                       if_used='warning')
    checker.check_for_debugging_patterns()


def test_update_references():
    """ Checks all types files for references to add_last_modified
        if an _update method is defined
    """
    path = os.path.dirname(__file__)
    for root, dirs, files in os.walk(f'{path}/../types'):
        for file in files:
            if file.endswith(".py"):
                file_path = os.path.join(root, file)
                with open(file_path, "r") as f:
                    content = f.readlines()
                    for i, line in enumerate(content):
                        if "def _update(" in line:
                            for nearby_line in content[max(0, i - 10):i + 10]:
                                if "add_last_modified" in nearby_line:
                                    break
                            else:
                                raise Exception(f'add_last_modified not found in {file_path}')


def _data_matrix_cache_signature(state, session=None):
    query = state.get("query") or {}
    return json.dumps({
        "session": session or None,
        "baseUrl": query.get("url") or None,
        "facetHref": state.get("facetNavigationHref") or None,
        "columnAggFields": query.get("columnAggFields") or None,
        "rowAggFields": query.get("rowAggFields") or None,
        "columnGrouping": state.get("columnGrouping") or None,
        "groupingProperties": state.get("groupingProperties") or None,
        "fieldChangeMap": state.get("fieldChangeMap") or None,
        "showColumnSummary": state.get("showColumnSummary") or None,
    })


def _legacy_data_matrix_cache_signature(state, session=None):
    query = state.get("query") or {}
    return json.dumps({
        "session": session or None,
        "baseUrl": query.get("url") or None,
        "facetHref": state.get("facetNavigationHref") or None,
        "fieldChangeMap": state.get("fieldChangeMap") or None,
        "showColumnSummary": state.get("showColumnSummary") or None,
    })


@pytest.mark.static
def test_data_matrix_tab_cache_signature_includes_request_shape():
    data_matrix_path = os.path.join(
        REPOSITORY_ROOT_DIR,
        "src/encoded/static/components/viz/Matrix/DataMatrix.js",
    )
    with open(data_matrix_path) as data_matrix_file:
        data_matrix_source = data_matrix_file.read()

    signature_method_start = data_matrix_source.index("    getTabCacheSignature() {")
    signature_method_end = data_matrix_source.index(
        "    /**\n     * Explicit refresh",
        signature_method_start,
    )
    signature_method = data_matrix_source[signature_method_start:signature_method_end]
    for request_shape_field in (
        "columnAggFields",
        "rowAggFields",
        "columnGrouping",
        "groupingProperties",
    ):
        assert request_shape_field in signature_method

    base_tissue_assay_files_state = {
        "query": {
            "url": "/data_matrix_aggregations/?type=File&status=open&limit=all",
            "columnAggFields": ["assays.display_title", "sequencers.platform"],
            "rowAggFields": ["sample_summary.tissues", "sample_summary.category"],
        },
        "facetNavigationHref": None,
        "fieldChangeMap": {
            "assay": "assays.display_title",
            "donor": "donors.display_title",
            "tissue": "sample_summary.tissues",
            "germLayer": "sample_summary.category",
            "platform": "sequencers.platform",
        },
        "showColumnSummary": True,
        "groupingProperties": ["tissue"],
        "columnGrouping": "assay",
    }
    tissue_assay_donors_state = {
        **base_tissue_assay_files_state,
        "query": {
            **base_tissue_assay_files_state["query"],
            "rowAggFields": [
                "donors.display_title",
                "sample_summary.tissues",
                "sample_summary.category",
            ],
        },
    }

    assert (
        _legacy_data_matrix_cache_signature(base_tissue_assay_files_state)
        == _legacy_data_matrix_cache_signature(tissue_assay_donors_state)
    )
    assert (
        _data_matrix_cache_signature(base_tissue_assay_files_state)
        != _data_matrix_cache_signature(tissue_assay_donors_state)
    )

    tab_cache = {
        "tissue_assay": {
            "signature": _data_matrix_cache_signature(tissue_assay_donors_state)
        },
        "donor_assay": {
            "signature": _data_matrix_cache_signature({
                **tissue_assay_donors_state,
                "query": {
                    **tissue_assay_donors_state["query"],
                    "rowAggFields": [
                        "donors.display_title",
                        "sample_summary.tissues",
                        "sample_summary.category",
                    ],
                },
                "groupingProperties": ["donor", "tissue"],
            })
        },
        "donor_tissue": {
            "signature": _data_matrix_cache_signature({
                **tissue_assay_donors_state,
                "query": {
                    **tissue_assay_donors_state["query"],
                    "columnAggFields": ["sample_summary.tissues"],
                    "rowAggFields": [
                        "donors.display_title",
                        "sample_summary.category",
                    ],
                },
                "groupingProperties": ["donor"],
                "columnGrouping": "tissue",
            })
        },
    }
    assert tab_cache["tissue_assay"]["signature"] == _data_matrix_cache_signature(
        tissue_assay_donors_state
    )
    assert "this.tabCache[this.state.matrixMode]" in data_matrix_source
    assert "this.tabCache[matrixMode]" in data_matrix_source
