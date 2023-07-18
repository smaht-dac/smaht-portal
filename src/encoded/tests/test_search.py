class MockedRequest(object):
    """ Test object intended to be used to mock certain aspects of requests. Takes kwargs which
        will be passed as named fields to MockedRequest. More arguments could be added if other
        use is seen.
    """
    def __init__(self, **kwargs):
        if 'principals_allowed' not in kwargs:
            self.effective_principals = ['system.Everyone']
        else:
            self.effective_principals = kwargs['principals_allowed']  # note this is not exactly what the field is
