import fakeredis
import json
from typing import Optional
from encoded.ingestion.ingestion_status_cache import IngestionStatusCache


KEY = "some-key"
VALUE_ONE = {"some-property": "some-value"}
VALUE_TWO = {"another-property": 123456789}
VALUE_THREE = {"some-property": True, "yet-another-property": "yet-another-value"}


def get_ingestion_cache_status_instance(update_interval: Optional[int] = None) -> object:
    # Make sure the single instance gets recreated per unit test.
    IngestionStatusCache._singleton_instance = None
    if update_interval is not None:
        IngestionStatusCache.REDIS_UPDATE_INTERVAL_SECONDS = update_interval
    fake_redis_client = fakeredis.FakeRedis()
    return IngestionStatusCache.instance(redis_client=fake_redis_client)


def assert_get_after_update(ingestion_status: object, key: str, value: dict) -> None:
    existing_value = ingestion_status.get(key)
    assert isinstance(existing_value.pop("timestamp", None), str)
    assert isinstance(existing_value.pop("ttl", None), int)
    assert existing_value == {"uuid": key, **value}


def assert_get_from_redis_after_update(ingestion_status: object, key: str, value: dict) -> None:
    existing_value = ingestion_status._redis_get(key)
    existing_value = json.loads(existing_value)
    assert isinstance(existing_value.pop("timestamp", None), str)
    assert existing_value == {"uuid": key, **value}


def assert_get_from_redis_after_update_is_none(ingestion_status: object, key: str) -> None:
    assert ingestion_status._redis_get(key) is None


def test_ingestion_status_cache_basic():

    # Default interval (1 second).
    ingestion_status = get_ingestion_cache_status_instance(update_interval=None)

    assert ingestion_status.get(KEY) == {}
    assert ingestion_status.update(KEY, VALUE_ONE) is True
    # Here since the update-interval is the default of 1 second and much less
    # time than that should have passed between the statement directly above and
    # directly below this comment, the value should not yet actually be in Redis ...
    assert_get_from_redis_after_update_is_none(ingestion_status, KEY)
    # ... but of course we do get the value from a regular get ...
    assert_get_after_update(ingestion_status, KEY, VALUE_ONE)

    assert ingestion_status.update(KEY, VALUE_TWO) is True
    assert_get_after_update(ingestion_status, KEY, {**VALUE_ONE, **VALUE_TWO})

    assert ingestion_status.update(KEY, VALUE_TWO) is True
    assert_get_after_update(ingestion_status, KEY, {**VALUE_ONE, **VALUE_TWO})
    assert ingestion_status.update(KEY, VALUE_THREE) is True
    assert_get_after_update(ingestion_status, KEY, {**VALUE_ONE, **VALUE_TWO, **VALUE_THREE})

    assert ingestion_status.update(KEY, VALUE_THREE) is True
    assert_get_after_update(ingestion_status, KEY, {**VALUE_ONE, **VALUE_TWO, **VALUE_THREE})
    assert ingestion_status.update(KEY, VALUE_THREE) is True
    assert_get_after_update(ingestion_status, KEY, {**VALUE_ONE, **VALUE_TWO, **VALUE_THREE})


def test_ingestion_status_cache_no_update_interval():

    # No interval to test with no update-cache.
    ingestion_status = get_ingestion_cache_status_instance(update_interval=0)

    assert ingestion_status.update(KEY, VALUE_ONE) is True
    assert_get_after_update(ingestion_status, KEY, VALUE_ONE)
    assert_get_from_redis_after_update(ingestion_status, KEY, VALUE_ONE)

    assert ingestion_status.update(KEY, VALUE_TWO) is True
    assert_get_after_update(ingestion_status, KEY, {**VALUE_ONE, **VALUE_TWO})
    assert_get_from_redis_after_update(ingestion_status, KEY, {**VALUE_ONE, **VALUE_TWO})

    assert ingestion_status.update(KEY, VALUE_THREE) is True
    assert_get_after_update(ingestion_status, KEY, {**VALUE_ONE, **VALUE_TWO, **VALUE_THREE})
    assert ingestion_status.update(KEY, VALUE_THREE) is True
    assert_get_after_update(ingestion_status, KEY, {**VALUE_ONE, **VALUE_TWO, **VALUE_THREE})


def test_ingestion_status_cache_long_update_interval():

    # Long interval to test with no Redis write unless/until flush.
    ingestion_status = get_ingestion_cache_status_instance(update_interval=1000)

    assert ingestion_status.update(KEY, VALUE_ONE) is True
    assert_get_after_update(ingestion_status, KEY, VALUE_ONE)
    assert_get_from_redis_after_update_is_none(ingestion_status, KEY)

    assert ingestion_status.update(KEY, VALUE_TWO) is True
    assert_get_after_update(ingestion_status, KEY, {**VALUE_ONE, **VALUE_TWO})
    assert_get_from_redis_after_update_is_none(ingestion_status, KEY)


def test_ingestion_status_cache_long_update_interval_with_flush():

    # Long interval to test with no Redis write unless/until flush.
    ingestion_status = get_ingestion_cache_status_instance(update_interval=1000)

    assert ingestion_status.update(KEY, VALUE_ONE) is True
    assert_get_after_update(ingestion_status, KEY, VALUE_ONE)
    assert_get_from_redis_after_update_is_none(ingestion_status, KEY)

    # Flush update cache to Redis.
    ingestion_status.flush()
    assert_get_from_redis_after_update(ingestion_status, KEY, VALUE_ONE)
    assert_get_after_update(ingestion_status, KEY, VALUE_ONE)

    assert ingestion_status.update(KEY, VALUE_TWO) is True
    assert_get_from_redis_after_update(ingestion_status, KEY, VALUE_ONE)
    assert_get_after_update(ingestion_status, KEY, {**VALUE_ONE, **VALUE_TWO})

    ingestion_status.flush()
    assert_get_from_redis_after_update(ingestion_status, KEY, {**VALUE_ONE, **VALUE_TWO})
    assert_get_after_update(ingestion_status, KEY, {**VALUE_ONE, **VALUE_TWO})
