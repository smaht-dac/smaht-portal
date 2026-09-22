import csv
import json
import argparse
import re
from collections import namedtuple
from urllib.parse import quote
from uuid import UUID

from requests.exceptions import HTTPError
from dcicutils import ff_utils
from dcicutils.misc_utils import PRINT
from dcicutils.creds_utils import SMaHTKeyManager

# Command for processing the user table from OC.
# Modes, permission semantics, and failure handling: encoded/docs/load_users_from_oc.rst
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


def _request_once(request_fxn, url, auth, verb, **kwargs):
    """Do not replay a write after an ambiguous timeout or server error."""
    response = request_fxn(url, auth=auth, **kwargs)
    response.raise_for_status()
    if not 200 <= response.status_code < 300:
        raise UserCSVProcessorException(f'Unexpected {verb} response: {response.status_code}')
    return response


def _metadata(verb, path, key, body=None, add_on=''):
    url = key['server'].rstrip('/') + '/' + path.strip('/') + add_on
    kwargs = {'data': json.dumps(body)} if body is not None else {}
    return ff_utils.authorized_request(
        url, auth=key, verb=verb, retry_fxn=_request_once,
        # Snovault redirects GET aliases to canonical item paths. Writes must not
        # be redirected or replayed, but requests' bounded GET redirects are safe.
        timeout=(10, 60), allow_redirects=(verb == 'GET'), **kwargs).json()


def get_metadata(path, key):
    # Fresh, fully embedded identifiers are essential for safe change detection.
    return _metadata('GET', path, key, add_on='?frame=embedded&datastore=database')


def post_metadata(body, collection, key, add_on=''):
    return _metadata('POST', collection, key, body, add_on)


def patch_metadata(body, path, key, add_on=''):
    return _metadata('PATCH', path, key, body, add_on)


class UserCSVProcessor:

    def __init__(self, env='data'):
        self.key = SMaHTKeyManager().get_keydict_for_env(env)
        self.submission_centers = []
        self.user_dict = {}
        self.validate_only = False
        self.verbose = False

    def read_csv(self, file_path: str) -> list:
        """ Pulls the whole CSV into memory and returns a list of rows """
        with open(file_path, 'r', encoding='utf-8-sig', newline='') as csv_file:
            # Keep blank rows here so diagnostic row numbers remain accurate.
            return list(csv.reader(csv_file, strict=True))

    @staticmethod
    def clean_str(s, lower=True):
        """ Cleans strings for ingestion into the database by lowercasing them and stripping whitespace"""
        if lower:
            s = s.lower()
        return s.strip()

    @staticmethod
    def _flag(value, column):
        flag = value.strip().lower()
        if flag not in ('yes', 'no', ''):
            raise UserCSVProcessorException(f'{column} must be Yes, No, or blank; got {value!r}')
        return flag.title()

    def build_user_from_row(self, row: list) -> User:
        """Validate a row before interpreting any values as permission changes."""
        if len(row) < 10:
            raise UserCSVProcessorException('Expected at least 10 columns')
        first_name, last_name = row[2].strip(), row[1].strip()
        email = self.clean_str(row[4])
        if not first_name or not last_name or not re.fullmatch(r'[^@\s]+@[^@\s]+', email):
            raise UserCSVProcessorException('Nonempty first/last names and a valid email are required')
        dua = self._flag(row[3], 'DUA signed')
        submits_for = self._flag(row[8], 'Data submitter')
        self._flag(row[9], 'Revoked')
        associate = self._flag(row[10], 'Associate Network Member') if len(row) > 10 else ''
        return User(first_name, last_name, dua, email, row[7].strip(), submits_for, associate)

    def generate_submission_center_list(self):
        """Validate only centers assigned to eligible, unambiguous users."""
        self.submission_centers = list(dict.fromkeys(
            sc for user in self.user_dict.values()
            for sc in self._mapped_submission_centers(user.submission_center)))

    def validate_submission_center_list(self):
        """Validate each actual link, including every compound-center token."""
        for sc in self.submission_centers:
            linked = get_metadata(f'/submission-centers/{quote(sc, safe="")}', key=self.key)
            self._cache_link('submission-centers', sc, linked)

    def validate_consortium_list(self):
        """Validate only consortia this batch can assign."""
        consortia = ['smaht']
        if any(user.is_associate == 'Yes' for user in self.user_dict.values()):
            consortia.append('smaht_associate')
        for consortium in consortia:
            get_metadata(f'/consortia/{consortium}', key=self.key)

    def _get_user(self, email):
        try:
            existing = get_metadata(f'/users/{quote(email, safe="@")}', key=self.key)
        except HTTPError as error:
            if error.response is not None and error.response.status_code == 404:
                return None
            raise
        if not isinstance(existing, dict) or not existing:
            raise UserCSVProcessorException(f'Invalid user response for {email}')
        return existing

    def check_for_existing_user(self, user: User) -> bool:
        """Only an explicit HTTP 404 establishes that a user is missing."""
        return self._get_user(user.email) is not None

    def generate_users(self, user_csv_list: list[list]) -> dict:
        """ Generates an email --> props mapping of users to post """
        self.user_dict = {}  # Never reuse users from an earlier spreadsheet.
        users = {}
        first_seen_row = {}  # email -> row number of first occurrence
        duplicate_emails = set()  # emails excluded entirely due to a duplicate
        for row_number, _u in enumerate(user_csv_list, start=2):  # +2: header stripped, 1-indexed
            if not any(cell.strip() for cell in _u):
                continue
            try:
                user = self.build_user_from_row(_u)
            except UserCSVProcessorException as error:
                raise UserCSVProcessorException(f'Row {row_number}: {error}') from error
            if user.email in duplicate_emails:
                PRINT(f'\033[1mWARNING: duplicate email "{user.email}" also found at row {row_number} '
                      f'- row excluded\033[0m')
                continue
            if user.email in first_seen_row:
                PRINT(f'\033[1mWARNING: duplicate email "{user.email}" found at row {row_number} '
                      f'(first seen at row {first_seen_row[user.email]}) - excluding both rows '
                      f'from processing\033[0m')
                users.pop(user.email, None)
                duplicate_emails.add(user.email)
                continue
            first_seen_row[user.email] = row_number
            # Include revoked identities in duplicate detection: a conflicting old
            # active row must not restore access or create an ambiguous user.
            if self._flag(_u[9], 'Revoked') != 'Yes':
                users[user.email] = user
        self.user_dict = users
        return self.user_dict

    def ignore_existing_users(self) -> None:
        """ Strips out users who already have a user record """
        new_users = {}
        for email, user in self.user_dict.items():
            if self.check_for_existing_user(user):
                PRINT(f'Skipping already present user {email}')
            else:
                PRINT(f'User {email} queued for creation')
                new_users[email] = user
        # An unexpected lookup failure aborts the entire preflight before any POST.
        self.user_dict = new_users

    @staticmethod
    def _mapped_submission_centers(submission_center: str) -> list:
        """ Maps the raw DAC-code column value to actual portal SubmissionCenter
            identifiers (comma-split), applying the 'dac' -> 'smaht_dac' spreadsheet hardcode. """
        centers = []
        for token in submission_center.split(','):
            sc = UserCSVProcessor._normalize_linked_item(token) if token.strip() else ''
            sc = sc.lower()
            if not sc or sc == 'nih':  # NIH has no submission center.
                continue
            if sc == 'dac':
                sc = 'smaht_dac'
            if sc not in centers:
                centers.append(sc)
        return centers

    def _normalized_submission_centers(self, value):
        return list(dict.fromkeys(self._linked_identifier(sc, 'submission-centers')
                                  for sc in self._mapped_submission_centers(value)))

    @staticmethod
    def _target_submits_for(user, mapped_centers, existing=()):
        # Blank cells are not deliberate removals. Explicit No clears non-DAC
        # submission rights; DAC membership always retains the historical grant.
        if user.submits_for == 'No':
            target = []
        elif user.submits_for == 'Yes' and mapped_centers:
            target = list(mapped_centers)
        else:
            target = list(existing)
        if 'smaht_dac' in mapped_centers and 'smaht_dac' not in target:
            target.append('smaht_dac')
        return target

    def post_users_to_portal(self) -> tuple[int, int]:
        """ Posts the user_dict to the portal """
        number_updated = 0
        number_failed = 0
        for _, user in self.user_dict.items():
            if user:  # allow callers to mark an entry as skipped
                try:
                    consortia = ['smaht']
                    if user.is_associate == 'Yes':
                        consortia.append('smaht_associate')
                    post_body = {
                        'email': user.email,
                        'first_name': user.first_name,
                        'last_name': user.last_name,
                        'consortia': consortia
                    }
                    if user.dua_status == 'Yes':
                        post_body['groups'] = ['dbgap']
                    mapped_centers = self._normalized_submission_centers(user.submission_center)
                    if mapped_centers:
                        post_body['submission_centers'] = mapped_centers
                    else:
                        PRINT(f'No submission center for user {user.email} - posting without submission_centers/submits_for')
                    target_submits_for = self._target_submits_for(user, mapped_centers)
                    if target_submits_for:
                        post_body['submits_for'] = target_submits_for

                    if self.verbose:
                        PRINT(f'POST body for {user.email}:\n{json.dumps(post_body, indent=2)}')
                    post_metadata(post_body, 'users', key=self.key,
                                  add_on='?check_only=true' if self.validate_only else '')
                    number_updated += 1
                except Exception as e:
                    PRINT(f'Error encountered in user {user.email}: {e}. '
                          'Verify any attempted write before retrying; it may have persisted.')
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
            value = value.get('identifier') or value.get('@id') or value.get('uuid')
        if not isinstance(value, str) or not value.strip().strip('/'):
            raise UserCSVProcessorException(f'Malformed linked item: {value!r}')
        return value.strip().rstrip('/').rsplit('/', 1)[-1]

    def _cache_link(self, collection, name, linked):
        if (not isinstance(linked, dict) or not isinstance(linked.get('identifier'), str)
                or not linked['identifier'].strip()):
            raise UserCSVProcessorException(f'Missing identifier for {collection}/{name}')
        if not hasattr(self, '_linked_cache'):
            self._linked_cache = {}
        identifier = linked['identifier'].strip()
        self._linked_cache[(collection, name)] = identifier
        return identifier

    def _linked_identifier(self, value, collection):
        identifier = self._normalize_linked_item(value)
        cached = getattr(self, '_linked_cache', {}).get((collection, identifier))
        if cached:
            return cached
        try:
            UUID(identifier)
        except ValueError:
            return identifier
        # Embedded user responses normally supply identifiers. Resolve UUID-only
        # links once per batch instead of generating perpetual false changes.
        linked = get_metadata(f'/{collection}/{identifier}', key=self.key)
        return self._cache_link(collection, identifier, linked)

    def update_submits_for(self, only_if_changed: bool = False) -> tuple[int, int, int]:
        """ Iterates through the user list updating submits_for, groups, and consortia where applicable """
        number_updated = 0
        number_failed = 0
        number_unchanged = 0
        for _, user in self.user_dict.items():
            try:
                existing = self._get_user(user.email)
                if existing is None or existing.get('status', 'current') != 'current':
                    PRINT(f'User {user.email} is missing or not current - skipping')
                    number_unchanged += 1
                    continue
                for field in ('groups', 'submits_for', 'consortia'):
                    if not isinstance(existing.get(field, []), list):
                        raise UserCSVProcessorException(f'Malformed {field} for {user.email}')
                existing_groups = existing.get('groups', [])
                if not all(isinstance(group, str) for group in existing_groups):
                    raise UserCSVProcessorException(f'Malformed groups for {user.email}')
                existing_submits_for = [self._linked_identifier(sc, 'submission-centers')
                                       for sc in existing.get('submits_for', [])]
                existing_consortia = [self._linked_identifier(c, 'consortia')
                                     for c in existing.get('consortia', [])]

                # Manage our two consortium tags, not unrelated memberships.
                target_consortia = [c for c in existing_consortia if c != 'smaht_associate']
                if 'smaht' not in target_consortia:
                    target_consortia.append('smaht')
                if user.is_associate == 'Yes' or (not user.is_associate and 'smaht_associate' in existing_consortia):
                    target_consortia.append('smaht_associate')

                mapped_centers = self._normalized_submission_centers(user.submission_center)
                if not mapped_centers:
                    PRINT(f'No submission center for user {user.email} - '
                          'preserving existing submits_for unless Data submitter is No')
                target_submits_for = self._target_submits_for(user, mapped_centers, existing_submits_for)

                existing_has_dbgap = 'dbgap' in existing_groups
                target_has_dbgap = user.dua_status == 'Yes' if user.dua_status else existing_has_dbgap
                groups_patch = None  # the new 'groups' value to send, if any
                delete_groups_field = False
                if target_has_dbgap and not existing_has_dbgap:
                    groups_patch = existing_groups + ['dbgap']  # add, preserving other groups
                elif not target_has_dbgap and existing_has_dbgap:
                    remaining = [g for g in existing_groups if g != 'dbgap']  # remove dbgap only
                    if remaining:
                        groups_patch = remaining  # other groups survive
                    else:
                        delete_groups_field = True  # dbgap was the sole group
                # else: target_has_dbgap == existing_has_dbgap -> no groups change needed at all

                # Omit unchanged fields, particularly unspecified spreadsheet
                # values, rather than copying them back over concurrent edits.
                # Update-all still issues one PATCH even if this body is empty.
                patch_body = {}
                if sorted(target_consortia) != sorted(existing_consortia):
                    patch_body['consortia'] = target_consortia
                if target_submits_for and sorted(target_submits_for) != sorted(existing_submits_for):
                    patch_body['submits_for'] = target_submits_for
                if groups_patch is not None:
                    patch_body['groups'] = groups_patch

                if only_if_changed:
                    changed = (
                        sorted(target_consortia) != sorted(existing_consortia)
                        or sorted(target_submits_for) != sorted(existing_submits_for)
                        or groups_patch is not None
                        or delete_groups_field
                    )
                    if not changed:
                        PRINT(f'No changes needed for user {user.email} - skipping')
                        number_unchanged += 1
                        continue

                add_on_params = []
                if self.validate_only:
                    add_on_params.append('check_only=true')
                delete_fields = []
                if not target_submits_for and existing_submits_for:
                    delete_fields.append('submits_for')
                if delete_groups_field:
                    delete_fields.append('groups')
                if delete_fields:
                    add_on_params.append('delete_fields=' + ','.join(delete_fields))
                add_on = '?' + '&'.join(add_on_params) if add_on_params else ''

                if self.verbose:
                    PRINT(f'PATCH body for {user.email} (add_on={add_on!r}):\n{json.dumps(patch_body, indent=2)}')
                patch_metadata(patch_body, f'/users/{quote(user.email, safe="@")}', key=self.key, add_on=add_on)
                number_updated += 1
            except Exception as e:
                PRINT(f'Error encountered in user {user.email}: {e}. '
                      'Verify any attempted write before retrying; it may have persisted.')
                number_failed += 1
                continue
        return number_updated, number_failed, number_unchanged

    def main(self, args):
        """ Entrypoint for this command """
        self.validate_only = args.validate_only
        self.verbose = args.verbose
        rows = self.read_csv(args.csv_file_path)
        if not rows or len(rows[0]) < 10 or rows[0][4].strip().lower().replace(' ', '') not in (
                'email', 'emailaddress', 'e-mail', 'e-mailaddress'):
            raise UserCSVProcessorException('Expected a header with at least 10 columns and Email in column 5')
        self.generate_users(rows[1:])
        self._linked_cache = {}
        PRINT(f'Found {len(self.user_dict)} spreadsheet users to process')
        if not self.user_dict:
            return 0
        self.generate_submission_center_list()
        self.validate_submission_center_list()
        self.validate_consortium_list()
        PRINT(f'Please confirm with y/n')
        y = input()
        if y.lower() != 'y':
            PRINT('Confirmation failed - exiting')
            return 0
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
            PRINT(f'{number_unchanged} users were skipped (missing, not current, or already matching)')
        if number_failed:
            PRINT(f'\033[1mWARNING: {number_failed} users failed - verify outcomes before retrying; see errors above\033[0m')
        return 1 if number_failed else 0


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Load OC users. Updates manage consortia, submits_for, and the dbgap group only; "
                    "names and submission_centers are set on creation. Blank flags preserve existing values; "
                    "No removes managed values. DAC members always retain smaht_dac submission rights. "
                    "Associates receive both smaht and smaht_associate membership.")
    parser.add_argument("csv_file_path", help="Path to the User CSV file")
    parser.add_argument("--env", help="env to use (if not data)", default='data')
    parser.add_argument("--validate-only", action='store_true', default=False,
                        help="Validate POST/PATCH requests without persisting changes")
    parser.add_argument("--verbose", action='store_true', default=False,
                        help="Print the POST/PATCH JSON body for each user")
    mode_group = parser.add_mutually_exclusive_group(required=True)
    mode_group.add_argument("--create-new", action='store_true', default=False,
                            help="Post new users only - skip users who already exist on the portal")
    mode_group.add_argument("--update-all", action='store_true', default=False,
                            help="Do not post new users - unconditionally update consortia/submits_for/groups "
                                 "on existing current users")
    mode_group.add_argument("--update-changed", action='store_true', default=False,
                            help="Like --update-all, but skip users whose consortia/submits_for/groups already "
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
    try:
        result = UserCSVProcessor(env=env).main(args)
    except Exception as error:
        PRINT(f'User load failed: {error}')
        result = 1
    raise SystemExit(result)


if __name__ == "__main__":
    main()
