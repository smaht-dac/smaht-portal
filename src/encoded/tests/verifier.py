from dcicutils.misc_utils import ignored, PRINT
from functools import wraps
from snovault import TYPES
from .test_create_mapping import test_create_mapping_correctly_maps_embeds
# from .test_embedding import test_add_default_embeds, test_manual_embeds
# from .test_schemas import compute_master_mixins, test_load_schema


def verifier(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        PRINT(f"running tests {func.__name__}")
        try:
            res = func(*args, **kwargs)
        except Exception as e:
            PRINT(f"test failed with exception {e}")
        else:
            PRINT("success")
            return res
    return wrapper


@verifier
def verify_get_from_es(item_uuid, indexer_testapp, registry):
    ignored(registry)
    # get from elasticsearch
    es_item = indexer_testapp.get("/" + item_uuid + "/?datastore=elasticsearch").maybe_follow(status=200).json
    item_type = es_item['@type'][0]
    ensure_basic_data(es_item, item_type)
    return es_item, item_type


@verifier
def verify_get_by_accession(es_item, item_type, indexer_testapp):
    # get by accession
    accession = es_item.get('accession')
    if accession:  # some items don't have acessions
        item_by_accession = indexer_testapp.get("/" + accession).follow(status=200).json
        ensure_basic_data(item_by_accession, item_type)


@verifier
def verify_get_from_db(item_uuid, item_type, indexer_testapp):
    # get from database
    db_item = indexer_testapp.get("/" + item_uuid + "/?datastore=database").follow(status=200).json
    ensure_basic_data(db_item, item_type)


@verifier
def verify_profile(item_type, indexer_testapp):
    # is this something we actually know about?
    profile = indexer_testapp.get("/profiles/" + item_type + ".json").json
    assert profile
    # transform profile page path to camel case item type
    item_type_camel = profile['id'].strip('.json').split('/')[-1]
    return item_type_camel


# @verifier
# def verify_schema(item_type_camel, registry):
#     # test schema
#     test_load_schema(item_type_camel + ".json", compute_master_mixins(), registry)


@verifier
def verify_can_embed(item_type_camel, es_item, indexer_testapp, registry):
    # get the embeds
    pyr_item_type = registry[TYPES].by_item_type[item_type_camel]
    embeds = pyr_item_type.embedded

    assert embeds == pyr_item_type.factory.embedded
    got_embeds = indexer_testapp.get(es_item['@id'] + "@@embedded").json
    assert got_embeds


@verifier
def verify_indexing(item_uuid, indexer_testapp):
    # test indexing this bad by
    res = indexer_testapp.get("/" + item_uuid + "/@@index-data")
    assert res


# @verifier
# def verify_embeds(registry, item_type):
#     test_add_default_embeds(registry, item_type)
#     test_manual_embeds(registry, item_type)


@verifier
def verify_mapping(registry, item_type):
    test_create_mapping_correctly_maps_embeds(registry, item_type)


def verify_item(item_uuid, indexer_testapp, testapp, registry):
    ignored(testapp)
    es_item, item_type = verify_get_from_es(item_uuid, indexer_testapp, registry)
    verify_get_by_accession(es_item, item_type, indexer_testapp)
    verify_get_from_db(item_uuid, item_type, indexer_testapp)
    item_type_camel = verify_profile(item_type, indexer_testapp)
    # verify_schema(item_type_camel, registry)
    verify_can_embed(item_type_camel, es_item, indexer_testapp, registry)
    verify_indexing(item_uuid, indexer_testapp)
    # verify_embeds(registry, item_type_camel)
    verify_mapping(registry, item_type_camel)


def ensure_basic_data(item_data, item_type=None):
    # ensure we have basic identifing properties
    assert item_data
    if not item_type:
        item_type = item_data['@type'][0]
    assert item_data['uuid']
    assert item_data['@id']
    assert item_type in item_data['@type']
