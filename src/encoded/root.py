from pyramid.decorator import reify
from pyramid.security import (
    ALL_PERMISSIONS, Allow, Everyone
)
from snovault import (
    Root, calculated_property, root
)
from snovault.root import (
    acl_from_settings, is_accession, health_check, item_counts, type_metadata, submissions_page
)
from .appdefs import APP_VERSION_REGISTRY_KEY


def includeme(config):
    """ Import and include routes from snovault here, do NOT config.include('snovault.root') """
    config.include(health_check)
    config.include(item_counts)
    config.include(type_metadata)
    config.include(submissions_page)
    config.scan(__name__)


@root
class SMAHTRoot(Root):
    properties = {
        'title': 'Home',
        'portal_title': 'SMAHT Portal',
    }

    @reify
    def __acl__(self):
        acl = acl_from_settings(self.registry.settings) + [
            (Allow, Everyone, ['list', 'search']),
            (Allow, 'group.admin', ALL_PERMISSIONS),
            (Allow, 'remoteuser.EMBED', 'restricted_fields'),
        ] + [
            (Allow, 'remoteuser.INDEXER', ['view', 'view_raw', 'list', 'index']),
            (Allow, 'remoteuser.EMBED', ['view', 'view_raw', 'expand']),
            (Allow, Everyone, ['visible_for_edit'])
        ]
        return acl

    def get(self, name, default=None):
        resource = super().get(name, None)
        if resource is not None:
            return resource
        resource = self.connection.get_by_unique_key('page:location', name)
        if resource is not None:
            return resource
        if is_accession(name):
            resource = self.connection.get_by_unique_key('accession', name)
            if resource is not None:
                return resource
        if ':' in name:
            resource = self.connection.get_by_unique_key('alias', name)
            if resource is not None:
                return resource
        return default

    def get_by_uuid(self, uuid, default=None):
        return self.connection.get_by_uuid(uuid, default)

    def jsonld_context(self):
        """Inherits from '@context' calculated property of Resource in snovault/resources.py"""
        return '/home'

    def jsonld_type(self):
        """Inherits from '@type' calculated property of Root in snovault/resources.py"""
        return ['HomePage', 'StaticPage'] + super().jsonld_type()

    @calculated_property(schema={
        "title": "Static Page Content",
        "type": "array"
    })
    def content(self, request):
        """Returns -object- with pre-named sections"""
        return []
        # sections_to_get = ['home.introduction']
        # user = request._auth0_authenticated if hasattr(request, '_auth0_authenticated') else True
        # return_list = []
        # for section_name in sections_to_get:
        #     try:  # Can be caused by 404 / Not Found during indexing
        #         res = request.embed('/static-sections', section_name, '@@embedded', as_user=user)
        #         return_list.append(res)
        #     except KeyError:
        #         pass
        # return return_list

    @calculated_property(schema={
        "title": "Application version",
        "type": "string",
    })
    def app_version(self, registry):
        return registry.settings[APP_VERSION_REGISTRY_KEY]
