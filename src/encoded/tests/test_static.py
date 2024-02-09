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
