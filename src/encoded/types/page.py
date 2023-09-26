from dcicutils.misc_utils import filtered_warnings
from copy import deepcopy
from snovault import collection
from snovault.util import debug_log
from snovault.validators import (
    validate_item_content_post,
    validate_item_content_put,
    validate_item_content_patch,
    validate_item_content_in_place,
    no_validate_item_content_post,
    no_validate_item_content_put,
    no_validate_item_content_patch
)
from snovault.resource_views import item_view_page
from pyramid.view import view_config
from encoded_core.types.page import Page as CorePage
from encoded_core.page_views import (
    validate_unique_page_name, is_static_page, add_sibling_parent_relations_to_tree,
    get_pyramid_http_exception_for_redirect_code, cleanup_page_tree
)
from .base import Item as SMAHTItem
from .base import mixin_smaht_permission_types, collection_add, item_edit


ENCODED_CORE_PAGE_SCHEMA = deepcopy(CorePage.schema)


def includeme(config):
    with filtered_warnings("ignore", category=DeprecationWarning):
        config.add_route(
            'staticpage',
            '/*subpath',
            # TODO: Replace custom_predicates=[is_static_page] with something more modern.
            # The custom_predicates needs to be rewritten.
            # Although there is a complex rewrite using .add_route_predicate,
            # the simpler case of just using .add_static_view may bypass a lot of complexity.
            # But this needs more study to get right. For now this code will work and
            # we're just going to suppress the warning.  -kmp 16-May-2020
            # Refs:
            #  - https://stackoverflow.com/questions/30102767/custom-route-predicates-in-pyramid
            #  - https://docs.pylonsproject.org/projects/pyramid/en/latest/_modules/pyramid/config/routes.html
            #  - https://docs.pylonsproject.org/projects/pyramid/en/master/narr/hooks.html#view-and-route-predicates
            #  - https://docs.pylonsproject.org/projects/pyramid/en/latest/api/config.html
            custom_predicates=[is_static_page],
            request_method="GET"
        )
    config.add_view(static_page, route_name='staticpage')


@collection(
    name='pages',
    lookup_key='name',
    properties={
        'title': 'Pages',
        'description': 'Static Pages for the Portal',
    })
class Page(SMAHTItem, CorePage):
    item_type = 'page'
    schema = mixin_smaht_permission_types(ENCODED_CORE_PAGE_SCHEMA)

    # VERY IMPORTANT: The ordering of the inheritance matters here - you need
    # the CorePage Collection prioritized over the SMAHTItem Collection - you must
    # do this if you want to implement type-specific behavior as below - Will 26 Sept 23
    class Collection(SMAHTItem.Collection, CorePage.Collection):
        pass


# VERY IMPORTANT: These views need to be redefined here so they are on proper context,
# otherwise they operate on the un-included encoded-core type and cause issues with
# object resolution - Will 26 Sept 23
@view_config(context=Page.Collection, permission='add', request_method='POST',
             validators=[validate_item_content_post, validate_unique_page_name])
@view_config(context=Page.Collection, permission='add_unvalidated', request_method='POST',
             validators=[no_validate_item_content_post],
             request_param=['validate=false'])
@debug_log
def page_add(context, request, render=None):
    return collection_add(context, request, render)


@view_config(context=Page, permission='edit', request_method='PUT',
             validators=[validate_item_content_put, validate_unique_page_name])
@view_config(context=Page, permission='edit', request_method='PATCH',
             validators=[validate_item_content_patch, validate_unique_page_name])
@view_config(context=Page, permission='edit_unvalidated', request_method='PUT',
             validators=[no_validate_item_content_put],
             request_param=['validate=false'])
@view_config(context=Page, permission='edit_unvalidated', request_method='PATCH',
             validators=[no_validate_item_content_patch],
             request_param=['validate=false'])
@view_config(context=Page, permission='index', request_method='GET',
             validators=[validate_item_content_in_place, validate_unique_page_name],
             request_param=['check_only=true'])
@debug_log
def page_edit(context, request, render=None):
    return item_edit(context, request, render)


#### Static Page Routing/Endpoint

def static_page(request):
    '''
    basically get the page in a standard way (item_view_page) which will
    do permissions checking.  Then format the return result to be something
    the front-end expects
    '''

    def remove_relations_in_tree(node, keep="children"):
        '''Returns (deep-)copy'''
        filtered_node = { "name" : node['name'] }
        if keep == 'children' and node.get('children') is not None:
            filtered_node['children'] = [ remove_relations_in_tree(c, keep) for c in node['children'] ]
        if keep == 'parent' and node.get('parent'):
            filtered_node['parent'] = remove_relations_in_tree(node['parent'], keep)
        for field in node.keys():
            if field not in ['next', 'previous', 'children', 'parent'] and node.get(field) is not None:
                filtered_node[field] = node[field]
        return filtered_node

    path_parts = [ path_part for path_part in request.subpath if path_part ]
    page_name = "/".join(path_parts)

    tree = request._static_page_tree

    if tree is not None:

        tree = add_sibling_parent_relations_to_tree(tree)

        curr_node = tree
        page_in_tree = True
        for path_idx, part in enumerate(path_parts):
            for child in curr_node.get('children',[]):
                split_child_name = child['name'].split('/')
                if len(split_child_name) > path_idx and split_child_name[path_idx] == part:
                    curr_node = child
                    break
            if path_idx == len(path_parts) - 1 and curr_node.get('uuid') is None:
                page_in_tree = False
                break
    else:
        page_in_tree = False

    context = Page(request.registry, request._static_page_model)

    if context.properties.get('redirect') and context.properties['redirect'].get('enabled'): # We have a redirect defined.
        parsed_redirect_uri = urlparse(context.properties['redirect'].get('target', '/'))
        uri_to_use = (parsed_redirect_uri.scheme and (parsed_redirect_uri.scheme + ':') or '') + '//' if parsed_redirect_uri.netloc else ''
        uri_to_use += parsed_redirect_uri.path
        uri_to_use += '?' + urlencode({ 'redirected_from' : '/' + context.properties.get('name', str(context.uuid)) }) + ((parsed_redirect_uri.query and ('&' + parsed_redirect_uri.query)) or '')
        # Fallback to 307 as is 'safest' (response isn't cached by browsers)
        return get_pyramid_http_exception_for_redirect_code(context.properties['redirect'].get('code', 307))(location=uri_to_use, detail="Redirected from " + page_name)
    item = item_view_page(context, request)
    cleanup_page_tree(item)
    item['toc'] = item.get('table-of-contents')
    item['@context'] = item['@id']

    if page_in_tree:
        if curr_node.get('next'):
            item['next'] =      remove_relations_in_tree(curr_node['next'])
        if curr_node.get('previous'):
            item['previous'] =  remove_relations_in_tree(curr_node['previous'])
        if curr_node.get('parent'):
            item['parent'] =    remove_relations_in_tree(curr_node['parent'], keep="parent")
        if curr_node.get('sibling_length') is not None:
            item['sibling_length'] = curr_node['sibling_length']
            item['sibling_position'] = curr_node['sibling_position']

    return item
