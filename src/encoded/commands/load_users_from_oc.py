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
#   Email,
#   SMaHT Contact PI,
#   Association,
#   Grant Component,
#   DAC code in the portal

# Define the named tuple
User = namedtuple('User', ['first_name', 'last_name', 'email', 'submission_center', 'submits_for'])


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
    def build_user_from_row(row: list) -> User:
        """ Builds a 'User' namedtuple extracting from the format above """
        first_name, last_name, email, submission_center, submits_for = row[2], row[1], row[3], row[6], row[7]
        return User(first_name, last_name, email, submission_center, submits_for)

    def generate_submission_center_list(self, user_csv_list: list[list]):
        """ Goes through the CSV and populates the submission center list """
        for row in user_csv_list:
            sc = row[6]
            if sc not in self.submission_centers:
                self.submission_centers.append(sc)

    def validate_submission_center_list(self):
        """ Validates all submission centers exist on the portal """
        if not self.submission_centers:
            raise UserCSVProcessorException(f'Attempted to validate submission centers prior to loading them')
        for sc in self.submission_centers:
            if sc == 'dac':  # XXX: Hardcode as this is not named correctly
                sc = 'smaht_dac'
            elif sc == 'nih':  # XXX: Hardcode as NIH has no submission center
                continue
            ff_utils.get_metadata(f'/submission-centers/{sc.lower()}', key=self.key)  # this will throw exception if not found

    def check_for_existing_user(self, user: User) -> bool:
        """ Checks if the current user already exists """
        email = user.email
        user = ff_utils.get_metadata(f'/{email}', key=self.key)
        if not user:
            return False
        return True

    def generate_users(self, user_csv_list: list[list]) -> dict:
        """ Generates an email --> props mapping of users to post """
        for u in user_csv_list:
            user = self.build_user_from_row(u)
            if user.email in self.user_dict:
                raise UserCSVProcessorException(f'Found duplicate user in spreadsheet: {user.email}')
            self.user_dict[user.email] = user
        return self.user_dict

    def ignore_existing_users(self):
        """ Strips out users who already have a user record """
        for email, _ in self.user_dict.items():
            try:
                ff_utils.get_metadata(f'/users/{email}', key=self.key)
                PRINT(f'Skipping already present user {email}')
                self.user_dict[email] = None  # we want to (effectively) remove this key if we got here
            except Exception:
                PRINT(f'User {email} queued for update')
                continue  # we want to keep this user

    def post_users_to_portal(self):
        """ Posts the user_dict to the portal """
        number_updated = 0
        for _, user in self.user_dict.items():
            if user:  # could have been set to None in previous step
                try:
                    post_body = {
                        'email': user.email,
                        'first_name': user.first_name,
                        'last_name': user.last_name,
                        'consortia': [
                            'smaht'
                        ]
                    }
                    if user.submission_center != 'nih':  # XXX: hardcode as NIH has no submission center
                        post_body['submission_centers'] = [user.submission_center]
                        if user.submits_for == 'Yes':
                            post_body['submits_for'] = [
                                user.submission_center
                            ]
                    if user.submission_center == 'dac':  # XXX: hardcode as this differs in spreadsheet
                        post_body['submission_centers'] = ['smaht_dac']
                        post_body['submits_for'] = ['smaht_dac']  # all dac users can submit for us

                    ff_utils.post_metadata(post_body, '/User',  key=self.key,
                                           add_on='?check_only=true' if self.validate_only else '')
                    number_updated += 1
                except Exception as e:
                    PRINT(f'Exiting - error encountered in user {user.email}: {e}')
                    return number_updated
        return number_updated

    def main(self, args):
        """ Entrypoint for this command """
        self.validate_only = args.validate_only
        user_csv_list = self.read_csv(args.csv_file_path)[1:]  # strip header
        self.generate_submission_center_list(user_csv_list)
        self.validate_submission_center_list()
        self.generate_users(user_csv_list)
        PRINT(f'Found {len(self.user_dict.items())} (at most) to post')
        self.ignore_existing_users()
        number_updated = self.post_users_to_portal()
        PRINT(f'{number_updated} users have been posted to the portal')


def main():
    parser = argparse.ArgumentParser(description="Reads a CSV of users in expected format and updates the data "
                                                 "portal.")
    parser.add_argument("csv_file_path", help="Path to the User CSV file")
    parser.add_argument("--env", help="env to use (if not data)", default='data')
    parser.add_argument("--validate-only", action='store_true', default=False,
                        help="Only validate the posting of users")
    args = parser.parse_args()
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
