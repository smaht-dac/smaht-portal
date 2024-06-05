import argparse
import copy

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
from dcicutils.command_utils import yes_or_no


FIELD_PATTERNS_TO_IGNORE = [
    'date_created',
    'last_modified',
    'schema_version',
    'submitted_by'
]


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

    @staticmethod
    def filter_ignored(meta):
        """ Filters fields marked as ignored from the constant above """
        new = copy.deepcopy(meta)
        for k in meta.keys():
            for ignored in FIELD_PATTERNS_TO_IGNORE:
                if ignored in k:
                    del new[k]
                    break
        return new

    @staticmethod
    def process_result_and_get_input(item_type, uuid, result) -> bool:
        """ Prints information on the diff result """
        changes_detected = False
        if any(key in result for key in ['added', 'removed', 'changed']):
            PRINT(f'{item_type} {uuid} has detected local --> server differences:')
            changes_detected = True
            for change_type in ['added', 'removed', 'changed']:
                if change_type in result:
                    PRINT(f'    The following fields have been {change_type.upper()} on the server')
                    for field in result[change_type]:
                        PRINT(f'        *) {field}')
        else:
            PRINT(f'{uuid} has no differences!')

        return changes_detected

    def load_data(self):
        """ Loads data into the system from the local machine """
        result = {
            'added': [],
            'modified': []
        }
        for k, items in self.inserts.items():
            if self.item_type == k or self.item_type == 'all':
                for v in items:
                    try:
                        uuid = v["uuid"]  # noqa must ALWAYS be present in a master-insert
                        current = ff_utils.get_metadata(f'/{uuid}', add_on='?frame=raw', key=self.key)
                    except Exception as e:
                        msg = str(e)
                        if 'HTTPUnauthorized' in msg:
                            PRINT(f'Authorization error - exiting with partial result: {msg}')
                            return result
                        elif 'HTTPNotFound' in msg:
                            PRINT(f'Found new item of type {k}: {uuid}')  # noQA critical error if not found
                            post = yes_or_no(f'Do you want to post it?')
                            if post:
                                PRINT(f'Posting new {k} item {uuid}...')
                                ff_utils.post_metadata(f'/{camelize(k)}', v)
                                result['added'].append(uuid)
                        else:
                            PRINT(f'Other error encountered  - exiting: {msg}')
                            return {}
                    else:
                        current = self.filter_ignored(current)
                        diff = DiffManager().diffs(v, current)
                        input_needed = self.process_result_and_get_input(k, uuid, diff)
                        if input_needed:
                            patch = yes_or_no(f'Do you want to update {k} {uuid}?')
                            if patch:
                                PRINT(f'Updating {k} {uuid}...')
                                ff_utils.patch_metadata(v, uuid)
                                result['modified'].append(uuid)
        return result

    @staticmethod
    def print_result(result):
        """ Prints info from the result of load_data """
        for k, v in result.items():
            if v:
                PRINT(f'Items {k}:')
                for uuid in v:
                    PRINT(f'    *) {uuid}')
            else:
                PRINT(f'No items {k}')


def main():
    parser = argparse.ArgumentParser(description="Checks consistency of inserts with a live env")
    parser.add_argument("--env", help="Env to use (if not data)", default='data')
    parser.add_argument("--item-type", help="Type to check (snake case)", default='all')
    args = parser.parse_args()
    checker = LocalDataLoader(args.env, args.item_type)
    PRINT(f'WARNING: this command makes changes to metadata on live environments!')
    PRINT(f'You have selected {args.env}')
    if is_stg_or_prd_env(args.env):
        PRINT(f'{args.env} is a PRODUCTION environment - please exercise extreme caution!')
    else:
        PRINT(f'{args.env} is a TESTING environment')
    if yes_or_no(f'Are you sure you want to proceed loading data into {args.env}?'):
        result = checker.load_data()
        checker.print_result(result)
    else:
        PRINT(f'Exiting')
    exit(0)


if __name__ == "__main__":
    main()
