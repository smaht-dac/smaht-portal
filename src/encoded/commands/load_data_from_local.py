import argparse
import pkg_resources
from pathlib import Path
from typing import Dict, Any
from ..tests.utils import get_item_type, load_inserts
from dcicutils import ff_utils
from dcicutils.misc_utils import PRINT
from dcicutils.cloudformation_utils import camelize
from dcicutils.diff_utils import DiffManager
from dcicutils.env_utils import is_stg_or_prd_env
from dcicutils.creds_utils import SMaHTKeyManager


class LocalDataLoader:

    # TODO: common structure from insert consistency
    def __init__(self, env='data', item_type='all'):
        self.env = env
        self.key = SMaHTKeyManager().get_keydict_for_env(env)
        self.item_type = item_type
        self.inserts = self.get_master_inserts()

    @staticmethod
    def get_master_inserts() -> Dict[str, Dict[str, Any]]:
        """ Load all master inserts. """
        master_inserts_schemas_path = pkg_resources.resource_filename(
            "encoded", "tests/data/master-inserts/"
        )
        workbook_schemas = Path(master_inserts_schemas_path).glob("*.json")
        return {
            get_item_type(item_insert_file): load_inserts(item_insert_file)
            for item_insert_file in workbook_schemas
        }

    def check_version_consistency(self):
        """ If we are a prod env with a blue/green, ensure versions match before doing this """
        if is_stg_or_prd_env(self.env):
            data_version = ff_utils.get_metadata('/health', ff_env='data')['project_version']
            staging_version = ff_utils.get_metadata('/health', ff_env='staging')['project_version']
            return data_version == staging_version
        return True

    def load_data(self, overwrite=False):
        """ Loads data into the system from the local machine """
        result = {}
        for k, items in self.inserts.items():
            if self.item_type == k or self.item_type == 'all':
                for v in items:
                    try:
                        uuid = v["uuid"]  # must ALWAYS be present in a master-insert
                        current = ff_utils.get_metadata(f'/{uuid}', add_on='?frame=raw', key=self.key)
                    except Exception as e:
                        msg = str(e)
                        if 'HTTPUnauthorized' in msg:
                            PRINT(f'Authorization error - exiting with partial result: {msg}')
                            return result
                        elif 'HTTPNotFound' in msg:
                            #ff_utils.post_metadata(f'/{camelize(k)}', v)
                            PRINT(f'Found existing item')
                        else:
                            PRINT(f'Other error encountered  - exiting: {msg}')
                            return {}
                    else:
                        diff = DiffManager().diffs(current, v)
                        import pdb; pdb.set_trace()
                        if overwrite:
                            pass
                            #ff_utils.patch_metadata(v, f'/{uuid}')
                        else:
                            pass



def main():
    parser = argparse.ArgumentParser(description="Checks consistency of inserts with a live env")
    parser.add_argument("--env", help="Env to use (if not data)", default='data')
    parser.add_argument("--item-type", help="Type to check (snake case)", default='all')
    parser.add_argument("--overwrite", help="Env to use (if not data)", action='store_true', default=False)
    args = parser.parse_args()
    checker = LocalDataLoader(args.env, args.item_type)
    result = checker.load_data()
    exit(0)


if __name__ == "__main__":
    main()