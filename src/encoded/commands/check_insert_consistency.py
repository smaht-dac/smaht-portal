import argparse
import pkg_resources
from pathlib import Path
from typing import Dict, Any
from ..tests.utils import get_item_type, load_inserts
from dcicutils import ff_utils
from dcicutils.misc_utils import PRINT
from dcicutils.creds_utils import SMaHTKeyManager


class InsertConsistencyChecker:

    def __init__(self, env='data', item_type='all', fix=False):
        self.key = SMaHTKeyManager().get_keydict_for_env(env)
        self.item_type = item_type
        self.inserts = self.get_master_inserts()
        self.fix = fix

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

    def check(self) -> dict:
        """ Checks consistency of uuids/resource paths in self.type, or all items
            in master inserts if self.type is all.

            Consistent --> identifier/accession all map to the same uuid
        """
        result = {
            'new': {},
            'mismatched_identifier': {},
            'mismatched_accession': {}
        }
        for k, items in self.inserts.items():
            if self.item_type == k or self.item_type == 'all':
                result['new'][k], result['mismatched_identifier'][k], result['mismatched_accession'][k] = [], [], []
                for v in items:
                    uuid = v.get('uuid')
                    identifier = v.get('identifier')
                    accession = v.get('accession')
                    try:
                        meta = ff_utils.get_metadata(f'{uuid}', key=self.key)
                    except Exception as e:
                        msg = str(e)
                        if 'HTTPUnauthorized' in msg:
                            PRINT(f'Authorization error - exiting with partial result: {msg}')
                            return result
                        elif 'HTTPNotFound' in msg:
                            PRINT(f'Found new uuid on local not present on {self.key["server"]}')
                            if uuid not in result['new'][k]:
                                result['new'][k] += [uuid]
                            continue
                        else:
                            PRINT(f'Other error encountered  - exiting: {msg}')
                            return {}
                    if identifier:
                        if meta.get('identifier') != identifier:
                            PRINT(f'Found mismatch for identifier with uuid {uuid}\n'
                                  f'    Expected (from inserts): {identifier}\n'
                                  f'    Found (on {self.key["server"]}): {meta.get("identifier")}')
                            if uuid not in result['mismatched_identifier'][k]:
                                result['mismatched_identifier'][k] += [uuid]
                    if accession:
                        if meta.get('accession') != accession:
                            PRINT(f'Found mismatch for accession with uuid {uuid}\n'
                                  f'    Expected (from inserts): {accession}\n'
                                  f'    Found (on {self.key["server"]}): {meta.get("accession")}')
                            if uuid not in result['mismatched_accession'][k]:
                                result['mismatched_accession'][k] += [uuid]
        return result

    @staticmethod
    def summary(result):
        """ Formats entries from the check function reasonably for interpretation """

        def print_summary(data, message):
            for k, v in data.items():
                if v:
                    PRINT(f'Item Type: {k}')
                    PRINT(f'    The following {message}:')
                    for i, _v in enumerate(v):
                        PRINT(f'        {i + 1}. {_v}')
                else:
                    PRINT(f'Item Type: {k} had no {message}')

        print_summary(result['new'], f'new uuids added')
        print_summary(result['mismatched_identifier'], f'uuids with mismatched identifiers')
        print_summary(result['mismatched_accession'], f'uuids with mismatched accessions')


def main():
    parser = argparse.ArgumentParser(description="Checks consistency of inserts with a live env")
    parser.add_argument("--env", help="Env to use (if not data)", default='data')
    parser.add_argument("--item-type", help="Type to check (snake case)", default='all')
    # TODO: Maybe do this? However, tricky because we're not always sure what
    # the right fix is, and it could assume wrong. - Will 22 May 24
    parser.add_argument("--fix", action='store_true', default=False,
                        help="Whether to fix the inserts")
    args = parser.parse_args()
    checker = InsertConsistencyChecker(args.env, args.item_type, args.fix)
    result = checker.check()
    checker.summary(result)
    exit(0)


if __name__ == "__main__":
    main()
