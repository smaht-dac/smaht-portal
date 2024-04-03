import fakeredis
import json
from typing import Optional
from encoded.ingestion.ingestion_status_cache import IngestionStatusCache


KEY = "some-key"
VALUE = {"some-property": "some-value"}


def _get_ingestion_cache_status_instance(update_interval: Optional[int] = None):
    # Make sure the single instance gets recreated per unit test.
    IngestionStatusCache._singleton_instance = None
    # Set update-interval to no time for no update caching at all.
    if update_interval is not None:
        IngestionStatusCache.REDIS_UPDATE_INTERVAL_SECONDS = update_interval
    fake_redis_client = fakeredis.FakeRedis()
    return IngestionStatusCache.instance(redis_client=fake_redis_client)


def test_ingestion_status_cache_no_update_interval():
    ingestion_status = _get_ingestion_cache_status_instance(update_interval=0)

    ingestion_status.update(KEY, VALUE)

    value = ingestion_status.get(KEY)
    # A "timestamp" property is automatically added by IngestionStatusCache.set.
    del value["timestamp"]
    # A "ttl" property is automatically added by IngestionStatusCache.get.
    del value["ttl"]
    # A "uuid" property (set to the key) is automatically added by IngestionStatusCache.update.
    # Not None here because no update-interval and no update/flush thread nor explicit flush.
    assert value == {"uuid": KEY, **VALUE}

    # Get directly from Redis via IngestionStatusCache._redis_get.
    value = ingestion_status._redis_get(KEY)
    value = json.loads(value)
    del value["timestamp"]
    assert value == {"uuid": KEY, **VALUE}


def test_ingestion_status_cache_long_update_interval():
    ingestion_status = _get_ingestion_cache_status_instance(update_interval=1000)

    ingestion_status.update(KEY, VALUE)

    value = ingestion_status.get(KEY)
    del value["timestamp"]
    del value["ttl"]
    assert value == {"uuid": KEY, **VALUE}

    # Get directly from Redis via IngestionStatusCache._redis_get.
    value = ingestion_status._redis_get(KEY)
    # None here because long update time and no update/flush thread nor explicit flush.
    assert value is None


def test_ingestion_status_cache_long_update_interval_with_flush():

    ingestion_status = _get_ingestion_cache_status_instance(update_interval=1000)

    ingestion_status.update(KEY, VALUE)

    value = ingestion_status.get(KEY)
    del value["timestamp"]
    del value["ttl"]
    assert value == {"uuid": KEY, **VALUE}

    # Get directly from Redis via IngestionStatusCache._redis_get.
    value = ingestion_status._redis_get(KEY)
    # None because long update time and no update/flush thread nor explicit flush.
    assert value is None

    # Flush update cache to Redis.
    ingestion_status.flush()

    # Get directly from Redis via IngestionStatusCache._redis_get.
    # Load JSON because raw _redis_get returns string.
    value = ingestion_status._redis_get(KEY)
    # Not None because though long update-interval we did explicit flush (above).
    value = json.loads(value)
    del value["timestamp"]
    assert value == {"uuid": KEY, **VALUE}


def test_ingestion_status_cache_works_with_json_only():
    ingestion_status_cache = _get_ingestion_cache_status_instance()
