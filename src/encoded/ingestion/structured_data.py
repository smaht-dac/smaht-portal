import copy
from functools import lru_cache
import json
from jsonschema import Draft7Validator as SchemaValidator
import os
import re
import sys
from typing import Any, Callable, List, Optional, Tuple, Type, Union
from webtest.app import TestApp
from dcicutils.data_readers import CsvReader, Excel, RowReader
from dcicutils.ff_utils import get_metadata, get_schema
from dcicutils.misc_utils import (load_json_if, merge_objects, remove_empty_properties, split_string,
                                  to_boolean, to_camel_case, to_enum, to_float, to_integer, VirtualApp)
from dcicutils.zip_utils import temporary_file, unpack_gz_file_to_temporary_file, unpack_files
from snovault.loadxl import create_testapp


# Classes/functions to parse a CSV or Excel Spreadsheet into structured data, using a specialized
# syntax to allow structured object properties to be referenced by column specifiers. This syntax
# uses an (intuitive) dot notation to reference nested objects, and a (less intuitive) notation
# utilizing the "#" character to reference array elements. May also further coerce data types by
# consulting an optionally specified JSON schema.
#
# Alternate and semantically equivalent implementation of dcicutils.{sheet,bundle}_utils.
# Spare time exercise, with benefit of sheet_utils implementation experience.

ACCEPTABLE_FILE_SUFFIXES = [".csv", ".tsv", ".json", ".xls", ".xlsx", ".gz", ".tar", ".tar.gz", ".tgz", ".zip"]
ARRAY_VALUE_DELIMITER_CHAR = "|"
ARRAY_VALUE_DELIMITER_ESCAPE_CHAR = "\\"
ARRAY_NAME_SUFFIX_CHAR = "#"
ARRAY_NAME_SUFFIX_REGEX = re.compile(rf"{ARRAY_NAME_SUFFIX_CHAR}\d+")
DOTTED_NAME_DELIMITER_CHAR = "."
NEW = True

# Forward type references for type hints.
Portal = Type["Portal"]
PortalAny = Union[VirtualApp, TestApp, Portal]
Schema = Type["Schema"]
StructuredDataSet = Type["StructuredDataSet"]


class StructuredDataSet:

    def __init__(self, file: Optional[str] = None, portal: Optional[PortalAny] = None,
                 schemas: Optional[List[dict]] = None, data: Optional[List[dict]] = None,
                 order: Optional[List[str]] = None, prune: bool = True) -> None:
        self.data = {} if not data else data
        self._portal = Portal.create(portal, data=self.data, schemas=schemas)  # If None then no schemas nor refs.
        self._order = order
        self._prune = prune
        self._issues = None
        self._load_file(file) if file else None

    @staticmethod
    def load(file: str, portal: Optional[PortalAny] = None, schemas: Optional[List[dict]] = None,
             order: Optional[List[str]] = None, prune: bool = True) -> StructuredDataSet:
        return StructuredDataSet(file=file, portal=portal, schemas=schemas, order=order, prune=prune)

    def validate(self) -> Optional[List[str]]:
        issues = []
        for type_name in self.data:
            if (schema := Schema.load_by_name(type_name, portal=self._portal)):
                for data in self.data[type_name]:
                    if (validate_issues := schema.validate(data)) is not None:
                        issues.extend(validate_issues)
        return issues + (self._issues or [])

    def _load_file(self, file: str) -> None:
        # Returns a dictionary where each property is the name (i.e. the type) of the data,
        # and the value is array of dictionaries for the data itself. Handle these kinds of files:
        # 1.  Single CSV of JSON file, where the (base) name of the file is the data type name.
        # 2.  Single Excel file containing one or more sheets, where each sheet
        #     represents (i.e. is named for, and contains data for) a different type.
        # 3.  Zip file (.zip or .tar.gz or .tgz or .tar), containing data files to load, where the
        #     base name of each contained file is the data type name; or any of above gzipped (.gz).
        if file.endswith(".gz") or file.endswith(".tgz"):
            with unpack_gz_file_to_temporary_file(file) as file:
                return self._load_normal_file(file)
        return self._load_normal_file(file)

    def _load_normal_file(self, file: str) -> None:
        if file.endswith(".csv") or file.endswith(".tsv"):
            self._load_csv_file(file)
        elif file.endswith(".xls") or file.endswith(".xlsx"):
            self._load_excel_file(file)
        elif file.endswith(".json"):
            self._load_json_file(file)
        elif file.endswith(".tar") or file.endswith(".zip"):
            self._load_packed_file(file)

    def _load_packed_file(self, file: str) -> None:
        for file in unpack_files(file, suffixes=ACCEPTABLE_FILE_SUFFIXES):
            self._load_file(file)

    def _load_csv_file(self, file: str) -> None:
        self._load_reader(reader := CsvReader(file), type_name=_get_type_name(file))
        self._note_issues(reader.issues, os.path.basename(file))

    def _load_excel_file(self, file: str) -> None:
        excel = Excel(file)  # Order the sheet names by any specified ordering (e.g. ala snovault.loadxl).
        order = {_get_type_name(key): index for index, key in enumerate(self._order)} if self._order else {}
        for sheet_name in sorted(excel.sheet_names, key=lambda key: order.get(_get_type_name(key), sys.maxsize)):
            self._load_reader(reader := excel.sheet_reader(sheet_name), type_name=_get_type_name(sheet_name))
            self._note_issues(reader.issues, f"{file}:{sheet_name}")

    def _load_json_file(self, file: str) -> None:
        with open(file) as f:
            self._add(_get_type_name(file), json.load(f))

    def _load_reader(self, reader: RowReader, type_name: str) -> None:
        schema = None
        noschema = False
        structured_row_template = None
        for row in reader:
            if not structured_row_template:  # Delay creation just so we don't create it if there are no rows.
                if not schema and not noschema and not (schema := Schema.load_by_name(type_name, portal=self._portal)):
                    noschema = True
                structured_row_template = _StructuredRowTemplate(reader.header, schema)
            structured_row = structured_row_template.create_row()
            for column_name, value in row.items():
                structured_row_template.set_value(structured_row, column_name, value, reader.location)
            self._add(type_name, structured_row)

    def _add(self, type_name: str, data: Union[dict, List[dict]]) -> None:
        if self._prune:
            remove_empty_properties(data)
        if type_name in self.data:
            self.data[type_name].extend([data] if isinstance(data, dict) else data)
        else:
            self.data[type_name] = [data] if isinstance(data, dict) else data

    def _note_issues(self, issues: Optional[List[str]], source: str) -> None:
        if issues:
            if not self._issues:
                self._issues = []
            self._issues.append({source: issues})

class _StructuredRowTemplate:

    def __init__(self, column_names: List[str], schema: Optional[Schema] = None) -> None:
        self._schema = schema
        self._set_value_functions = {}
        self.data = self._create_row_template(column_names)

    def create_row(self) -> dict:
        return copy.deepcopy(self.data)

    def set_value(self, data: dict, column_name: str, value: str, loc: int = -1) -> None:
        if self._schema:
            value = self._schema.map_value(value, column_name, loc)
        if not (set_value_function := self._set_value_functions.get(column_name)):
            if self._schema:
                if isinstance(typeinfo := self._schema._typeinfo.get(column_name), str):
                    if not (set_value_function := self._set_value_functions.get(typeinfo)):
                        return
        set_value_function(data, value)

    def _create_row_template(self, column_names: List[str]) -> dict:

        def parse_array_components(column_name: str, value: Optional[Any], path: List[Union[str, int]]) -> Tuple[Optional[str], Optional[List[Any]]]:
            array = None  # Handle array of array here even though we don't in general.
            array_name, array_indices = _StructuredRowTemplate._get_array_indices(column_name)
            if not array_name:
                return None, None
            array_length = None
            for array_index in array_indices[::-1]:  # Reverse iteration from the last/inner-most index to first.
                path.insert(0, array_index if array_length is None else max(array_index, 0))
                array_length = max(array_index + 1, 1)
                #path.insert(0, max(array_index, 0))
                if array is None and value is None:
                    array = [None for _ in range(array_length)]
                else:
                    array = [(copy.deepcopy(value if array is None else array)) for _ in range(array_length)]

            return array_name, array

        def parse_components(column_name_components: List[str], path: List[Union[str, int]]) -> dict:
            value = parse_components(column_name_components[1:], path) if len(column_name_components) > 1 else None
            array_name, array = parse_array_components(column_name_component := column_name_components[0], value, path)
            path.insert(0, array_name or column_name_component)
            return {array_name: array} if array_name else {column_name_component: value}

        def set_value(data: Union[dict, list], value: Optional[Any], path: List[Union[str, int]]) -> None:
            xdata = data
            for p in path[:-1]:
                data = data[p]
            #if isinstance(p := path[-1], int) and isinstance(value, list):
            if (p := path[-1]) == -1 and isinstance(value, list):
                merge_objects(data, value)  # data[:] = value
            else:
                data[p] = value

        structured_row_template = {}
        for column_name in column_names or []:
            path = []
            if NEW:
                if self._schema:
                    if isinstance(schema_typeinfo := self._schema._typeinfo.get(column_name), str):
                        column_name = schema_typeinfo  # column name unadorned with array indicators; get name from schema.
                        pass
            if (column_name_components := _split_dotted_string(column_name)):
                merge_objects(structured_row_template, parse_components(column_name_components, path), True)
                self._set_value_functions[column_name] = lambda data, value, path=path: set_value(data, value, path)
        return structured_row_template

    @staticmethod
    def _get_array_indices(name: str) -> Tuple[Optional[str], Optional[List[int]]]:
        indices = []
        while (array_indicator_position := name.rfind(ARRAY_NAME_SUFFIX_CHAR)) > 0:
            array_index = name[array_indicator_position + 1:] if array_indicator_position < len(name) - 1 else -1
            if (array_index := to_integer(array_index)) is None:
                break
            name = name[0:array_indicator_position]
            indices.insert(0, array_index)
        return (name, indices) if indices else (None, None)


class Schema:

    def __init__(self, schema_json: dict, portal: Optional[Portal] = None) -> None:
        self.data = schema_json
        self.name = _get_type_name(schema_json.get("title", "")) if schema_json else ""
        self._portal = portal  # Needed only to resolve linkTo references.
        self._types = {
            "array": { "map": self._map_function_array, "default": [] },
            "boolean": { "map": self._map_function_boolean, "default": False },
            "enum": { "map": self._map_function_enum, "default": "" },
            "integer": { "map": self._map_function_integer, "default": 0 },
            "number": { "map": self._map_function_number, "default": 0.0 },
            "string": { "map": self._map_function_string, "default": "" }
        }
        self._map = {key: value["map"] for key, value in self._types.items()}
        self._defaults = {key: value["default"] for key, value in self._types.items()}
        self._typeinfo = self._create_typeinfo(schema_json)

    @staticmethod
    def load_by_name(name: str, portal: Portal) -> Optional[dict]:
        return Schema(portal.get_schema(_get_type_name(name)), portal) if portal else None

    def validate(self, data: dict) -> Optional[List[str]]:
        issues = []
        for issue in SchemaValidator(self.data, format_checker=SchemaValidator.FORMAT_CHECKER).iter_errors(data):
            issues.append(issue.message)
        return issues if issues else None

    def map_value(self, value: str, column_name: str, loc: int) -> Optional[Any]:
        column_name = self._normalize_column_name(column_name)
        src = f"{self.name}{f'.{column_name}' if column_name else ''}{f' [{loc}]' if loc else ''}"
        mapv = (self._get_typeinfo(column_name) or {}).get("map")
        return mapv(value, src) if mapv else load_json_if(value, is_object=True, is_array=True, fallback=value)

    def get_default_value(self, column_name: str) -> Optional[Any]:
        return self._defaults.get((self._get_typeinfo(column_name) or {}).get("type"))

    def _get_typeinfo(self, column_name: str) -> Optional[dict]:
        if NEW:
            if isinstance(typeinfo := self._typeinfo.get(column_name), str):
                typeinfo = self._typeinfo.get(typeinfo)
            return typeinfo
        return self._typeinfo.get(column_name) or self._typeinfo.get(column_name + ARRAY_NAME_SUFFIX_CHAR)
        
    def _map_function(self, typeinfo: dict) -> Optional[Callable]:
        if isinstance(typeinfo, dict) and (typeinfo_type := typeinfo.get("type")) is not None:
            if isinstance(typeinfo_type, list):
                # The type specifier can actually be a list of acceptable types; for
                # example smaht-portal/schemas/mixins.json/meta_workflow_input#.value;
                # we will take the first one for which we have a mapping function.
                # TODO: Maybe more correct to get all map function and map to any for values.
                for acceptable_type in typeinfo_type:
                    if (map_function := self._map.get(acceptable_type)) is not None:
                        break
            elif not isinstance(typeinfo_type, str):
                return None  # Invalid type specifier; ignore,
            elif isinstance(typeinfo.get("enum"), list):
                map_function = self._map_function_enum
            elif isinstance(typeinfo.get("linkTo"), str):
                map_function = self._map_function_ref
            else:
                map_function = self._map.get(typeinfo_type)
            return map_function(typeinfo) if map_function else None
        return None

    def _map_function_array(self, typeinfo: dict) -> Callable:
        def map_array(value: str, mapv: Optional[Callable], src: Optional[str]) -> Any:
            value = _split_array_string(value) if mapv else load_json_if(value, is_array=True, fallback=value)
            return [mapv(value, src) for value in value] if mapv else value
        return lambda value, src: map_array(value, self._map_function(typeinfo), src)

    def _map_function_boolean(self, typeinfo: dict) -> Callable:
        def map_boolean(value: str, src: Optional[str]) -> Any:
            return to_boolean(value, value)
        return map_boolean

    def _map_function_enum(self, typeinfo: dict) -> Callable:
        def map_enum(value: str, enum_specifiers: dict, src: Optional[str]) -> Any:
            return to_enum(value, enum_specifiers)
        return lambda value, src: map_enum(value, typeinfo.get("enum", []), src)

    def _map_function_integer(self, typeinfo: dict) -> Callable:
        def map_integer(value: str, src: Optional[str]) -> Any:
            return to_integer(value, value)
        return map_integer

    def _map_function_number(self, typeinfo: dict) -> Callable:
        def map_number(value: str, src: Optional[str]) -> Any:
            return to_float(value, value)
        return map_number

    def _map_function_string(self, typeinfo: dict) -> Callable:
        def map_string(value: str, src: Optional[str]) -> str:
            return value if value is not None else ""
        return map_string

    def _map_function_ref(self, typeinfo: dict) -> Callable:
        def map_ref(value: str, link_to: str, portal: Optional[Portal], src: Optional[str]) -> Any:
            nonlocal self, typeinfo
            exception = None
            if not value:
                if (column := typeinfo.get("column")) and column in self.data.get("required", []):
                    exception = f"No required reference (linkTo) value for: {link_to}"
            elif portal and not portal.ref_exists(link_to, value):
                exception = f"Cannot resolve reference (linkTo) for: {link_to}"
            if exception:
                raise Exception(exception + f"{f'/{value}' if value else ''}{f' from {src}' if src else ''}")
            return value
        return lambda value, src: map_ref(value, typeinfo.get("linkTo"), self._portal, src)

    def _create_typeinfo(self, schema_json: dict, parent_key: Optional[str] = None) -> dict:
        """
        Given a JSON schema return a dictionary of all the property names it defines, but with
        the names of any nested properties (i.e objects within objects) flattened into a single
        property name in dot notation; and set the value of each of these flat property names
        to the type of the terminal/leaf value of the (either) top-level or nested type. N.B. We
        do NOT currently support array-of-arry or array-of-multiple-types. E.g. for this schema:

          { "properties": {
              "abc": {
                "type": "object",
                "properties": {
                  "def": { "type": "string" },
                  "ghi": {
                    "type": "object",
                    "properties": {
                      "mno": { "type": "number" }
                    }
                  }
                } },
              "stu": { "type": "array", "items": { "type": "string" } },
              "vw": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "xyz": { "type": "integer" }
                  } }
              } } }

        Then we will return this flat dictionary:

          { "abc.def":     { "type": "string", "map": <function:map_string> },
            "abc.ghi.mno": { "type": "number", "map": <function:map_number> },
            "stu#":        { "type": "string", "map": <function:map_string> },
            "vw#.xyz":     { "type": "integer", "map": <function:map_integer> } }
        """
        result = {}
        if (properties := schema_json.get("properties")) is None:
            if parent_key:
                if (schema_type := schema_json.get("type")) is None:
                    schema_type = "string"  # Undefined array type; should not happen; just make it a string.
                if schema_type == "array":
                    parent_key += ARRAY_NAME_SUFFIX_CHAR
                #result[parent_key] = {"type": schema_type, "map": self._map_function_array(schema_json)}
                result[parent_key] = {"type": schema_type, "map": self._map_function(schema_json)}
                if NEW:
#                   if parent_key.endswith(ARRAY_NAME_SUFFIX_CHAR):
#                       result[parent_key.rstrip(ARRAY_NAME_SUFFIX_CHAR)] = parent_key
                    if ARRAY_NAME_SUFFIX_CHAR in parent_key:
                        result[parent_key.replace(ARRAY_NAME_SUFFIX_CHAR, "")] = parent_key
            return result
        for property_key, property_value in properties.items():
            if not isinstance(property_value, dict) or not property_value:
                continue  # Should not happen; every property within properties should be an object; no harm; ignore.
            key = property_key if parent_key is None else f"{parent_key}{DOTTED_NAME_DELIMITER_CHAR}{property_key}"
            if ARRAY_NAME_SUFFIX_CHAR in property_key:
                raise Exception(f"Property name with \"{ARRAY_NAME_SUFFIX_CHAR}\" in JSON schema NOT supported: {key}")
            if (property_value_type := property_value.get("type")) == "object" and "properties" in property_value:
                result.update(self._create_typeinfo(property_value, parent_key=key))
                continue
            if property_value_type == "array":
                while property_value_type == "array":  # Handle array of array here even though we don't in general.
                    if not isinstance((array_property_items := property_value.get("items")), dict):
                        if array_property_items is None or isinstance(array_property_items, list):
                            raise Exception(f"Array of undefined or multiple types in JSON schema NOT supported: {key}")
                        raise Exception(f"Invalid array type specifier in JSON schema: {key}")
                    key = key + ARRAY_NAME_SUFFIX_CHAR
                    property_value = array_property_items
                    property_value_type = property_value.get("type")
                result.update(self._create_typeinfo(array_property_items, parent_key=key))
                continue
            result[key] = {"type": property_value_type, "map": self._map_function({**property_value, "column": key})}
            if NEW:
#               if key.endswith(ARRAY_NAME_SUFFIX_CHAR):
#                   result[key.rstrip(ARRAY_NAME_SUFFIX_CHAR)] = key
                if ARRAY_NAME_SUFFIX_CHAR in key:
                    result[key.replace(ARRAY_NAME_SUFFIX_CHAR, "")] = key
        return result

    @staticmethod
    def _normalize_column_name(column_name: str) -> str:
        """
        Given a string representing a flat column name, i.e possibly dot-separated name components,
        and where each component possibly ends with an array suffix (i.e. pound sign - #) followed
        by an integer, removes the integer part for each such array component; also trims names.
        For example given "abc#12. def .ghi#3" returns "abc#.def.ghi#".
        """
        if NEW:
            return DOTTED_NAME_DELIMITER_CHAR.join(
                    [ARRAY_NAME_SUFFIX_REGEX.sub(ARRAY_NAME_SUFFIX_CHAR, value)
#                    for value in _split_dotted_string(column_name)]).rstrip(ARRAY_NAME_SUFFIX_CHAR)
                     for value in _split_dotted_string(column_name)]).replace(ARRAY_NAME_SUFFIX_CHAR, "")
        else:
            return DOTTED_NAME_DELIMITER_CHAR.join([ARRAY_NAME_SUFFIX_REGEX.sub(ARRAY_NAME_SUFFIX_CHAR, value)
                                                    for value in _split_dotted_string(column_name)])


class Portal:

    def __init__(self, portal: PortalAny, data: Optional[dict] = None, schemas: Optional[List[dict]] = None) -> None:
        self.vapp = portal.vapp if isinstance(portal, Portal) else portal
        self._data = data  # Data set being loaded (e.g. by StructuredDataSet).
        self._schemas = schemas  # Explicitly specified known schemas.

    @lru_cache(maxsize=256)
    def get_schema(self, schema_name: str) -> Optional[dict]:
        return (next((schema for schema in self._schemas or []
                     if _get_type_name(schema.get("title")) == _get_type_name(schema_name)), None) or
                get_schema(schema_name, portal_vapp=self.vapp))

    @lru_cache(maxsize=256)
    def get_metadata(self, object_name: str) -> Optional[dict]:
        try:
            return get_metadata(object_name, vapp=self.vapp)
        except Exception:
            return None

    def ref_exists(self, type_name: str, value: str) -> bool:
        if self._data and (items := self._data.get(type_name)) and (schema := self.get_schema(type_name)):
            iproperties = set(schema.get("identifyingProperties", [])) | {"identifier", "uuid"}
            for item in items:
                if (ivalue := next((item[iproperty] for iproperty in iproperties if iproperty in item), None)):
                    if isinstance(ivalue, list) and value in ivalue or ivalue == value:
                        return True
        return self.get_metadata(f"/{type_name}/{value}") is not None

    @staticmethod
    def create(portal: Optional[PortalAny] = None,
               data: Optional[dict] = None, schemas: Optional[List[dict]] = None) -> Optional[Portal]:
        if isinstance(portal, Portal):
            if data is not None:
                portal._data = data
            if schemas is not None:
                portal._schemas = schemas
            return portal
        return Portal(portal, data=data, schemas=schemas) if portal else None

    @staticmethod
    def create_for_testing(ini_file: Optional[str] = None, schemas: Optional[List[dict]] = None) -> Portal:
        if isinstance(ini_file, str):
            return Portal(create_testapp(ini_file), schemas=schemas)
        minimal_ini_for_unit_testing = "[app:app]\nuse = egg:encoded\nsqlalchemy.url = postgresql://dummy\n"
        with temporary_file(content=minimal_ini_for_unit_testing, suffix=".ini") as ini_file:
            return Portal(create_testapp(ini_file), schemas=schemas)


def _get_type_name(value: str) -> str:  # File or other name.
    name = os.path.basename(value).replace(" ", "") if isinstance(value, str) else ""
    return to_camel_case(name[0:dot] if (dot := name.rfind(".")) > 0 else name)


def _split_dotted_string(value: str):
    return split_string(value, DOTTED_NAME_DELIMITER_CHAR)


def _split_array_string(value: str):
    return split_string(value, ARRAY_VALUE_DELIMITER_CHAR, ARRAY_VALUE_DELIMITER_ESCAPE_CHAR)
