# These first all pass like they should

def test_user(testapp):
    """ Tests that we can post a user under the override type definition """
    testapp.post_json('/user', {
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
    testapp.post_json('/file_format', {
        'file_format': 'fastq',
        'standard_file_extension': 'fastq.gz',
        'other_allowed_extensions': ['fq.gz'],
        'valid_item_types': ["FileSubmitted"]
    }, status=201)


def test_workflow_types(testapp):
    """ Tests that we can post a workflow under the overridden type definition """
    res = testapp.post_json('/workflow', {
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
    testapp.post_json('/workflow_run_awsem', wfl_run_awsem, status=201).json['@graph'][0]
    wfl_run = {
        'run_platform': 'SBG',
        'parameters': [],
        'workflow': res['@id'],
        'title': u'md5 run 2017-01-20 13:16:11.026176',
        'run_status': 'started',
    }
    testapp.post_json('/workflow_run', wfl_run, status=201).json['@graph'][0]


def test_document(testapp):
    """ Tests that we can post a document item under the overridden type definition """
    testapp.post_json('/document', {
        'description': 'test'
    }, status=201)


def test_higlass_view_config(testapp):
    """ Tests that we can post a higlass_view_config under the overridden type
        definition """
    testapp.post_json('/higlass_view_config', {
        'genome_assembly': 'GRCh38'
    }, status=201)


def test_image(testapp):
    """ Tests that we can post an image item under the overridden type definition """
    testapp.post_json('/image', {
        'description': 'test'
    }, status=201)


def test_qc_generic(testapp):
    """ Tests that we can post a qc generic item under the overridden type definition """
    testapp.post_json('/quality_metric_generic', {
        'name': 'test qc'
    }, status=201)


def test_software(testapp):
    """ Tests that we can post a software item under the overridden type definition """
    testapp.post_json('/software', {
        'name': 'test software'
    }, status=201)


def test_tracking_item(testapp):
    """ Tests that we can post a tracking item under the overridden type definition """
    testapp.post_json('/tracking_item', {
        'tracking_type': 'other'
    }, status=201)


def test_static_section(testapp):
    """ Tests that we can post a static section under the overridden type definition """
    testapp.post_json('/static_section', {
        'name': 'test section'
    }, status=201)


def test_page(testapp):
    """ Tests that we can post a page under the overridden type definition """
    testapp.post_json('/page', {
        'name': 'test page'
    }, status=201)


# The below all fail with @@object key error


def test_meta_workflow(testapp):
    """ Tests that we can post a workflow under the overridden types definition """
    res = testapp.post_json('/meta_workflow', {
        'title': 'test metaworkflow',
        'name': 'test metaworkflow'
    }, status=201).json['@graph'][0]
    testapp.post_json('/meta_workflow_run', {
        'meta_workflow': res['uuid']
    }, status=201)


def test_file_types(testapp):
    """ Tests that we can post files under the overriden type definition """
    res = testapp.post_json('/file_format', {
        'file_format': 'fastq',
        'standard_file_extension': 'fastq.gz',
        'other_allowed_extensions': ['fq.gz'],
        'valid_item_types': ["FileSubmitted", "FileProcessed", "FileReference"]
    }, status=201).json['@graph'][0]
    submitted_file = {
        'uuid': 'f99fe12f-79f9-4c2c-b0b5-07fc20d7ce1c',
        'file_format': 'fastq',
        'md5sum': '00000000000000000000000000000000',
        'filename': 'my.fastq.gz',
        'status': 'uploaded',
    }
    testapp.post_json('/file_submitted', submitted_file, status=201)
