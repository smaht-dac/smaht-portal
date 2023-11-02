import io
import json
import pkg_resources

from dcicutils.misc_utils import find_association, find_associations


def workbook_lookup(item_type, multiple=False, **attributes):
    """
    Given an item type and a set of attributes, looks up the workbook insert of that type matching
    the given attribute details.

    :param item_type: an item type (such as 'User' or 'Project')
    :param multiple: True if the result should be a list of multiple objects, or False if it should be a single object
    :param attributes: a set of keywords and values (or keywords and predicate functions).
    :return: the JSON for a matching insert (if multiple=False) or a list of such items (if multiple=True)
    """

    return any_inserts_lookup('workbook-inserts', item_type=item_type, multiple=multiple, **attributes)


def any_inserts_lookup(inserts_directory_name, item_type, multiple=False, **attributes):
    """
    Given an item type and a set of attributes, looks up the master insert of that type matching
    the given attribute details.

    :param inserts_directory_name: The name of an inserts directory (such as 'master-inserts' or 'workbook-inserts')
    :param item_type: an item type (such as 'User' or 'Project')
    :param multiple: True if the result should be a list of multiple objects, or False if it should be a single object
    :param attributes: a set of keywords and values (or keywords and predicate functions).
    :return: the JSON for a matching insert (if multiple=False) or a list of such items (if multiple=True)
    """

    item_filename = pkg_resources.resource_filename('encoded', 'tests/data/' + inserts_directory_name
                                                    + "/" + item_type.lower() + ".json")
    with io.open(item_filename) as fp:
        data = json.load(fp)
        finder = find_associations if multiple else find_association
        return finder(data, **attributes)
