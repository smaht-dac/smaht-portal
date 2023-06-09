import encoded.project_defs  # VERY Important - loads application specific behavior

import logging
import mimetypes
import os
import pkg_resources
import sentry_sdk

from dcicutils.beanstalk_utils import source_beanstalk_env_vars
from dcicutils.log_utils import set_logging
from dcicutils.env_utils import get_mirror_env_from_context
from dcicutils.ff_utils import get_health_page
from dcicutils.ecs_utils import ECSUtils
from codeguru_profiler_agent import Profiler
from sentry_sdk.integrations.pyramid import PyramidIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from pyramid.config import Configurator
from .local_roles import LocalRolesAuthorizationPolicy
from pyramid.settings import asbool
from snovault.app import session, json_from_path, configure_dbsession, changelogs
from snovault.elasticsearch import APP_FACTORY
from snovault.elasticsearch.interfaces import INVALIDATION_SCOPE_ENABLED
from dcicutils.misc_utils import VirtualApp
from .appdefs import APP_VERSION_REGISTRY_KEY
# from snovault.loadxl import load_all


# snovault.app.STATIC_MAX_AGE (8 seconds) is WAY too low for /static and /profiles - Will March 15 2022
CGAP_STATIC_MAX_AGE = 1800
# default trace_rate for sentry
# tune this to get more data points when analyzing performance
SENTRY_TRACE_RATE = .1
DEFAULT_AUTH0_DOMAIN = 'hms-dbmi.auth0.com'
DEFAULT_AUTH0_ALLOWED_CONNECTIONS = 'github,google-oauth2,partners,hms-it'


def includeme(config):
    """ Implements the includeme mechanism for encoded
        For detailed explanation see: https://docs.pylonsproject.org/projects/pyramid/en/latest/api/config.html
    """
    config.include('encoded.authentication')
    config.include('encoded.root')
    config.include('encoded.types')
    config.include('encoded.server_defaults')
    # config.include('encoded.visualization')
    config.commit()


def include_snovault(config: Configurator) -> None:
    """ Implements the selective include mechanism from Snovault
        Decide here which modules you want to include from snovault

        Note that because of new conflicts from extended modules, you can no longer
        do config.include('snovault'), as you will get Configurator conflicts when
        bringing in duplicates of various modules ie: root.py
    """
    config.include('pyramid_tm')
    config.include('snovault.authentication')
    config.include('snovault.util')
    config.include('snovault.drs')
    config.include('snovault.stats')
    config.include('snovault.batchupgrade')
    config.include('snovault.calculated')
    config.include('snovault.config')
    config.include('snovault.connection')
    config.include('snovault.custom_embed')
    config.include('snovault.embed')
    config.include('snovault.json_renderer')
    config.include('snovault.validation')
    config.include('snovault.predicates')
    config.include('snovault.invalidation')
    config.include('snovault.upgrader')
    config.include('snovault.aggregated_items')
    config.include('snovault.storage')
    config.include('snovault.typeinfo')
    config.include('snovault.types')
    config.include('snovault.resources')
    config.include('snovault.attachment')
    config.include('snovault.schema_graph')
    config.include('snovault.jsonld_context')
    config.include('snovault.schema_views')
    config.include('snovault.crud_views')
    config.include('snovault.indexing_views')
    config.include('snovault.resource_views')
    config.include('snovault.settings')
    config.include('snovault.server_defaults')
    # Renderers is giving problems at the moment - Will 6/1/23
    config.include('snovault.renderers')
    # configure redis server in production.ini
    if 'redis.server' in config.registry.settings:
        config.include('snovault.redis')

    config.commit()


def include_encoded_core(config):
    """ Customized includes for encoded-core """
    config.include('encoded_core.file_views')
    config.include('encoded_core.page_views')
    config.include('encoded_core.qc_views')


def static_resources(config):
    mimetypes.init()
    mimetypes.init([pkg_resources.resource_filename('encoded', 'static/mime.types')])
    config.add_static_view('static', 'static', cache_max_age=CGAP_STATIC_MAX_AGE)
    config.add_static_view('profiles', 'schemas', cache_max_age=CGAP_STATIC_MAX_AGE)

    # Favicon
    favicon_path = '/static/img/favicon.ico'
    if config.route_prefix:
        favicon_path = '/%s%s' % (config.route_prefix, favicon_path)
    config.add_route('favicon.ico', 'favicon.ico')

    def favicon(request):
        subreq = request.copy()
        subreq.path_info = favicon_path
        response = request.invoke_subrequest(subreq)
        return response

    config.add_view(favicon, route_name='favicon.ico')

    # Robots.txt
    robots_txt_path = None
    if config.registry.settings.get('testing') in [True, 'true', 'True']:
        robots_txt_path = '/static/dev-robots.txt'
    else:
        robots_txt_path = '/static/robots.txt'

    if config.route_prefix:
        robots_txt_path = '/%s%s' % (config.route_prefix, robots_txt_path)

    config.add_route('robots.txt-conditional', '/robots.txt')

    def robots_txt(request):
        subreq = request.copy()
        subreq.path_info = robots_txt_path
        response = request.invoke_subrequest(subreq)
        return response

    config.add_view(robots_txt, route_name='robots.txt-conditional')


# def load_workbook(app, workbook_filename, docsdir):
#     environ = {
#         'HTTP_ACCEPT': 'application/json',
#         'REMOTE_USER': 'IMPORT',
#     }
#     testapp = VirtualApp(app, environ)
#     load_all(testapp, workbook_filename, docsdir)


def app_version(config):
    if not config.registry.settings.get(APP_VERSION_REGISTRY_KEY):
        # we update version as part of deployment process `deploy_beanstalk.py`
        # but if we didn't check env then git
        version = os.environ.get("ENCODED_VERSION", "test")
        config.registry.settings[APP_VERSION_REGISTRY_KEY] = version

    # Fourfront does GA stuff here that makes no sense in CGAP (yet).


def init_sentry(dsn):
    """ Helper function that initializes sentry SDK if a dsn is specified. """
    if dsn:
        sentry_sdk.init(dsn,
                        traces_sample_rate=SENTRY_TRACE_RATE,
                        integrations=[PyramidIntegration(), SqlalchemyIntegration()])


def init_code_guru(*, group_name, region=ECSUtils.REGION):
    """ Starts AWS CodeGuru process for profiling the app remotely. """
    Profiler(profiling_group_name=group_name, region_name=region).start()


def set_logging_main(settings):
    # adjust log levels for some annoying loggers
    lnames = ['boto', 'urllib', 'elasticsearch', 'dcicutils']
    for name in logging.Logger.manager.loggerDict:
        if any(logname in name for logname in lnames):
            logging.getLogger(name).setLevel(logging.WARNING)
    # END PART THAT'S NOT IN FOURFRONT
    set_logging(in_prod=settings.get('production'))
    # set_logging(settings.get('elasticsearch.server'), settings.get('production'))


def set_auth0_config(settings):
    """ Sets auth0 settings """
    settings['auth0.domain'] = settings.get('auth0.domain', os.environ.get('Auth0Domain', DEFAULT_AUTH0_DOMAIN))
    settings['auth0.client'] = settings.get('auth0.client', os.environ.get('Auth0Client'))
    settings['auth0.secret'] = settings.get('auth0.secret', os.environ.get('Auth0Secret'))
    settings['auth0.allowed_connections'] = settings.get('auth0.allowed_connections',  # comma separated string
                                                         os.environ.get('Auth0AllowedConnections',
                                                                        DEFAULT_AUTH0_ALLOWED_CONNECTIONS).split(','))
    settings['auth0.options'] = {
        'auth': {
            'sso': False,
            'redirect': False,
            'responseType': 'token',
            'params': {
                'scope': 'openid email',
                'prompt': 'select_account'
            }
        },
        'allowedConnections': settings['auth0.allowed_connections']
    }


def set_mirror_settings(settings):
    # set mirrored Elasticsearch location (for staging and production servers)
    mirror = get_mirror_env_from_context(settings)
    if mirror is not None:
        settings['mirror.env.name'] = mirror
        settings['mirror_health'] = get_health_page(ff_env=mirror)


def main(global_config, **local_config):
    """
    This function returns a Pyramid WSGI application.
    """

    settings = global_config
    settings.update(local_config)
    set_logging_main(settings)

    # Set some env vars (should no longer be necessary)
    source_beanstalk_env_vars()
    # set google reCAPTCHA keys - these should now come from the GAC
    settings['g.recaptcha.key'] = os.environ.get('reCaptchaKey')
    settings['g.recaptcha.secret'] = os.environ.get('reCaptchaSecret')
    settings['snovault.jsonld.terms_prefix'] = 'encode'
    set_auth0_config(settings)

    # enable invalidation scope, mirror settings
    settings[INVALIDATION_SCOPE_ENABLED] = True
    set_mirror_settings(settings)

    # Create config object for includes
    config = Configurator(settings=settings)

    # Set app factory for spawning application
    config.registry[APP_FACTORY] = main
    config.include(app_version)

    config.include('pyramid_multiauth')  # must be before calling set_authorization_policy
    # Override default authz policy set by pyramid_multiauth
    config.set_authorization_policy(LocalRolesAuthorizationPolicy())
    config.include(session)

    # must include, as tm.attempts was removed from pyramid_tm
    config.include('pyramid_retry')

    # NOTE: this MUST occur prior to including Snovault, otherwise it will not work
    config.add_settings({'mappings.use_nested': True})
    config.include(configure_dbsession)
    include_snovault(config)  # controls config includes from snovault
    include_encoded_core(config)
    config.include('encoded')

    if 'elasticsearch.server' in config.registry.settings:
        config.include('snovault.elasticsearch')
        config.include('snovault.search.search')
        config.include('snovault.search.compound_search')

    # this contains fall back url, so make sure it comes just before static_resoruces
    config.include(static_resources)
    config.include(changelogs)

    if asbool(settings.get('testing', False)):
        config.include('.tests.testing_views')

    # Load upgrades last so that all views (including testing views) are
    # registered.
    # uncomment once relevant
    # config.include('.upgrade')

    # initialize sentry reporting
    init_sentry(settings.get('sentry_dsn', None))

    # initialize CodeGuru profiling, if set
    # note that this is intentionally an env variable (so it is a TASK level setting)
    if 'ENCODED_PROFILING_GROUP' in os.environ:
        init_code_guru(group_name=os.environ['ENCODED_PROFILING_GROUP'])

    app = config.make_wsgi_app()
    return app
