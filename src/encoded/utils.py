import io
import os
from typing import Any, Dict, List, Optional, Union
from urllib.parse import urlencode

from dcicutils.misc_utils import (
    get_error_message,
    to_camel_case,
    to_snake_case,
    VirtualApp,
)
from pyramid.registry import Registry
from pyramid.request import Request
from snovault.search.search_utils import make_search_subreq
from snovault.search.search import search
from snovault.types.base import get_item_or_none
from webtest import TestApp

from encoded.root import SMAHTRoot as Context


def get_remote_user(item_with_environ: Union[Request, TestApp]) -> str:
    """Get remote user from associated environment."""
    if isinstance(item_with_environ, Request):
        environ = item_with_environ.environ
    elif isinstance(item_with_environ, TestApp):
        environ = item_with_environ.extra_environ
    else:
        raise TypeError(f"Unexpected type: {type(item_with_environ)}")
    return get_environ_remote_user(environ)


def generate_admin_search_given_params(context, request, search_param):
    """ Helper function for below that generates/executes a search given params AS ADMIN
        BE EXTREMELY CAREFUL WITH THIS - do NOT use to return results directly
    """
    # VERY IMPORTANT - the below lines eliminate database calls, which is necessary
    # as making calls (as explained above) leaks connections - Will March 29 2024
    request.remote_user = 'IMPORT'
    if 'HTTP_AUTHORIZATION' in request.environ:
        del request.environ['HTTP_AUTHORIZATION']
    subreq = make_search_subreq(request, f'/search?{urlencode(search_param, True)}')
    subreq.cookies = {}
    return search(context, subreq)


def generate_search_total(context, request, search_param):
    """ Helper function that executes a search and extracts the total """
    search_param['limit'] = 0  # we do not care about search results, just total
    return generate_admin_search_given_params(context, request, search_param)['total']


def get_environ_remote_user(environ: Dict[str, Any]) -> str:
    """Get remote user from associated environment."""
    return environ.get("REMOTE_USER", "")


def get_item(
    request: Request,
    item_identifier: str,
    collection: Optional[str] = None,
    frame: Optional[str] = "object",
) -> Dict[str, Any]:
    """Get item via subrequest.

    Wrapper around get_item_or_none() for consistent return value type.
    """
    item_type = to_camel_case(collection) if collection else collection
    result = get_item_or_none(request, item_identifier, itype=item_type, frame=frame)
    if result is not None:
        return result
    return {}


def get_configuration_value(property_name: str,
                            context: Optional[Union[dict, Context, Registry, VirtualApp]],
                            fallback: Optional[str] = None,
                            raise_exception: bool = False) -> Optional[str]:
    """
    Returns the application configuration value identified by the given property name,
    and from the given context; returns None if not found or error (if raise_exeption is
    True this raises exception on error). The configuration properties are defined in the
    main application ini file (e.g. development.ini); this function deals with getting the
    property value from various "contexts": via a vapp, context, registry, or settings object.
    """
    if context and isinstance(property_name, str) and property_name:
        try:
            value = None
            if isinstance(context, dict):
                value = context.get(property_name)
            elif isinstance(context, Context):
                value = context.registry.settings.get(property_name)
            elif isinstance(context, Registry):
                value = context.settings.get(property_name)
            elif isinstance(context, VirtualApp):
                value = context.app.registry.settings.get(property_name)
            elif hasattr(context, "registry") and isinstance(context.registry, Registry):
                value = context.registry.settings.get(property_name)
            return value if value is not None else fallback
        except Exception as e:
            if raise_exception is True:
                raise Exception(f"Cannot get configuration value for: {property_name}\n{get_error_message(e)}")
    return fallback


def load_extended_descriptions_in_schemas(schema_object, depth=0):
    """
    Taken from CGAP - this is not written super well and is NOT path safe generally

    MODIFIES SCHEMA_OBJECT **IN PLACE** RECURSIVELY
    :param schema_object: A dictionary of any type that might have 'extended_description', 'properties',
        or 'items.properties'. Should be an Item schema initially.
    :param depth: Don't supply this. Used to check/optimize at depth=0 where schema_object is root of schema.

    TODO: Refactor to make path safe, perhaps move into snovault since this is duplicated
    """

    if depth == 0:
        # Root of Item schema, no extended_description here, but maybe facets or columns
        # have own extended_description to load also.
        if "properties" in schema_object:
            load_extended_descriptions_in_schemas(schema_object["properties"], depth + 1)
        if "facets" in schema_object:
            load_extended_descriptions_in_schemas(schema_object["facets"], depth + 1)
        if "columns" in schema_object:
            load_extended_descriptions_in_schemas(schema_object["columns"], depth + 1)

        return schema_object

    for field_name, field_schema in schema_object.items():
        if "extended_description" in field_schema:
            if field_schema["extended_description"][-5:] == ".html":
                html_file_path = os.path.join(os.path.abspath(os.path.dirname(__file__)),
                                              # This offset is meaningful - it means you can write paths
                                              # in the type definitions from "top level" ie: src/encoded/docs/.....
                                              "../..",
                                              field_schema["extended_description"])
                with io.open(html_file_path) as open_file:
                    field_schema["extended_description"] = "".join([line.strip() for line in open_file.readlines()])

        # Applicable only to "properties" of Item schema, not columns or facets:
        if "type" in field_schema:
            if field_schema["type"] == "object" and "properties" in field_schema:
                load_extended_descriptions_in_schemas(field_schema["properties"], depth + 1)
                continue

            if (field_schema["type"] == "array"
                    and "items" in field_schema
                    and field_schema["items"]["type"] == "object"
                    and "properties" in field_schema["items"]):
                load_extended_descriptions_in_schemas(field_schema["items"]["properties"], depth + 1)
                continue


def get_item_with_testapp(
    testapp: TestApp,
    identifier: str,
    collection: Optional[str] = None,
    frame: Optional[str] = None,
    datastore: Optional[str] = None,
    status: Optional[Union[int, List[int]]] = None,
) -> Dict[str, Any]:
    """Get item view with given frame, following redirects."""
    add_on = "&".join([get_frame_add_on(frame), get_datastore_add_on(datastore)])
    resource_path = get_formatted_resource_path(
        identifier, collection=collection, add_on=add_on
    )
    response = testapp.get(resource_path, status=status)
    if response.status_int == 301:
        return response.follow().json
    return response.json


def get_frame_add_on(frame: Union[str, None]) -> str:
    """Format frame parameter, if provided."""
    if frame:
        return f"frame={frame}"
    return ""


def get_datastore_add_on(datastore: Union[str, None]) -> str:
    """Format datastore parameter, if provided."""
    if datastore:
        return f"datastore={datastore}"
    return ""


def get_formatted_resource_path(
    identifier: str, collection: Optional[str] = None, add_on: Optional[str] = None
) -> str:
    """Format resource path for URL expectations."""
    resource_path_with_add_on = get_resource_path_with_add_on(
        identifier, collection, add_on
    )
    if not resource_path_with_add_on.startswith("/"):
        return f"/{resource_path_with_add_on}"
    return resource_path_with_add_on


def get_resource_path_with_add_on(
    identifier: str, collection: Optional[str] = None, add_on: Optional[str] = None
) -> str:
    """Get resource path with optional URL parameters, if provided."""
    resource_path = get_resource_path(identifier, collection)
    if add_on:
        return f"{resource_path}?{add_on}"
    return resource_path


def get_resource_path(identifier: str, collection: Optional[str] = None) -> str:
    """Get resource path with collection, if provided."""
    if collection:
        return get_formatted_collection_resource_path(identifier, collection)
    return identifier


def get_formatted_collection_resource_path(identifier: str, collection: str) -> str:
    """Format to '{collection}/{identifier}/'.

    Collection can be snake- or camel-cased.
    """
    dashed_collection = get_kebab_formatted_collection(collection)
    return f"/{pluralize_collection(dashed_collection)}/{identifier}/"


def get_kebab_formatted_collection(collection: str) -> str:
    """Format collection to  kebab case.

    Intended for collection to come in camel- or snake-case.
    """
    return to_snake_case(collection).replace("_", "-")


def pluralize_collection(collection: str) -> str:
    """Pluralize item collection name.

    Pluralized names must match those defined by item type definitions.
    """
    name = collection.replace("_", "-")
    # deal with a few special cases explicitly
    specials = [
        "aligned-reads",
        "basecalling",
        "death-circumstances",
        "sequencing",
        "software",
        "unaligned-reads",
        "variant-calls",
    ]
    if name in specials:
        return name
    if name.endswith("ry") or name.endswith("gy") or name.endswith("ly"):
        return name[:-1] + "ies"
    if name.endswith("sis"):
        return name[:-2] + "es"
    if name.endswith("ium"):
        return name[:-2] + "a"
    if name.endswith("s"):
        return name + "es"
    return name + "s"
