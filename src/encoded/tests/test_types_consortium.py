def test_types_consortium(testapp, test_consortium):
    """ Tests we can post/get a consortium item """
    testapp.get(f'/consortium/{test_consortium["identifier"]}')
