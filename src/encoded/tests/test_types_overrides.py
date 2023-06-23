import pytest


def test_user(testapp):
    """ Tests that we can post a user under the override type definition """
    testapp.post_json('/User', {
        'first_name': 'Test',
        'last_name': 'Admin',
        'email': 'admin@example.org',
        'groups': ['admin'],
        'status': 'current'
    }, status=201)


def test_file_format(testapp):
    """ Tests that we can post a file format under the overridden type
        definition
    """
    testapp.post_json('/FileFormat', {
        'file_format': 'fastq',
        'standard_file_extension': 'fastq.gz',
        'other_allowed_extensions': ['fq.gz'],
        'valid_item_types': ["FileSubmitted"]
    }, status=201)


def test_workflow_types(testapp):
    """ Tests that we can post a workflow under the overridden type definition """
    res = testapp.post_json('/Workflow', {
        'title': 'test workflow',
        'name': 'test_workflow',
    }, status=201).json['@graph'][0]
    wfl_run_awsem = {
        'run_platform': 'AWSEM',
        'parameters': [],
        'workflow': res['@id'],
        'title': u'md5 run 2017-01-20 13:16:11.026176',
        'awsem_job_id': '1235',
        'run_status': 'started',
    }
    testapp.post_json('/WorkflowRunAwsem', wfl_run_awsem, status=201)
    wfl_run = {
        'run_platform': 'SBG',
        'parameters': [],
        'workflow': res['@id'],
        'title': u'md5 run 2017-01-20 13:16:11.026176',
        'run_status': 'started',
    }
    testapp.post_json('/workflow_run', wfl_run, status=201)


def test_document(testapp):
    """ Tests that we can post a document item under the overridden type definition """
    testapp.post_json('/Document', {
        'description': 'test'
    }, status=201)


def test_higlass_view_config(testapp):
    """ Tests that we can post a higlass_view_config under the overridden type
        definition """
    testapp.post_json('/HiglassViewConfig', {
        'genome_assembly': 'GRCh38'
    }, status=201)


def test_image(testapp):
    """ Tests that we can post an image item under the overridden type definition """
    testapp.post_json('/Image', {
        'description': 'test'
    }, status=201)


def test_qc_generic(testapp):
    """ Tests that we can post a qc generic item under the overridden type definition """
    testapp.post_json('/QualityMetricGeneric', {
        'name': 'test qc'
    }, status=201)


def test_software(testapp):
    """ Tests that we can post a software item under the overridden type definition """
    testapp.post_json('/Software', {
        'name': 'test software'
    }, status=201)


def test_tracking_item(testapp):
    """ Tests that we can post a tracking item under the overridden type definition """
    testapp.post_json('/TrackingItem', {
        'tracking_type': 'other'
    }, status=201)


def test_static_section(testapp):
    """ Tests that we can post a static section under the overridden type definition """
    testapp.post_json('/StaticSection', {
        'name': 'test section'
    }, status=201)


def test_page(testapp):
    """ Tests that we can post a page under the overridden type definition """
    testapp.post_json('/Page', {
        'name': 'test page'
    }, status=201)


@pytest.mark.skip  # will not work until attribution issue repaired
def test_filter_set(testapp):
    """ Tests that we can post a filter set item under the overridden type definition """
    testapp.post_json('/FilterSet', {
        'title': 'test filterset'
    }, status=201)


def test_meta_workflow(testapp):
    """ Tests that we can post a workflow under the overridden types definition """
    res = testapp.post_json('/MetaWorkflow', {
        'title': 'test metaworkflow',
        'name': 'test metaworkflow'
    }, status=201).json['@graph'][0]
    testapp.post_json('/MetaWorkflowRun', {
        'meta_workflow': res['uuid']
    }, status=201)


def test_file_types(testapp):
    """ Tests that we can post files under the overriden type definitions """
    testapp.post_json('/FileFormat', {
        'file_format': 'fastq',
        'standard_file_extension': 'fastq.gz',
        'other_allowed_extensions': ['fq.gz'],
        'valid_item_types': ["FileSubmitted", "FileProcessed", "FileReference"]
    }, status=201)
    submitted_file = {
        'uuid': 'f99fe12f-79f9-4c2c-b0b5-07fc20d7ce1c',
        'file_format': 'fastq',
        'md5sum': '00000000000000000000000000000000',
        'filename': 'my.fastq.gz',
        'status': 'uploaded',
    }
    testapp.post_json('/FileSubmitted', submitted_file, status=201)
    processed_file = {
        'uuid': 'f99fe12f-79f9-4c2c-b0b5-07fc20d7ce1d',
        'file_format': 'fastq',
        'md5sum': '00000000000000000000000000000001',
        'filename': 'my.fastq.gz',
        'status': 'uploaded',
    }
    testapp.post_json('/FileProcessed', processed_file, status=201)
    reference_file = {
        'uuid': 'f99fe12f-79f9-4c2c-b0b5-07fc20d7ce1e',
        'file_format': 'fastq',
        'md5sum': '00000000000000000000000000000002',
        'filename': 'my.fastq.gz',
        'status': 'uploaded',
    }
    testapp.post_json('/FileReference', reference_file, status=201)
