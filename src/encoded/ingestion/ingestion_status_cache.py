import json
from pyramid.registry import Registry
import threading
from typing import Any, Optional, Union
from dcicutils.redis_utils import create_redis_client, RedisBase
from dcicutils.misc_utils import VirtualApp
from encoded.root import SMAHTRoot  as Context

class IngestionStatusCache:
    """
    Minimal IngestionStatusCache wrapper class exposing only what we need here from dcicutils.RedisBase.
    For tracking the progress, on the client-side (smaht-submitr command) of a server-side ingestion
    validation or submission process. Since this class is specifically used only for this purpose and
    since this data is only and inherently transient data, we force all keys written to have a short
    expiration time, by default 24 hours (only this long just for easier troubleshooting if necessary).
    The connection info for this (i.e. e.g. redis://hostname:6379) comes from the main app ini file,
    e.g. development.ini (see the _get_redis_uri_from_resource static function below).
    """
    DEFAULT_REDIS_URI = "redis://localhost:6379"
    DEFAULT_REDIS_KEY_EXPIRATION_SECONDS = 60 * 60 * 24
    ResourceType = Optional[Union[str, dict, Context, Registry, VirtualApp]]

    _singleton_instance = None
    _singleton_lock = threading.Lock()

    def __init__(self, resource: ResourceType = DEFAULT_REDIS_URI, expiration: Optional[int] = None) -> None:
        if not (redis_uri := IngestionStatusCache._get_redis_uri_from_resource(resource)):
            raise Exception(f"Cannot get Redis URI for ingestion-status cache: {str(resource)}")
        self._redis = RedisBase(create_redis_client(url=redis_uri))
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
    def connection(resource: ResourceType = DEFAULT_REDIS_URI):
        # This gets a singleton of an IngestionStatusCache object; slightly odd
        # having a single created with an argument, but no matter where it is coming
        # from (portal or ingester) this will alwasys resolve to the same thing.
        if IngestionStatusCache._singleton_instance is None:
            with IngestionStatusCache._singleton_lock:
                if IngestionStatusCache._singleton_instance is None:
                    IngestionStatusCache._singleton_instance = IngestionStatusCache(resource)
        return IngestionStatusCache._singleton_instance

    @staticmethod
    def _get_redis_uri_from_resource(resource: ResourceType, resource_name: str = "redis.server") -> Optional[str]:
        # The redis.server value is defined in the main app ini file (e.g. development.ini).
        # This deals with getting that value via a vapp, context, registry, or settings object;
        # or a literal string may be specified as well. In practice this will only be a context
        # from the the portal ingestion-status endpoint (see ingestion_status module) or from
        # a vapp in the ingester listener (see loadxl_extension).
        try:
            if isinstance(resource, str):
                return resource
            elif isinstance(resource, dict):
                return resource.get(resource_name)
            elif isinstance(resource, Context):
                return resource.registry.settings.get(resource_name)
            elif isinstance(resource, Registry):
                return resource.settings.get(resource_name)
            elif isinstance(resource, VirtualApp):
                return resource.app.registry.settings.get(resource_name)
        except Exception:
            pass
        return None
