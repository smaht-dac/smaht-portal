from typing import Any, Dict

from webtest.app import TestApp


def test_user(testapp):
    """ Tests that we can post a user under the override type definition """
    testapp.post_json('/User', {
        'first_name': 'Test',
        'last_name': 'Admin',
        'email': 'admin@example.org',
        'groups': ['admin'],
        'status': 'current'
    }, status=201)


def test_file_format(testapp, test_consortium: Dict[str, Any]):
    """ Tests that we can post a file format under the overridden type
        definition
    """
    testapp.post_json('/FileFormat', {
        'identifier': 'fastq',
        'standard_file_extension': 'fastq.gz',
        'other_allowed_extensions': ['fq.gz'],
        'consortia': [test_consortium['uuid']],
    }, status=201)


def test_workflow_types(testapp, test_consortium: Dict[str, Any]) -> None:
    """ Tests that we can post a workflow under the overridden type definition """
    workflow = {
        'name': 'testing_123',
        'title': 'test workflow',
        'category': ['Annotation'],
        'consortia': [test_consortium['uuid']],
    }
    res = testapp.post_json('/Workflow', workflow, status=201).json['@graph'][0]
    wfl_run = {
        'workflow': res['@id'],
        'title': u'md5 run 2017-01-20 13:16:11.026176',
        'job_id': '1235',
        'run_status': 'started',
        'consortia': [test_consortium['uuid']],
    }
    testapp.post_json('/WorkflowRun', wfl_run, status=201)


def test_document(testapp, test_consortium: Dict[str, Any]) -> None:
    """ Tests that we can post a document item under the overridden type definition """
    testapp.post_json('/Document', {
        'description': 'test', 'consortia': [test_consortium['uuid']],
    }, status=201)


def test_higlass_view_config(testapp):
    """ Tests that we can post a higlass_view_config under the overridden type
        definition """
    testapp.post_json('/HiglassViewConfig', {
        'title': 'some view config', 'view_config': {'editable': True},
    }, status=201)


def test_image(testapp, test_consortium: Dict[str, Any]) -> None:
    """ Tests that we can post an image item under the overridden type definition """
    testapp.post_json('/Image', {
        'description': 'test', 'consortia': [test_consortium['uuid']],
    }, status=201)


def test_quality_metric(testapp, test_consortium: Dict[str, Any]) -> None:
    """ Tests that we can post a QualityMetric item under the overridden type definition """
    testapp.post_json('/QualityMetric', {
        'category': 'Testing',
        'qc_values': [{'key': 'some_qc_metric', 'value': '22'}],
        'consortia': [test_consortium['uuid']],
    }, status=201)


def test_software(testapp, test_consortium: Dict[str, Any]) -> None:
    """ Tests that we can post a software item under the overridden type definition """
    testapp.post_json('/Software', {
        'submitted_id': 'SMAHT-DAC_SOFTWARE_TESTING',
        'name': 'test_software',
        'title': 'test software',
        'category': ['Alignment'],
        'version': '1.0.0',
        'consortia': [test_consortium['uuid']],
    }, status=201)


def test_static_section(testapp: TestApp, test_consortium: Dict[str, Any]) -> None:
    """ Tests that we can post a static section under the overridden type definition """
    testapp.post_json('/StaticSection', {
        'identifier': 'test_section',
        'category': ['Page Section'],
        'body': 'Some text for the section',
        'consortia': [test_consortium['uuid']],
    }, status=201)


def test_page(testapp: TestApp, test_consortium: Dict[str, Any]) -> None:
    """ Tests that we can post a page under the overridden type definition """
    testapp.post_json('/Page', {
        'identifier': 'test_page',
        'consortia': [test_consortium['uuid']],
    }, status=201)


def test_filter_set(testapp: TestApp, test_consortium: Dict[str, Any]) -> None:
    """ Tests that we can post a filter set item under the overridden type definition """
    testapp.post_json('/FilterSet', {
        'title': 'test filterset', 'consortia': [test_consortium['uuid']],
    }, status=201)


def test_meta_workflow(
    testapp: TestApp, test_consortium: Dict[str, Any], workflow: Dict[str, Any]
) -> None:
    """ Tests that we can post a workflow under the overridden types definition """
    res = testapp.post_json('/MetaWorkflow', {
        'category': ['Alignment'],
        'name': 'testing_123',
        'title': 'test metaworkflow',
        'version': '0.0.1',
        'workflows': [
            {
                'name': 'some_workflow',
                'workflow': workflow['uuid'],
                'input': [
                    {
                        'argument_name': 'some_arg',
                        'argument_type': 'parameter',
                        'value': 'some_value',
                    },
                ],
                'config': {
                    'instance_type': ['c5.4xlarge'],
                    'run_name': 'some_workflow_run',
                },
            },
        ],
        'consortia': [test_consortium['uuid']],
    }, status=201).json['@graph'][0]
    testapp.post_json('/MetaWorkflowRun', {
        'meta_workflow': res['uuid'],
        'consortia': [test_consortium['uuid']],
    }, status=201)


def test_file_types(testapp: TestApp, test_consortium: Dict[str, Any]) -> None:
    """ Tests that we can post files under the overriden type definitions """
    file_format = testapp.post_json('/FileFormat', {
        'identifier': 'fastq',
        'standard_file_extension': 'fastq.gz',
        'other_allowed_extensions': ['fq.gz'],
        'consortia': [test_consortium['uuid']],
    }, status=201).json['@graph'][0]
    processed_file = {
        'uuid': 'f99fe12f-79f9-4c2c-b0b5-07fc20d7ce1d',
        'file_format': file_format['uuid'],
        'md5sum': '00000000000000000000000000000001',
        'filename': 'my.fastq.gz',
        'status': 'in review',
        'data_category': ['Sequencing Reads'],
        'data_type': ['Unaligned Reads'],
        'consortia': [test_consortium['uuid']],
    }
    testapp.post_json('/OutputFile', processed_file, status=201)
    reference_file = {
        'uuid': 'f99fe12f-79f9-4c2c-b0b5-07fc20d7ce1e',
        'file_format': file_format['uuid'],
        'md5sum': '00000000000000000000000000000002',
        'filename': 'my.fastq.gz',
        'status': 'in review',
        'data_category': ['Sequencing Reads'],
        'data_type': ['Unaligned Reads'],
        'consortia': [test_consortium['uuid']],
    }
    testapp.post_json('/ReferenceFile', reference_file, status=201)
