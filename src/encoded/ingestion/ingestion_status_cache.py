from __future__ import annotations
from collections import namedtuple
from copy import deepcopy
from datetime import datetime
import json
from pyramid.registry import Registry
from redis import Redis, StrictRedis
from ssl import CERT_NONE as SSL_NO_CERTIFICATE
from structlog import getLogger as get_logger
import threading
import time
from urllib.parse import urlparse
from typing import Optional, Union
from dcicutils.misc_utils import get_error_message, VirtualApp
from dcicutils.redis_utils import create_redis_client, RedisBase
from encoded.root import SMAHTRoot as Context


class IngestionStatusCache:
    """
    Minimal IngestionStatusCache wrapper class exposing only what we need here from dcicutils.RedisBase.
    For tracking the progress, on the client-side (smaht-submitr command), of a server-side ingestion
    validation or submission process. Since this class is specifically used only for this purpose and
    since this data is only and inherently transient data, we force all keys written to have a short
    expiration time, by default 3 days (way longer than we need but could be useful for troubleshooting).
    The connection info for this (i.e. e.g. redis://hostname:6379) comes from the main app ini file,
    e.g. development.ini (see the _get_redis_url_from_resource static function below).

    Since Redis updates for this could easily be many 1000s per second, the vast majority being updates
    to existing keys (i.e. the submission_uuid), and since the consumer of this (smaht-submitr) only polls
    for this data every second or so, we limit the writes to occur for the latest data at most once every
    N seconds, where N is one second for now. To do this we actualy write updates to a local in-memory cache,
    and have a separate update thread to flush that cache to Redis periodically (i.e. every one second).
    """
    REDIS_RESOURCE_NAME = "redis.server"
    REDIS_URL = "redis://localhost:6379"
    REDIS_KEY_EXPIRATION_SECONDS = 60 * 60 * 24 * 3
    REDIS_UPDATE_INTERVAL_SECONDS = 1
    REDIS_USE_DCICUTILS_CREATE_CLIENT = False
    RedisResourceType = Optional[Union[str, dict, Context, Registry, VirtualApp]]

    _singleton_instance = None
    _singleton_lock = threading.Lock()
    _update_cache_lock = threading.Lock()
    _redis_lock = threading.RLock()  # R is for reentrant

    def __init__(self, resource: RedisResourceType = REDIS_URL, redis_client: Optional[Redis] = None) -> None:
        # Fail essentially silently so we work without Redis at all (but log).
        if redis_url := IngestionStatusCache._get_redis_url_from_resource(resource):
            # Allow passing in a Redis client for testing (e.g. fakeredis.FakeRedis).
            if not isinstance(redis_client, Redis):
                redis_client = IngestionStatusCache._redis_create_client(redis_url)
            self._redis = RedisBase(redis_client) if redis_client else None
            self._redis_url = redis_url
        else:
            _log_warning(f"Cannot get Redis URL for ingestion-status cache: {resource}")
            self._redis = None
            self._redis_url = None
        # To limit the large number of Redis writes we would normally get (1000s per second),
        # which is wasteful since the client (smaht-submitr) is only polling maybe once per
        # second at most, if the update-interval is set (to greater than zero), then we
        # actually cache writes in-memory, and have an update/flush thread running which
        # flushes this in in-memory cache to Redis only every N (update-interval) seconds.
        self._redis_key_expiration = IngestionStatusCache.REDIS_KEY_EXPIRATION_SECONDS
        self._redis_update_interval = IngestionStatusCache.REDIS_UPDATE_INTERVAL_SECONDS
        if self._redis_update_interval > 0:
            self._update_cache = {}
            self._flush_most_recent = None
            self._flush_count = 0
            self._flush_thread = threading.Thread(target=self._flush_thread_function)
            self._flush_thread.daemon = True
            self._flush_thread.start()
        else:
            self._update_cache = None
            self._flush_most_recent = None
            self._flush_count = 0
            self._flush_thread = None

    def get(self, key: str, sort: bool = False, _updating: bool = False) -> dict:
        if not self._redis:
            return {}
        if (not isinstance(key, str)) or (not key):
            return {}
        value = None
        if self._update_cache is not None:
            with IngestionStatusCache._update_cache_lock:
                value = self._update_cache.get(key, None)
            if value is not None:
                # If we are getting from the update-cache we need to make
                # a copy to prevent the user from being able to change it.
                value = deepcopy(value)
        if value is None:
            if isinstance(value := self._redis_get(key), str):
                try:
                    if not isinstance(value := json.loads(value), dict):
                        return {}
                except Exception:
                    return {}
        if value is not None:
            if _updating is not True:
                # Automatically add a "ttl" property on the way out (unless we are updating).
                value["ttl"] = self._redis_ttl(key)
            return dict(sorted(value.items(), key=lambda item: item[0])) if sort else value
        return {}

    def set(self, key: str, value: dict, _flushing: bool = False) -> bool:
        if not self._redis:
            return False
        if (not isinstance(key, str)) or (not key) or (not isinstance(value, dict)) or (not value):
            return False
        # Automatically add a "timestamp" property on the way in (unless we are flushing).
        if _flushing is not True:
            value = {**value, "timestamp": _now()}
            if self._update_cache is not None:
                with IngestionStatusCache._update_cache_lock:
                    self._update_cache[key] = value
                return True
        set_succeeded = self._redis_set(key, json.dumps(value, default=str))
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
        self._redis_expire(key, self._redis_key_expiration)
        return set_succeeded

    def update(self, uuid: str, value: dict) -> bool:
        """
        This is a higher level function intended to be the main one used for our purposes;
        it merges the given JSON into any already existing value for the key, or creates
        the key with the value if it does not yet exist; and it automatically takes the
        key to be the given (submission) uuid.
        """
        if not self._redis:
            return False
        if (not isinstance(uuid, str)) or (not uuid) or (not isinstance(value, dict)) or (not value):
            return False
        with IngestionStatusCache._redis_lock:
            if existing_value := self.get(uuid, _updating=True):
                return self.set(uuid, {**existing_value, **value})
            else:
                return self.set(uuid, {"uuid": uuid, **value})

    def keys(self, sort: bool = False) -> dict:
        """
        Returns all keys defined (either in our update-cache or directly in Redis).
        This is ONLY of troubleshooting/testing; no paging, could be large;
        though probably not too much so give short-ish expiration enforced.
        """
        if not self._redis:
            return {}
        keys = [key.decode("utf-8") for key in self._redis_keys("*")]
        keys_from_update_cache = None
        if self._update_cache is not None:
            with IngestionStatusCache._update_cache_lock:
                keys_from_update_cache = list(self._update_cache.keys())
        if keys_from_update_cache is not None:
            for key_from_update_cache in keys_from_update_cache:
                if key_from_update_cache not in keys:
                    keys.append(key_from_update_cache)
        keys = list(set(keys))
        if sort:
            keys = sorted(keys)
        return {"key_count": len(keys), "key_expiration": self._redis_key_expiration, "timestamp": _now(), "keys": keys}

    def keys_sorted(self, sort_by: Optional[str] = None) -> dict:
        if not self._redis:
            return {}
        keys_sorted = []
        if isinstance(keys := self.keys().get("keys"), list):
            for key in keys:
                if (value := self.get(key)) and (timestamp := value.get("timestamp")):
                    keys_sorted.append({"key": key,
                                        "file": value.get("file"),
                                        "user": value.get("user_email"),
                                        "consortium": value.get("consortium"),
                                        "submission_center": value.get("submission_center"),
                                        "validation": value.get("ingester_validation"),
                                        "outcome": value.get("ingester_outcome"),
                                        "timestamp": timestamp})
        keys_sorted = sorted(keys_sorted, key=lambda key: key.get("timestamp") or "", reverse=True)
        return {"key_count": len(keys_sorted), "key_expiration": self._redis_key_expiration, "timestamp": _now(), "keys": keys_sorted}

    def flush(self, key: Optional[str] = None) -> None:
        if not self._redis or (self._update_cache is None):
            return
        update_single_value = None
        if self._update_cache is not None:
            with IngestionStatusCache._update_cache_lock:
                if isinstance(key, str) and key:
                    if (update_single_value := self._update_cache.pop(key, None)) is None:
                        return
                else:
                    update_cache = self._update_cache
                    self._update_cache = {}
        if update_single_value is not None:
            self.set(key, update_single_value, _flushing=True)
        else:
            for key, value in update_cache.items():
                self.set(key, value, _flushing=True)

    def info(self) -> dict:
        if not self._redis:
            return {}
        # Remember for our use-case - smaht-portal AND smaht-ingester - we have
        # TWO separate processes, so any in-memory info/stats are only per process;
        # so in fact there is NO way to see any of this info here which is NOT
        # actually stored in Redis, in for the smaht-ingester process. We COULD
        # actually write such stats/info themselves to Redis, but no great need;
        # this is just for general troubleshooting/testing purposes.
        return {
            "redis_url": self._redis_url,
            "redis_expiration": self._redis_key_expiration,
            "redis_update_interval": self._redis_update_interval,
            "redis_key_count": self._redis_dbsize(),
            "update_cache_count": len(self._update_cache) if self._update_cache is not None else None,
            "flush_thread": self._flush_thread.ident if self._flush_thread else None,
            "flush_most_recent": self._flush_most_recent,
            "flush_count": self._flush_count,
            "timestamp": _now(),
            "redis_info": self._redis_info()
        }

    def _flush_thread_function(self) -> None:
        _log_note(f"Starting ingestion-status cache flush thread.")
        try:
            while True:
                time.sleep(self._redis_update_interval)
                self.flush()
                self._flush_most_recent = _now()
                self._flush_count += 1
        except Exception as e:
            _log_error(f"Unexpected termination of ingestion-status cache flush thread.", e)

    @staticmethod
    def connection(uuid: str, resource: RedisResourceType = REDIS_URL, redis_client: Optional[Redis] = None) -> object:
        """
        This is a higher level convenience function which takes the (submission) uuid as
        an argument so the caller does not have to included it in subsequent calls on the
        cache, and also returns suitable cache object whether or not Redis is running/enabled.
        """
        if not isinstance(uuid, str) or not uuid:
            return None
        cache = IngestionStatusCache.instance(resource, redis_client=redis_client)
        def get(sort: bool = False) -> Optional[dict]:  # noqa
            nonlocal uuid, cache
            return cache.get(uuid, sort=sort) if cache else None
        def set(value: dict) -> bool:  # noqa
            nonlocal uuid, cache
            cache.set(uuid, value) if cache else False
        def update(value: dict) -> bool:  # noqa
            nonlocal uuid, cache
            cache.update(uuid, value) if cache else False
        def flush() -> None:  # noqa
            nonlocal uuid, cache
            cache.flush(uuid) if cache else None
        ingestion_status_connection_type = namedtuple("connection", ["get", "set", "update", "flush"])
        return ingestion_status_connection_type(get, set, update, flush)

    @staticmethod
    def instance(resource: RedisResourceType = REDIS_URL, redis_client: Optional[Redis] = None) -> IngestionStatusCache:
        # This gets a singleton of an IngestionStatusCache object; slightly odd having
        # a single created with an argument, but we know that no matter where it is
        # coming from (portal or ingester) this will always resolve to the same thing.
        if IngestionStatusCache._singleton_instance is None:
            with IngestionStatusCache._singleton_lock:
                if IngestionStatusCache._singleton_instance is None:
                    IngestionStatusCache._singleton_instance = IngestionStatusCache(resource, redis_client=redis_client)
        return IngestionStatusCache._singleton_instance

    @staticmethod
    def _get_redis_url_from_resource(resource: RedisResourceType = REDIS_URL,
                                     resource_name: str = REDIS_RESOURCE_NAME) -> Optional[str]:
        # The redis.server value is defined in the main app ini file (e.g. development.ini).
        # This deals with getting that value via a vapp, context, registry, or settings object;
        # or a literal string may be specified as well. In practice this will only be a context
        # from the the portal ingestion-status endpoint (see ingestion_status), or from a vapp
        # in the ingester listener (see loadxl_extension), or a vapp in the main ingester
        # process (see snovault.ingestion.ingestion_listener).
        try:
            if not resource:
                return None
            elif isinstance(resource, str):
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

    # All actual lower-level Redis interaction goes through these functions below.

    @staticmethod
    def _redis_create_client(redis_url: str, ping: bool = True) -> Redis:
        try:
            if IngestionStatusCache.REDIS_USE_DCICUTILS_CREATE_CLIENT:
                return create_redis_client(url=redis_url, ping=ping)
            # We are (for our SMaHT/portal/submitr purposes) creating an SSL Redis client,
            # i.e. using the "rediss" schema (rather than "redis"), but not using a SSL
            # certificate, at least for now (2024-04-02), we got this error:
            #
            #  [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: unable to get local issuer certificate
            #
            # So we do NOT use the dcicutils.redis.redis_utilas.create_redis_client but
            # rather create the Redis client here (FYI not able to use Redis.from_url,
            # as is used by dcicutils, and specify no certificate).
            url = urlparse(redis_url)
            host = url.hostname
            port = url.port
            ssl = url.scheme == "rediss"
            redis_client = StrictRedis(host=host, port=port, ssl=ssl, ssl_cert_reqs=SSL_NO_CERTIFICATE)
            _log_note(f"Created Redis client for ingestion-status cache: {redis_url}")
            if ping:
                try:
                    _log_note(f"Redis client ping for ingestion-status cache OK: {redis_client.ping()}")
                except Exception as e:
                    _log_warning(f"Cannot ping Redis client ingestion-status cache: {redis_url}", e)
            return redis_client
        except Exception as e:
            _log_warning(f"Cannot create Redis client for ingestion-status cache: {redis_url}", e)
            return None

    def _redis_get(self, key):
        try:
            with IngestionStatusCache._redis_lock:
                return self._redis.get(key)
        except Exception as e:
            _log_error(f"Cannot get Redis key from ingestion-status cache: {key}", e)
            return None

    def _redis_set(self, key, value):
        try:
            with IngestionStatusCache._redis_lock:
                return self._redis.set(key, value)
        except Exception as e:
            _log_error(f"Cannot set Redis key to ingestion-status cache: {key}", e)

    def _redis_expire(self, key, expiration):
        try:
            self._redis.redis.expire(key, expiration)
        except Exception as e:
            _log_error(f"Cannot set Redis key expiration to ingestion-status cache: {key} {expiration}", e)

    def _redis_ttl(self, key):
        try:
            return self._redis.ttl(key)
        except Exception as e:
            _log_error(f"Cannot get Redis key ttl from ingestion-status cache: {key}", e)
            return None

    def _redis_info(self):
        try:
            return self._redis.info()
        except Exception as e:
            _log_error(f"Cannot get Redis info from ingestion-status cache", e)
            return None

    def _redis_keys(self, pattern):
        try:
            return self._redis.redis.keys(pattern)
        except Exception as e:
            _log_error(f"Cannot get Redis keys for ingestion-status.", e)
            return []

    def _redis_dbsize(self):
        try:
            return self._redis.redis.dbsize()
        except Exception as e:
            _log_error(f"Cannot get Redis key count for ingestion-status.", e)
            return []


def _now() -> str:
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%fZ")


_log = get_logger(__name__)

def _log_error(message: str, exception: Optional[Exception] = None) -> None:
    _log.error(f"ERROR: {message}")
    if isinstance(exception, Exception):
        _log.error(get_error_message(exception, full=True))


def _log_warning(message: str, exception: Optional[Exception] = None) -> None:
    _log.error(f"WARNING-ONLY: {message}")
    if isinstance(exception, Exception):
        _log.error(get_error_message(exception, full=True))  # sic: warning not error


def _log_note(message: str) -> None:
    _log.error(f"NOTE-ONLY: {message}")  # sic: note/info not error
