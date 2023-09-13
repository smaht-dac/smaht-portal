import tempfile
import zipfile
from dcicutils.misc_utils import VirtualApp
from dcicutils.sheet_utils import InsertsDirectoryItemManager, load_items


def load_data_via_sheet_utils(data_file_name: str, portal_vapp: VirtualApp) -> dict[str, list[dict]]:
    if data_file_name.endswith(".zip"):
        # TODO: Note that sheet_utils does not yet support zip files so we do it here.
        tmp_data_directory = tempfile.mkdtemp()
        with zipfile.ZipFile(data_file_name, "r") as zipf:
            zipf.extractall(tmp_data_directory)
            # TODO: Want to pass a portal_vapp to get schemas but not yet supported by sheet_utils.
            data = InsertsDirectoryItemManager(filename=tmp_data_directory).load_content()
    else:
        data = load_items(data_file_name, portal_vapp=portal_vapp)
    return data
