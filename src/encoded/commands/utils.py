from typing import Dict

from dcicutils.creds_utils import SMaHTKeyManager


def get_auth_key(env: str) -> Dict[str, str]:
    """Get the auth key for the given environment."""
    return SMaHTKeyManager().get_keydict_for_env(env)
