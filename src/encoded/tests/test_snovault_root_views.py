def test_snovault_item_counts(testapp):
    """ Tests that we can acquire the counts route when snovault.root is included """
    counts = testapp.get('/counts')