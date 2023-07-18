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
from snovault import loadxl


pytestmark = [pytest.mark.working, pytest.mark.indexing]


# All compatible postgres versions
POSTGRES_COMPATIBLE_MAJOR_VERSIONS = ['11', '12', '13', '14', '15']


# subset of collections to run test on
TEST_COLLECTIONS = ['file_processed']


def test_postgres_version(session):
    """ Tests that the local postgres is running one of the compatible versions """
    (version_info,) = session.query(func.version()).one()
    PRINT("version_info=", version_info)
    assert isinstance(version_info, str)
    assert re.match("PostgreSQL (%s)([.][0-9]+)? " % '|'.join(POSTGRES_COMPATIBLE_MAJOR_VERSIONS), version_info)


@pytest.fixture(scope='module')
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


