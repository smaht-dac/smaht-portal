import pytest


@pytest.mark.parametrize('item,attribution_type', [
    ({
        'category': ['Annotation'],  # missing title
    }, 'consortia'),
    ({
        'category': ['Annotation'],  # missing title
    }, 'submission_center'),
    ({
        'title': 'A Great Workflow',  # missing attribution
        'category': ['Annotation'],
    }, None),
    ({
        'title': 'A Great Workflow',  # missing category
    }, 'consortia'),
    ({
        'title': 'A Great Workflow',  # missing category
    }, 'submission_center'),
    ({
        'title': 'A Great Workflow',  # missing attribution
    }, None),
    ({
        'title': 'A Great Workflow',  # invalid category
        'category': ['not-a-category']
    }, 'submission_center'),
    ({
        'title': 'A Great Workflow',  # invalid language
        'category': ['Annotation'],
        'language': 'snakemake'
    }, 'submission_center'),
])
def test_workflow_failure(testapp, item, attribution_type, test_submission_center, test_consortium):
    """ Tests we detect failure cases for workflows """
    if attribution_type is None:
        testapp.post_json('/workflow', item, status=422)
    elif attribution_type == 'consortia':
        item['consortia'] = [test_consortium['uuid']]
    else:
        item['submission_centers'] = [test_submission_center['uuid']]
    testapp.post_json('/workflow', item, status=422)
