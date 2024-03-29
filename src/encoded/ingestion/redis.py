import json
from typing import Any, Optional 
from dcicutils.redis_utils import create_redis_client, RedisBase

class Redis:
    """
    Minimal Redis wrapper class exposing only what we need here from dcicutils.RedisBase.
    """

    def __init__(self, uri: Optional[str] = "redis://localhost:6379") -> None:
        self._redis = RedisBase(create_redis_client(url=uri))
        self._expirations = {}

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
        # If the key has an expiration time (seconds) then reset to that value on each update/set;
        # i.e. the expiration time is always relative to the time of the most recently updated value.
        if (expiration := self._expirations.get(key)) is not None:
            self.set_expiration(key, expiration)

    def exists(self, key: str) -> bool:
        return True if self._redis.redis.exists(key) else False

    def set_expiration(self, key: str, seconds: int) -> Optional[str]:
        # TODO: For some reason the dcicutils.redis_utils.RedisBase.set_expiration uses gt=True
        # for the redis.expire function and for some reason that causes the expiration setting not
        # to take, even though the previous/initial expiration is -1 and the doc says it should set
        # the expiration only if the new/passed value is greater then the current value which it is.
        # self._redis.set_expiration(key, seconds)
        self._expirations[key] = seconds
        self._redis.redis.expire(key, seconds)

    @staticmethod
    def connection(uri: Optional[str] = "redis://localhost:6379"):
        return Redis(uri)
