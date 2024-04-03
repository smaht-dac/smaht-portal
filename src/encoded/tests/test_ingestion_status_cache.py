import fakeredis
import json
from encoded.ingestion.ingestion_status_cache import IngestionStatusCache


KEY = "some-key"
VALUE = {"some-property": "some-value"}

def test_ingestion_status_cache_long_update_interval():

    # Make sure the single instance gets recreated per unit test.
    IngestionStatusCache._singleton_instance = None
    # Set update-interval to a long time for no update/flush thread.
    IngestionStatusCache.REDIS_UPDATE_INTERVAL_SECONDS = 1000
    fake_redis_client = fakeredis.FakeRedis()
    ingestion_status = IngestionStatusCache.instance(redis_client=fake_redis_client)

    ingestion_status.update(KEY, VALUE)

    value = ingestion_status.get(KEY)
    del value["timestamp"]
    del value["ttl"]
    assert value == {"uuid": KEY, **VALUE}

    # Get directly from Redis via IngestionStatusCache._redis_get.
    value = ingestion_status._redis_get(KEY)
    # None because long update time and no update/flush thread nor explicit flush.
    assert value is None


def test_ingestion_status_cache_no_update_interval():

    # Make sure the single instance gets recreated per unit test.
    IngestionStatusCache._singleton_instance = None
    # Set update-interval to no time for no update caching at all.
    IngestionStatusCache.REDIS_UPDATE_INTERVAL_SECONDS = 0
    fake_redis_client = fakeredis.FakeRedis()
    ingestion_status = IngestionStatusCache.instance(redis_client=fake_redis_client)

    ingestion_status.update(KEY, VALUE)

    value = ingestion_status.get(KEY)
    # Not None because no update-interval and no update/flush thread nor explicit flush.
    del value["timestamp"]
    del value["ttl"]
    assert value == {"uuid": KEY, **VALUE}

    # Get directly from Redis via IngestionStatusCache._redis_get.
    value = ingestion_status._redis_get(KEY)
    value = json.loads(value)
    del value["timestamp"]
    assert value == {"uuid": KEY, **VALUE}


def test_ingestion_status_cache_long_update_interval_with_flush():

    # Make sure the single instance gets recreated per unit test.
    IngestionStatusCache._singleton_instance = None
    # Set update-interval to no time for no update caching at all.
    IngestionStatusCache.REDIS_UPDATE_INTERVAL_SECONDS = 1000
    fake_redis_client = fakeredis.FakeRedis()
    ingestion_status = IngestionStatusCache.instance(redis_client=fake_redis_client)

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
    assert value == {"uuid": KEY, **VALUE}
