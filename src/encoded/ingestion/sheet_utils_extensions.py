from contextlib import contextmanager
import shutil
import tempfile
import zipfile
from dcicutils.misc_utils import VirtualApp
from dcicutils.sheet_utils import InsertsDirectoryItemManager, load_items


def load_data_via_sheet_utils(data_file_name: str, portal_vapp: VirtualApp) -> dict[str, list[dict]]:
    if data_file_name.endswith(".zip"):
        # TODO: Note that sheet_utils does not yet support zip files so we do it here.
        with _unzip_into_directory(data_file_name) as data_directory:
            # TODO: Want to pass a portal_vapp to get schemas but not yet supported by sheet_utils.
            return InsertsDirectoryItemManager(filename=data_directory).load_content()
    else:
        return load_items(data_file_name, portal_vapp=portal_vapp)


@contextmanager
def _unzip_into_directory(zip_file_name: str) -> str:
    with zipfile.ZipFile(zip_file_name, "r") as zf:
        try:
            tmp_directory = tempfile.mkdtemp()
            zf.extractall(tmp_directory)
            yield tmp_directory
        finally:
            shutil.rmtree(tmp_directory, ignore_errors=True)
