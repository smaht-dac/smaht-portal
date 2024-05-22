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
        workbook_schemas_path = pkg_resources.resource_filename(
            "encoded", "tests/data/master-inserts/"
        )
        workbook_schemas = Path(workbook_schemas_path).glob("*.json")
        return {
            get_item_type(item_insert_file): load_inserts(item_insert_file)
            for item_insert_file in workbook_schemas
        }

    def check(self) -> dict:
        """ Checks consistency of uuids/resource paths in self.type, or all items
            in master inserts if self.type is all.

            Consistent --> identifier/accession all map to the same uuid
        """
        result = {}
        for k, items in self.inserts.items():
            if self.item_type == k or self.item_type == 'all':
                result[k] = []
                for v in items:
                    uuid = v.get('uuid')
                    identifier = v.get('identifier')
                    accession = v.get('accession')
                    meta = ff_utils.get_metadata(f'{uuid}', key=self.key)
                    if identifier:
                        if meta.get('identifier') != identifier:
                            PRINT(f'Found mismatch for identifier with uuid {uuid}\n'
                                  f'    Expected (from inserts): {identifier}\n'
                                  f'    Found (on {self.key["server"]}): {meta.get("identifier")}')
                            if uuid not in result[k]:
                                result[k] += [uuid]
                    if accession:
                        if meta.get('accession') != accession:
                            PRINT(f'Found mismatch for accession with uuid {uuid}\n'
                                  f'    Expected (from inserts): {accession}\n'
                                  f'    Found (on {self.key["server"]}): {meta.get("accession")}')
                            if uuid not in result[k]:
                                result[k] += [uuid]
        return result

    @staticmethod
    def summary(result):
        """ Formats entries from the check function reasonably for interpretation """
        for k, v in result.items():
            if v:
                PRINT(f'Item Type: {k}')
                PRINT(f'    The following uuids require further investigation:')
                for i, _v in enumerate(v):
                    PRINT(f'        {i+1}. {_v}')
            else:
                PRINT(f'Item Type: {k} cleared')


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
