import json
from typing import Any, Optional 
from dcicutils.redis_utils import create_redis_client, RedisBase


class IngestionStatusCache:
    """
    Minimal IngestionStatusCache wrapper class exposing only what we need here from dcicutils.RedisBase.
    Since this is specifically for use with the /ingestion-status cache, and since this is detailing
    with inherently transient data, we force all keys written to have an expiration time; this is
    by default 24 hours (only this long just for easier troubleshooting if necessary).
    """
    DEFAULT_REDIS_URI = "redis://localhost:6379"
    DEFAULT_REDIS_KEY_EXPIRATION_SECONDS = 60 * 60 * 24

    def __init__(self, uri: Optional[str] = DEFAULT_REDIS_URI, expiration: Optional[int] = None) -> None:
        self._redis = RedisBase(create_redis_client(url=uri))
        if isinstance(expiration, int) and expiration >= 0:
            self._expiration = expiration
        else:
            self._expiration = IngestionStatusCache.DEFAULT_REDIS_KEY_EXPIRATION_SECONDS

    def get(self, key: str, fallback: Optional[str] = None) -> Optional[str]:
        return fallback if (value := self._redis.get(key or "")) is None else value

    def get_json(self, key: str, fallback: Optional[dict] = None) -> Optional[dict]:
        if (value := self.get(key)) is not None:
            try:
                return json.loads(value)
            except Exception:
                pass
        return fallback

    def set(self, key: str, value: Optional[Any] = None) -> None:
        if isinstance(value, dict) or isinstance(value, list):
            value = json.dumps(value)
        elif not isinstance(value, str):
            value = str(value)
        self._redis.set(key, value)
        #
        # Need to reset the expiration time on each update/set; the expiration
        # time is always relative to the time of the most recently updated value.
        #
        # And need to set this directly because the RedisBase.set_expiration function in
        # dcicutils.redis_utils uses the Redis.expire gt=True argument which prevents the
        # expiration from being set at all, for some reason; it seems like gt=True and lt=True
        # functionality is backwards; if we set a key which then has a -1 ttl, and then call
        # redis.expire on the key with a positive seconds integer and the gt=True flag,
        # then that ttl does not take, but if we use lt=True instead then it does take.
        # TODO: Check with Will on this dcicutils.redis_utils.RedisBase behavior.
        #
        self._redis.redis.expire(key, self._expiration)

    @staticmethod
    def connection(uri: Optional[str] = DEFAULT_REDIS_URI):
        return IngestionStatusCache(uri)
