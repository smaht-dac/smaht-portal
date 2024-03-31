from collections import namedtuple
from datetime import datetime
import json
from pyramid.registry import Registry
import structlog
import threading
from typing import Optional, Union
from dcicutils.redis_utils import create_redis_client, RedisBase
from dcicutils.misc_utils import VirtualApp
from encoded.root import SMAHTRoot as Context

log = structlog.getLogger(__name__)

class IngestionStatusCache:
    """
    Minimal IngestionStatusCache wrapper class exposing only what we need here from dcicutils.RedisBase.
    For tracking the progress, on the client-side (smaht-submitr command), of a server-side ingestion
    validation or submission process. Since this class is specifically used only for this purpose and
    since this data is only and inherently transient data, we force all keys written to have a short
    expiration time, by default 3 days (way longer than we need but could be useful for troubleshooting).
    The connection info for this (i.e. e.g. redis://hostname:6379) comes from the main app ini file,
    e.g. development.ini (see the _get_redis_uri_from_resource static function below).
    """
    REDIS_RESOURCE_NAME = "redis.server"
    REDIS_KEY_EXPIRATION_SECONDS = 60 * 60 * 24 * 3
    DEFAULT_REDIS_URI = "redis://localhost:6379"
    ResourceType = Optional[Union[str, dict, Context, Registry, VirtualApp]]

    _singleton_instance = None
    _singleton_lock = threading.Lock()

    def __init__(self, resource: ResourceType = DEFAULT_REDIS_URI) -> None:
        # Fail essentially silently so we work without Redis at all (but log).
        if not (redis_uri := IngestionStatusCache._get_redis_uri_from_resource(resource)):
            log.error(f"Cannot get Redis URI for ingestion-status cache: {resource}")
            self._redis = None
            return
        try:
            self._redis = RedisBase(create_redis_client(url=redis_uri))
        except Exception as e:
            log.error(f"Cannot create Redis object for ingestion-status cache: {str(e)}")
            self._redis = None

    def get(self, uuid: str, sort: bool = False) -> dict:
        if not self._redis:
            return {}
        if (not isinstance(uuid, str)) or (not uuid):
            return {}
        if isinstance(value := self._redis.get(uuid), str):
            try:
                response = json.loads(value)
                return dict(sorted(response.items(), key=lambda item: item[0])) if sort else response
            except Exception:
                pass
        return {}

    def update(self, uuid: str, value: dict) -> None:
        """
        This is a higher level function intended to be the main one used for our purposes;
        it merges the given JSON into any already existing value for the key; and it
        automatically takes the key to be the given (submission) uuid.
        """
        if not self._redis:
            return
        if (not isinstance(uuid, str)) or (not uuid) or (not isinstance(value, dict)) or (not value):
            return
        value = {"uuid": uuid, **self.get(uuid), **value, "timestamp": IngestionStatusCache._now()}
        self._redis.set(uuid, json.dumps(value, default=str))
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
        self._redis.redis.expire(uuid, IngestionStatusCache.REDIS_KEY_EXPIRATION_SECONDS)

    @staticmethod
    def connection(uuid: str, resource: ResourceType = DEFAULT_REDIS_URI) -> object:
        """
        This is a higher level convenience function which takes the (submission)  uuid as
        an argument so the caller does not have to included it in subsequent calls on the
        cache, and also returns suitable cache object whether or not Redis is running/enabled. 
        """
        cache = IngestionStatusCache.instance(resource)
        def update(value: dict) -> None:  # noqa
            nonlocal uuid, cache
            cache.update(uuid, value) if cache else None
        def set(value: dict) -> None:  # noqa
            nonlocal uuid, cache
            cache.set(uuid, value) if cache else None
        def get(value: dict, sort: bool = False) -> Optional[dict]:  # noqa
            nonlocal uuid, cache
            return cache.get(uuid, sort=sort) if cache else None
        return namedtuple("ingestion_status_cache", ["update", "set", "get"])(update, set, get)

    @staticmethod
    def instance(resource: ResourceType = DEFAULT_REDIS_URI):
        # This gets a singleton of an IngestionStatusCache object; slightly odd
        # having a single created with an argument, but no matter where it is coming
        # from (portal or ingester) this will alwasys resolve to the same thing.
        if IngestionStatusCache._singleton_instance is None:
            with IngestionStatusCache._singleton_lock:
                if IngestionStatusCache._singleton_instance is None:
                    IngestionStatusCache._singleton_instance = IngestionStatusCache(resource)
        return IngestionStatusCache._singleton_instance

    @staticmethod
    def _get_redis_uri_from_resource(resource: ResourceType = DEFAULT_REDIS_URI,
                                     resource_name: str = REDIS_RESOURCE_NAME) -> Optional[str]:
        # The redis.server value is defined in the main app ini file (e.g. development.ini).
        # This deals with getting that value via a vapp, context, registry, or settings object;
        # or a literal string may be specified as well. In practice this will only be a context
        # from the the portal ingestion-status endpoint (see ingestion_status module) or from
        # a vapp in the ingester listener (see loadxl_extension).
        try:
            if not resource:
                return None
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
            elif hasattr(resource, "registry") and isinstance(resource.registry, Registry):
                return resource.registry.settings.get(resource_name)
        except Exception:
            pass
        return None

    @staticmethod
    def _now() -> str:
        return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%fZ")
