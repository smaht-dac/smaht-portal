from pyramid.exceptions import HTTPForbidden
from dcicutils import ff_utils
from dcicutils.misc_utils import PRINT
from dcicutils.creds_utils import SMaHTKeyManager
from encoded.authentication import email_is_not_restricted
from tqdm import tqdm
from encoded import generate_restricted_domain_set, generate_restricted_email_set


ALLOW_LIST = [
    'tibanna.app@gmail.com',
    'foursight.app.gmail.com',
    'snovault.platform@gmail.com'
]


def main():
    # Load credentials for data from ~/.smaht-keys.json
    data_creds = SMaHTKeyManager().get_keydict_for_env('staging')
    registry = {
        'RESTRICTED_DOMAINS': generate_restricted_domain_set(),
        'RESTRICTED_EMAILS': generate_restricted_email_set()
    }

    # Get all users
    users = ff_utils.search_metadata('/User', key=data_creds, page_limit='all')

    # Loop through users - if any emails are restricted, patch status to deleted
    processed, already_deleted = set(), set()
    for user in tqdm(users):
        email = user['email']
        if email in ALLOW_LIST:
            continue
        try:
            email_is_not_restricted(registry, None, email)
        except HTTPForbidden:
            status = user['status']
            if status != 'deleted':
                processed.add(email)
                ff_utils.patch_metadata({'status': 'deleted'}, user['uuid'], key=data_creds)
            else:
                already_deleted.add(email)
    PRINT(f'Processed {len(processed)} users, found {len(already_deleted)} users already deleted')


if __name__ == '__main__':
    main()
