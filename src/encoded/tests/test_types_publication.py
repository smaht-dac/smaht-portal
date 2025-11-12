import pytest


pytestmark = [pytest.mark.workbook]


def test_publication_exists_in_workbook(workbook):
    """Confirm that a Publication item is loaded from the workbook inserts."""
    pub = workbook['publication']
    assert pub is not None
    assert pub['@type'][0] == 'Publication'
    assert 'ID' in pub


def test_short_attribution_calculated_property(workbook):
    """Verify short_attribution formatting from workbook data."""
    pub = workbook['publication']
    short_attr = pub.get('short_attribution')

    # Validate basic structure: "Author", "Author and Author", or "Author et al. (YYYY)"
    assert isinstance(short_attr, str)
    assert any(word in short_attr for word in ['and', 'et al.', '(']), (
        f"short_attribution value looks unexpected: {short_attr}"
    )

    # If a date_published is present, the year should appear
    if 'date_published' in pub:
        assert pub['date_published'][:4] in short_attr


def test_number_of_files_calculated_property(workbook):
    """Verify number_of_files is an integer and matches linked files."""
    pub = workbook['publication']
    num_files = pub.get('number_of_files')

    assert isinstance(num_files, int)
    files_of_pub = pub.get('files_of_pub', [])
    assert num_files == len(files_of_pub)


def test_publication_admin_acl(testapp, workbook, anonymous_testapp):
    """Ensure Publication collection obeys ONLY_ADMIN_VIEW_ACL."""
    pub = workbook['publication']

    # Admin access works (testapp fixture acts as admin)
    res = testapp.get(pub['@id'], status=200)
    assert res.json['@id'] == pub['@id']

    # Anonymous access should be forbidden
    anonymous_testapp.get(pub['@id'], status=403)


# from types_publication import Publication  # adjust import path as needed


# @pytest.fixture
# def publication_instance():
#     """Create a minimal Publication instance with dummy data."""
#     return Publication({}, request=None)  # mimics the usual Item init signature


# class TestPublicationCalculatedProperties:

#     def test_short_attribution_single_author_with_year(self, publication_instance):
#         result = publication_instance.short_attribution(
#             authors=["Jane Doe"],
#             date_published="2021-05-14"
#         )
#         assert result == "Jane Doe (2021)"

#     def test_short_attribution_two_authors_with_year(self, publication_instance):
#         result = publication_instance.short_attribution(
#             authors=["Jane Doe", "John Smith"],
#             date_published="2022-01-01"
#         )
#         assert result == "Jane Doe and John Smith (2022)"

#     def test_short_attribution_multiple_authors_no_date(self, publication_instance):
#         result = publication_instance.short_attribution(
#             authors=["Jane Doe", "John Smith", "Alice Brown"]
#         )
#         assert result == "Jane Doe et al."

#     def test_short_attribution_no_authors_with_date(self, publication_instance):
#         result = publication_instance.short_attribution(
#             authors=None,
#             date_published="2023-09-05"
#         )
#         assert result == " (2023)"

#     def test_short_attribution_empty(self, publication_instance):
#         result = publication_instance.short_attribution()
#         assert result == ""

#     def test_number_of_files_none(self, publication_instance):
#         result = publication_instance.number_of_files(files_of_pub=None)
#         assert result is None

#     def test_number_of_files_empty_list(self, publication_instance):
#         result = publication_instance.number_of_files(files_of_pub=[])
#         assert result is None  # no files → None, not 0, per current logic

#     def test_number_of_files_counts_correctly(self, publication_instance):
#         files = ["file1", "file2", "file3"]
#         result = publication_instance.number_of_files(files_of_pub=files)
#         assert result == 3