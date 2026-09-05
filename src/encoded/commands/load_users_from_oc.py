import csv
import argparse
from collections import namedtuple
from dcicutils import ff_utils
from dcicutils.misc_utils import PRINT
from dcicutils.creds_utils import SMaHTKeyManager

# Command for processing the user table from OC
# Column Format:
#   Affiliation,
#   SMaHT Listed Last Name,
#   SMaHT Listed First Name,
#   DUA signed,
#   Email,
#   SMaHT Contact PI Association,
#   Grant Component,
#   DAC code in the portal
#   Submitter (Yes/No)
#   Revoked (Yes/No)
#   Associate Network Member (Yes/No)

# Define the named tuple
User = namedtuple('User', ['first_name', 'last_name', 'dua_status', 'email', 'submission_center', 'submits_for',
                          'is_associate'], defaults=('No',))


class UserCSVProcessorException(Exception):
    pass


class UserCSVProcessor:

    def __init__(self, env='data'):
        self.key = SMaHTKeyManager().get_keydict_for_env(env)
        self.submission_centers = []
        self.user_dict = {}
        self.validate_only = False

    def read_csv(self, file_path: str) -> list:
        """ Pulls the whole CSV into memory and returns a list of rows """
        with open(file_path, 'r') as csv_file:
            csv_reader = csv.reader(csv_file)
            user_list = [row for row in csv_reader if any(row)]  # strip empties
        return user_list

    @staticmethod
    def clean_str(s, lower=True):
        """ Cleans strings for ingestion into the database by lowercasing them and stripping whitespace"""
        if lower:
            s = s.lower()
        return s.strip()

    def build_user_from_row(self, row: list) -> User:
        """ Builds a 'User' namedtuple extracting from the format above """
        first_name, last_name, dua, email, submission_center, submits_for = (self.clean_str(row[2], lower=False),
                                                                             self.clean_str(row[1], lower=False),
                                                                             self.clean_str(row[3], lower=False),
                                                                             self.clean_str(row[4]),
                                                                             row[7], row[8])
        is_associate = self.clean_str(row[10], lower=False) if len(row) > 10 else ''
        return User(first_name, last_name, dua, email, submission_center, submits_for, is_associate)

    def generate_submission_center_list(self, user_csv_list: list[list]):
        """ Goes through the CSV and populates the submission center list """
        for row in user_csv_list:
            sc = row[7]
            if sc and sc not in self.submission_centers:
                self.submission_centers.append(sc)

    def validate_submission_center_list(self):
        """ Validates all submission centers exist on the portal """
        if not self.submission_centers:
            raise UserCSVProcessorException(f'Attempted to validate submission centers prior to loading them')
        for sc in self.submission_centers:
            if ',' in sc:
                continue  # skip compound centers
            if sc == 'dac':  # XXX: Hardcode as this is not named correctly
                sc = 'smaht_dac'
            elif sc == 'nih':  # XXX: Hardcode as NIH has no submission center
                continue
            ff_utils.get_metadata(f'/submission-centers/{sc.lower()}', key=self.key)  # this will throw exception if not found

    def validate_consortium_list(self):
        """ Validates the consortia this script can assign actually exist on the portal """
        for consortium in ('smaht', 'smaht_associate'):
            ff_utils.get_metadata(f'/consortia/{consortium}', key=self.key)  # this will throw exception if not found

    def check_for_existing_user(self, user: User) -> bool:
        """ Checks if the current user already exists """
        email = user.email
        user = ff_utils.get_metadata(f'/{email}', key=self.key)
        if not user:
            return False
        return True

    def generate_users(self, user_csv_list: list[list]) -> dict:
        """ Generates an email --> props mapping of users to post """
        first_seen_row = {}  # email -> row number of first occurrence
        duplicate_emails = set()  # emails excluded entirely due to a duplicate
        for row_number, _u in enumerate(user_csv_list, start=2):  # +2: header stripped, 1-indexed
            if _u[9] == 'Yes':  # ignore revoked users
                continue
            user = self.build_user_from_row(_u)
            if user.email in duplicate_emails:
                PRINT(f'\033[1mWARNING: duplicate email "{user.email}" also found at row {row_number} '
                      f'- row excluded\033[0m')
                continue
            if user.email in self.user_dict:
                PRINT(f'\033[1mWARNING: duplicate email "{user.email}" found at row {row_number} '
                      f'(first seen at row {first_seen_row[user.email]}) - excluding both rows '
                      f'from processing\033[0m')
                del self.user_dict[user.email]
                duplicate_emails.add(user.email)
                continue
            self.user_dict[user.email] = user
            first_seen_row[user.email] = row_number
        return self.user_dict

    def ignore_existing_users(self) -> None:
        """ Strips out users who already have a user record """
        for email, _ in self.user_dict.items():
            try:
                ff_utils.get_metadata(f'/users/{email}', key=self.key)
                PRINT(f'Skipping already present user {email}')
                self.user_dict[email] = None  # we want to (effectively) remove this key if we got here
            except Exception:
                PRINT(f'User {email} queued for update')
                continue  # we want to keep this user

    def post_users_to_portal(self) -> tuple[int, int]:
        """ Posts the user_dict to the portal """
        number_updated = 0
        number_failed = 0
        for _, user in self.user_dict.items():
            if user:  # could have been set to None in previous step
                try:
                    consortium = 'smaht_associate' if user.is_associate == 'Yes' else 'smaht'
                    post_body = {
                        'email': user.email,
                        'first_name': user.first_name,
                        'last_name': user.last_name,
                        'consortia': [consortium]
                    }
                    if user.dua_status == 'Yes':
                        post_body['groups'] = ['dbgap']
                    if user.submission_center and user.submission_center != 'nih':  # XXX: hardcode as NIH has no submission center
                        post_body['submission_centers'] = [sc for sc in user.submission_center.split(',')]
                        if user.submits_for == 'Yes':
                            post_body['submits_for'] = [
                                user.submission_center
                            ]
                    elif not user.submission_center:
                        PRINT(f'No DAC code for user {user.email} - posting without submission_centers/submits_for')
                    if user.submission_center == 'dac':  # XXX: hardcode as this differs in spreadsheet
                        post_body['submission_centers'] = ['smaht_dac']
                        post_body['submits_for'] = ['smaht_dac']  # all dac users can submit for us

                    ff_utils.post_metadata(post_body, 'users', key=self.key,
                                           add_on='?check_only=true' if self.validate_only else '')
                    number_updated += 1
                except Exception as e:
                    PRINT(f'Error encountered in user {user.email} - skipping: {e}')
                    number_failed += 1
                    continue
        return number_updated, number_failed

    @staticmethod
    def _normalize_linked_item(value) -> str:
        """ linkTo entries (submits_for, consortia) come back as embedded dicts (has
            'identifier') from a get_metadata call with an admin key; normalize
            dict/@id-path/bare-string forms to a bare identifier so comparisons work
            regardless of shape. """
        if isinstance(value, dict):
            return value.get('identifier', '')
        if isinstance(value, str) and value.startswith('/'):
            segments = [s for s in value.strip('/').split('/') if s]
            return segments[-1] if segments else value
        return value

    def update_submits_for(self, only_if_changed: bool = False) -> tuple[int, int, int]:
        """ Iterates through the user list updating submits_for, groups, and consortia where applicable """
        number_updated = 0
        number_failed = 0
        number_unchanged = 0
        for _, user in self.user_dict.items():
            try:
                existing = ff_utils.get_metadata(f'/users/{user.email}', key=self.key)
                existing_groups = existing.get('groups', [])
                existing_submits_for = [self._normalize_linked_item(sc)
                                         for sc in existing.get('submits_for', [])]
                existing_consortia = [self._normalize_linked_item(c)
                                       for c in existing.get('consortia', [])]

                target_consortium = 'smaht_associate' if user.is_associate == 'Yes' else 'smaht'
                patch_body = {'consortia': [target_consortium]}
                if user.submission_center and user.submission_center != 'nih':  # XXX: hardcode as NIH has no submission center
                    patch_body['submits_for'] = [sc for sc in user.submission_center.split(',')]
                elif not user.submission_center:
                    PRINT(f'No DAC code for user {user.email} - updating without submission_centers/submits_for')
                if user.submission_center == 'dac':  # XXX: hardcode as this differs in spreadsheet
                    patch_body['submits_for'] = ['smaht_dac']  # all dac users can submit for us
                if user.dua_status == 'Yes':
                    patch_body['groups'] = list(set(['dbgap'] + existing_groups))

                if only_if_changed:
                    changed = (
                        sorted(patch_body['consortia']) != sorted(existing_consortia)
                        or ('submits_for' in patch_body
                            and sorted(patch_body['submits_for']) != sorted(existing_submits_for))
                        or ('groups' in patch_body
                            and sorted(patch_body['groups']) != sorted(existing_groups))
                    )
                    if not changed:
                        PRINT(f'No changes needed for user {user.email} - skipping')
                        number_unchanged += 1
                        continue

                ff_utils.patch_metadata(patch_body, f'/users/{user.email}', key=self.key,
                                        add_on='?check_only=true' if self.validate_only else '')
                number_updated += 1
            except Exception as e:
                PRINT(f'Error encountered in user {user.email} - skipping: {e}')
                number_failed += 1
                continue
        return number_updated, number_failed, number_unchanged

    def main(self, args):
        """ Entrypoint for this command """
        self.validate_only = args.validate_only
        user_csv_list = self.read_csv(args.csv_file_path)[1:]  # strip header
        self.generate_submission_center_list(user_csv_list)
        self.validate_submission_center_list()
        self.validate_consortium_list()
        self.generate_users(user_csv_list)
        PRINT(f'Found {len(self.user_dict.items())} to post')
        PRINT(f'Please confirm with y/n')
        y = input()
        if y.lower() != 'y':
            PRINT('Confirmation failed - exiting')
            exit(0)
        if args.create_new:
            self.ignore_existing_users()
            number_updated, number_failed = self.post_users_to_portal()
            number_unchanged = 0
        else:
            number_updated, number_failed, number_unchanged = self.update_submits_for(
                only_if_changed=args.update_changed)
        if self.validate_only:
            PRINT(f'[VALIDATE-ONLY] {number_updated} users passed validation (nothing was persisted to the portal)')
        else:
            PRINT(f'{number_updated} users have been updated on the portal')
        if number_unchanged:
            PRINT(f'{number_unchanged} users already had matching values on the portal and were skipped')
        if number_failed:
            PRINT(f'\033[1mWARNING: {number_failed} users failed and were skipped - see errors above\033[0m')


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Reads a CSV of users in expected format and updates the data "
                                                 "portal.")
    parser.add_argument("csv_file_path", help="Path to the User CSV file")
    parser.add_argument("--env", help="env to use (if not data)", default='data')
    parser.add_argument("--validate-only", action='store_true', default=False,
                        help="Only validate the posting of users")
    mode_group = parser.add_mutually_exclusive_group(required=True)
    mode_group.add_argument("--create-new", action='store_true', default=False,
                            help="Post new users only - skip users who already exist on the portal")
    mode_group.add_argument("--update-all", action='store_true', default=False,
                            help="Do not post new users - unconditionally update submits_for/groups "
                                 "on existing ones")
    mode_group.add_argument("--update-changed", action='store_true', default=False,
                            help="Like --update-all, but skip users whose submits_for/groups already "
                                 "match the portal - only PATCH users with an actual change")
    return parser


def main(argv=None):
    args = build_arg_parser().parse_args(argv)
    env = args.env
    PRINT(f'Attempting user load on env {env}, please confirm with y/n')
    y = input()
    if y.lower() != 'y':
        PRINT('Confirmation failed - exiting')
        exit(0)
    UserCSVProcessor(env=env).main(args)
    exit(0)


if __name__ == "__main__":
    main()
