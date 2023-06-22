def test_types_user_succeeds(testapp, admin, smaht_admin):
    """ Tests that we can load a user into the system using by posting to the snovault user """
    assert testapp.get(f'/users/{admin["email"]}').follow(status=200)
    assert testapp.get(f'/users/{smaht_admin["email"]}').follow(status=200)
