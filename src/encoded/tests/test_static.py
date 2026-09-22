import json
import os
import re
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


# ---------------------------------------------------------------------------
# Docker base-image contract
#
# Debian 11 bullseye LTS ended 2026-08-31. Past that date bullseye-security kept
# publishing an index advertising package versions whose .deb files had been pruned
# from the pool, so a clean-cache `docker build` failed with apt 404s (exit 100) in
# BOTH stages -- a condition no pin, retry, or mirror can fix. These checks keep the
# image off a base in that state and keep the nginx install script on the SAME Debian
# release as the base image, since a mismatched pair silently reintroduces the
# unavailable-artifact failure by pointing apt at another release's suite.
# ---------------------------------------------------------------------------

# Debian releases whose free security support (including Debian LTS) has ended. A base
# image on one of these cannot be relied on to serve the packages its index lists.
# Add to this list as releases go EOL; see https://wiki.debian.org/LTS.
END_OF_LIFE_DEBIAN_CODENAMES = frozenset({
    "jessie",     # LTS ended 2020-06-30
    "stretch",    # LTS ended 2022-06-30
    "buster",     # LTS ended 2024-06-30
    "bullseye",   # LTS ended 2026-08-31
})


def _dockerfile_text():
    with open(os.path.join(REPOSITORY_ROOT_DIR, "Dockerfile")) as fp:
        return fp.read()


def _base_image_codename(dockerfile):
    """The Debian codename of the Dockerfile's default BASE_IMAGE (e.g. 'bookworm')."""
    match = re.search(r"^ARG BASE_IMAGE=(?P<image>\S+)\s*$", dockerfile, re.M)
    assert match, "Dockerfile must declare a default `ARG BASE_IMAGE=...`"
    image = match.group("image")
    codename = re.search(r"-slim-(?P<codename>[a-z]+)$", image)
    assert codename, f"BASE_IMAGE {image!r} is not a recognized Debian slim tag"
    return codename.group("codename")


def _nginx_install_script(dockerfile):
    """Path and text of the nginx install script the runtime stage actually COPYs in."""
    match = re.search(
        r"^COPY (?P<path>\S*install_nginx\S*\.sh) /install_nginx\.sh\s*$", dockerfile, re.M
    )
    assert match, "Dockerfile must COPY exactly one nginx install script to /install_nginx.sh"
    path = match.group("path")
    with open(os.path.join(REPOSITORY_ROOT_DIR, path)) as fp:
        return path, fp.read()


@pytest.mark.static
def test_docker_base_image_is_not_end_of_life_debian():
    codename = _base_image_codename(_dockerfile_text())
    assert codename not in END_OF_LIFE_DEBIAN_CODENAMES, (
        f"Dockerfile BASE_IMAGE is on Debian {codename}, whose security support has ended."
        " A clean-cache build will fail fetching packages its own apt index still lists."
        " Move the base image to a supported Debian release."
    )


@pytest.mark.static
def test_nginx_install_script_matches_base_image_release():
    """The nginx script's apt suite must match the base image's Debian release."""
    dockerfile = _dockerfile_text()
    codename = _base_image_codename(dockerfile)
    path, script = _nginx_install_script(dockerfile)

    assert codename in os.path.basename(path), (
        f"{path} is named for a different Debian release than the {codename} base image;"
        " rename it so the pairing stays obvious."
    )

    pkg_release = re.search(r"^export PKG_RELEASE=1~(?P<codename>[a-z]+)\s*$", script, re.M)
    assert pkg_release, f"{path} must export a PKG_RELEASE of the form 1~<codename>"
    assert pkg_release.group("codename") == codename, (
        f"{path} pins nginx packages for Debian {pkg_release.group('codename')} but the base"
        f" image is {codename}; those packages will not resolve."
    )

    # Every nginx.org apt suite the script configures must be the base image's release.
    suites = re.findall(r"https://nginx\.org/packages/\S*debian/ (?P<codename>[a-z]+) nginx", script)
    assert suites, f"{path} must configure at least one nginx.org apt source"
    assert set(suites) == {codename}, (
        f"{path} points apt at nginx.org suites {sorted(set(suites))}, expected only {codename!r}"
    )


@pytest.mark.static
def test_nginx_install_script_verifies_repository_signature():
    """The remote nginx.org repository must be signature-verified, never `trusted=yes`.

    A `trusted=yes` remote source disables signature verification, so a hijacked mirror
    or DNS answer could install arbitrary packages into the production image. The one
    permitted `trusted=yes` is the LOCAL file:// repo of .deb packages the non-amd64/arm64
    branch builds from nginx.org SOURCE packages that apt already verified.
    """
    _, script = _nginx_install_script(_dockerfile_text())

    for line in script.splitlines():
        if "trusted=yes" in line and not line.lstrip().startswith("#"):
            assert "file://" in line, (
                "nginx install script disables apt signature verification on a remote"
                f" source: {line.strip()!r}"
            )

    for source_line in re.findall(r'echo "deb(?:-src)? \[[^]]*\] https://nginx\.org\S*[^"]*"', script):
        assert "signed-by=" in source_line, (
            f"nginx.org apt source is not signature-verified: {source_line!r}"
        )
