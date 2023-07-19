""" Test full indexing setup

The fixtures in this module setup a full system with postgresql and
elasticsearch running as subprocesses.
"""
import json
import os
import pkg_resources
import pytest
import re
import time
import transaction
import uuid

from dcicutils.misc_utils import PRINT
from dcicutils.qa_utils import notice_pytest_fixtures, Eventually
from snovault.tools import index_n_items_for_testing, make_es_count_checker
from snovault import DBSESSION, TYPES
from snovault.elasticsearch import create_mapping, ELASTIC_SEARCH
from snovault.elasticsearch.create_mapping import (
    type_mapping,
    create_mapping_by_type,
    build_index_record,
    compare_against_existing_mapping
)
from snovault.elasticsearch.indexer_utils import get_namespaced_index, compute_invalidation_scope
from snovault.elasticsearch.interfaces import INDEXER_QUEUE
from snovault.storage import Base
from sqlalchemy import MetaData, func, exc
from timeit import default_timer as timer
from unittest import mock
from zope.sqlalchemy import mark_changed
from .. import main
from .verifier import verify_item
from snovault import loadxl


pytestmark = [pytest.mark.working, pytest.mark.indexing]


# All compatible postgres versions
POSTGRES_COMPATIBLE_MAJOR_VERSIONS = ['11', '12', '13', '14', '15']


# subset of collections to run test on
TEST_COLLECTIONS = ['testing_post_put_patch', 'file_processed']


def test_postgres_version(session):
    """ Tests that the local postgres is running one of the compatible versions """
    (version_info,) = session.query(func.version()).one()
    PRINT("version_info=", version_info)
    assert isinstance(version_info, str)
    assert re.match("PostgreSQL (%s)([.][0-9]+)? " % '|'.join(POSTGRES_COMPATIBLE_MAJOR_VERSIONS), version_info)


@pytest.fixture(scope='session')
def es_app(es_app_settings, request):
    notice_pytest_fixtures(request)
    # for now, don't run with mpindexer. Add `True` to params above to do so
    # if request.param:
    #     # we disable the MPIndexer since the build runs on a small machine
    #     # snovault should be testing the mpindexer - Will 12/12/2020
    #     es_app_settings['mpindexer'] = True
    app = main({}, **es_app_settings)

    yield app

    db_session = app.registry[DBSESSION]
    # Dispose connections so postgres can tear down.
    db_session.bind.pool.dispose()


@pytest.fixture
def setup_and_teardown(es_app):
    """
    Run create mapping and purge queue before tests and clear out the
    DB tables after the test
    """

    # BEFORE THE TEST - run create mapping for tests types and clear queues
    create_mapping.run(es_app, collections=TEST_COLLECTIONS, skip_indexing=True)
    es_app.registry[INDEXER_QUEUE].clear_queue()

    yield  # run the test

    # AFTER THE TEST
    session = es_app.registry[DBSESSION]
    connection = session.connection().connect()
    meta = MetaData(bind=session.connection())
    meta.reflect()
    # sqlalchemy 1.4 - use TRUNCATE instead of DELETE
    while True:
        try:
            table_names = ','.join(table.name for table in reversed(Base.metadata.sorted_tables))
            connection.execute(f'TRUNCATE {table_names} RESTART IDENTITY;')
            break
        except exc.OperationalError as e:
            if 'statement timeout' in str(e):
                continue
            else:
                raise
        except exc.InternalError as e:
            if 'current transaction is aborted' in str(e):
                break
            else:
                raise
    session.flush()
    mark_changed(session())  # Has it always changed? -kmp 12-Oct-2022
    transaction.commit()


@pytest.fixture
def bam_format(es_testapp):
    return es_testapp.post_json('/file_format', {
        'file_format': 'bam',
        'standard_file_extension': 'bam',
        'other_allowed_extensions': ['bam.gz'],
        'valid_item_types': ["FileSubmitted", "FileReference", "FileProcessed"]
    }, status=201).json['@graph'][0]


def test_indexing_simple(es_app, setup_and_teardown, es_testapp, indexer_testapp):
    """ This test (and its variants across other portals) essentially do the same thing - verify that the indexer
        is working in response to post requests and that mappings are created successfully for a simple type
    """
    notice_pytest_fixtures(setup_and_teardown)  # unused here, but has a side-effect

    es = es_app.registry['elasticsearch']
    namespaced_ppp = get_namespaced_index(es_app, 'testing_post_put_patch')
    doc_count = es.count(index=namespaced_ppp).get('count')
    assert doc_count == 0
    # First post a single item so that subsequent indexing is incremental
    es_testapp.post_json('/testing-post-put-patch/', {'required': ''})

    index_n_items_for_testing(indexer_testapp, 1, max_tries=30)

    res = es_testapp.post_json('/testing-post-put-patch/', {'required': ''})
    uuid = res.json['@graph'][0]['uuid']

    index_n_items_for_testing(indexer_testapp, 1)

    Eventually.call_assertion(make_es_count_checker(2, es=es, namespaced_index=namespaced_ppp))

    @Eventually.consistent(tries=25, wait_seconds=1)
    def check_for_uuids():
        res = es_testapp.get('/search/?type=TestingPostPutPatch')
        uuids = [indv_res['uuid'] for indv_res in res.json['@graph']]
        assert res.json['total'] >= 2
        assert uuid in uuids

    namespaced_indexing = get_namespaced_index(es_app, 'indexing')
    indexing_doc = es.get(index=namespaced_indexing, id='latest_indexing')
    indexing_source = indexing_doc['_source']
    assert 'indexing_count' in indexing_source
    assert 'indexing_finished' in indexing_source
    assert 'indexing_content' in indexing_source
    assert indexing_source['indexing_status'] == 'finished'
    assert indexing_source['indexing_count'] > 0
    testing_ppp_mappings = es.indices.get_mapping(index=namespaced_ppp)[namespaced_ppp]
    assert 'mappings' in testing_ppp_mappings
    testing_ppp_settings = es.indices.get_settings(index=namespaced_ppp)[namespaced_ppp]
    assert 'settings' in testing_ppp_settings
    # ensure we only have 1 shard for tests
    assert testing_ppp_settings['settings']['index']['number_of_shards'] == '1'


def test_create_mapping_on_indexing(es_app, setup_and_teardown):
    """
    Test overall create_mapping functionality using app.
    Do this by checking es directly before and after running mapping.
    Delete an index directly, run again to see if it recovers.
    """
    notice_pytest_fixtures(setup_and_teardown)
    es = es_app.registry[ELASTIC_SEARCH]
    item_types = TEST_COLLECTIONS
    # check that mappings and settings are in index
    for item_type in item_types:
        type_mapping(es_app.registry[TYPES], item_type)
        namespaced_index = get_namespaced_index(es_app, item_type)
        item_index = es.indices.get(index=namespaced_index)
        found_index_mapping_emb = item_index[namespaced_index]['mappings']['properties']['embedded']
        found_index_settings = item_index[namespaced_index]['settings']
        assert found_index_mapping_emb
        assert found_index_settings
        # compare the manually created mapping to the one in ES
        full_mapping = create_mapping_by_type(item_type, es_app.registry)
        item_record = build_index_record(full_mapping, item_type)
        # below is True if the found mapping matches manual one
        assert compare_against_existing_mapping(es, namespaced_index, item_type, item_record, True)


def test_file_processed_detailed(es_app, setup_and_teardown, es_testapp, indexer_testapp, bam_format):
    notice_pytest_fixtures(setup_and_teardown)
    # post file_processed
    item = {
        'file_format': bam_format.get('@id'),
        'filename': 'test.bam',
        'status': 'uploading'
    }
    fp_res = es_testapp.post_json('/file_processed', item)
    test_fp_atid = fp_res.json['@graph'][0]['@id']
    test_fp_uuid = fp_res.json['@graph'][0]['uuid']
    es_testapp.post_json('/file_processed', item)
    index_n_items_for_testing(indexer_testapp, 1)

    # Todo, input a list of accessions / uuids:
    verify_item(test_fp_atid, indexer_testapp, es_testapp, es_app.registry)
    # While we're here, test that _update of the file properly
    # queues the file with given relationship
    indexer_queue = es_app.registry[INDEXER_QUEUE]
    rel_file = {
        'file_format': bam_format.get('@id')
    }
    rel_res = es_testapp.post_json('/file_processed', rel_file)
    rel_uuid = rel_res.json['@graph'][0]['uuid']
    # now update the original file with the relationship
    # ensure rel_file is properly queued
    related_files = [{'relationship_type': 'derived from', 'file': rel_uuid}]
    es_testapp.patch_json('/' + test_fp_atid, {'related_files': related_files}, status=200)
    time.sleep(2)
    # may need to make multiple calls to indexer_queue.receive_messages
    received = []
    received_batch = None
    while received_batch is None or len(received_batch) > 0:
        received_batch = indexer_queue.receive_messages()
        received.extend(received_batch)
    to_replace = []
    to_delete = []
    found_fp_sid = None
    found_rel_sid = None
    # keep track of the PATCH of the original file and the associated PATCH
    # of the related file. Compare uuids
    for msg in received:
        json_body = json.loads(msg.get('Body', {}))
        if json_body['uuid'] == test_fp_uuid and json_body['method'] == 'PATCH':
            found_fp_sid = json_body['sid']
            to_delete.append(msg)
        elif json_body['uuid'] == rel_uuid and json_body['method'] == 'PATCH':
            assert json_body['info'] == f"queued from {test_fp_uuid} _update"
            found_rel_sid = json_body['sid']
            to_delete.append(msg)
        else:
            to_replace.append(msg)
    indexer_queue.delete_messages(to_delete)
    indexer_queue.replace_messages(to_replace, vis_timeout=0)
    assert found_fp_sid is not None and found_rel_sid is not None
    assert found_rel_sid > found_fp_sid  # sid of related file is greater


def test_real_validation_error(es_app, setup_and_teardown, indexer_testapp, es_testapp, bam_format):
    """
    Create an item (file-processed) with a validation error and index,
    to ensure that validation errors work
    """
    notice_pytest_fixtures(setup_and_teardown)
    es = es_app.registry[ELASTIC_SEARCH]
    fp_body = {
        'schema_version': '3',
        'uuid': str(uuid.uuid4()),
        'file_format': bam_format.get('uuid'),
        'file_classification': 'unprocessed file',  # validation error - this enum is not present
        'higlass_uid': 1  # validation error -- higlass_uid should be string
    }
    res = es_testapp.post_json('/files-processed/?validate=false&upgrade=False',
                               fp_body, status=201).json
    fp_id = res['@graph'][0]['@id']
    val_err_view = es_testapp.get(fp_id + '@@validation-errors', status=200).json
    assert val_err_view['@id'] == fp_id
    assert val_err_view['validation_errors'] == []

    # call to /index will throw MissingIndexItemException multiple times,
    # since associated file_format are not indexed.
    # That's okay if we don't detect that it succeeded, keep trying until it does
    index_n_items_for_testing(indexer_testapp, 1)
    time.sleep(2)
    namespaced_fp = get_namespaced_index(es_app, 'file_processed')
    es_res = es.get(index=namespaced_fp, id=res['@graph'][0]['uuid'])
    assert len(es_res['_source'].get('validation_errors', [])) == 2
    # check that validation-errors view works
    val_err_view = es_testapp.get(fp_id + '@@validation-errors', status=200).json
    assert val_err_view['@id'] == fp_id
    assert val_err_view['validation_errors'] == es_res['_source']['validation_errors']


