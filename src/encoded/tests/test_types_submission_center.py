def test_types_submission_center(testapp, test_submission_center):
    """ Tests we can post/get a consortium item """
    testapp.get(f'/submission_center/{test_submission_center["name"]}')
