def test_snovault_view_health_page(testapp):
    """ Tests that we can acquire the health route from snovault """
    testapp.get('/health', status=200)


def test_snovault_view_submissions_page(testapp):
    """ Tests that we can acquire the submissions route from snovault """
    testapp.get('/submissions', status=200)


def test_snovault_view_type_page(testapp):
    """ Tests that we can acquire the type order route from snovault """
    testapp.get('/type-metadata', status=200)
