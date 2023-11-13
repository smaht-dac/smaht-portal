import abc
import copy
from contextlib import contextmanager
import csv
from functools import lru_cache
import gzip
import inspect
import json
from jsonschema import Draft7Validator as JsonSchemaValidator
import openpyxl
import os
import re
import shutil
import tarfile
import tempfile
from typing import Any, Callable, Generator, Iterator, List, Optional, Tuple, Union
from webtest.app import TestApp
import zipfile
from dcicutils.ff_utils import get_metadata, get_schema
from dcicutils.misc_utils import to_camel_case, VirtualApp
from snovault.loadxl import create_testapp

# Classes/functions to parse a CSV or Excel Spreadsheet into structured data, using a specialized
# syntax to allow structured object properties to be referenced by column specifiers. This syntax
# uses an (intuitive) dot notation to reference nested objects, and a (less intuitive) notation
# utilizing the "#" character to reference array elements. May also further coerce data types by
# consulting an optionally specified JSON schema.
#
# Alternate and (should be) semantically equivalent implementation of dcicutils.{sheet,bundle}_utils.
# Written in spare time as interesting exercise and with benefit of sheet_utils implementation experience.

ACCEPTABLE_FILE_SUFFIXES = [".csv", ".json", ".xls", ".xlsx", ".gz", ".tar", ".tar.gz", ".tgz", ".zip"]
ARRAY_NAME_SUFFIX_CHAR = "#"
ARRAY_NAME_SUFFIX_REGEX = re.compile(rf"{ARRAY_NAME_SUFFIX_CHAR}\d+")
ARRAY_VALUE_DELIMITER_CHAR = "|"
ARRAY_VALUE_DELIMITER_ESCAPE_CHAR = "\\"
DOTTED_NAME_DELIMITER_CHAR = "."

class Portal:

    def __init__(self, portal_vapp: Union[VirtualApp, TestApp], loading_data_set: Optional[dict] = None) -> None:
        self.vapp = portal_vapp
        self.loading_data_set = loading_data_set

    @lru_cache(maxsize=256)
    def get_schema(self, schema_name: str) -> Optional[dict]:
        return get_schema(schema_name, portal_vapp=self.vapp)

    @lru_cache(maxsize=256)
    def get_metadata(self, object_name: str) -> Optional[dict]:
        return get_metadata(object_name, vapp=self.vapp)

    def ref_exists(self, type_name: str, value: str) -> bool:
        if self._ref_exists_within_loading_data_set(type_name, value):
            return True
        return self.get_metadata(f"/{type_name}/{value}") is not None

    def _ref_exists_within_loading_data_set(self, type_name: str, value: str) -> bool:
        if self.loading_data_set and isinstance(items := self.loading_data_set.get(type_name), list):
            if (type_schema := self.get_schema(type_name)):
                identifying_properties = set(type_schema.get("identifyingProperties", [])) | {"identifier", "uuid"}
                for item in items:
                    for identifying_property in identifying_properties:
                        if item.get(identifying_property) == value:
                            return True
        return False
        
    @staticmethod
    def create_for_testing(ini_file: Optional[str] = None) -> TestApp:
        return Portal.create_for_local_testing(ini_file) if ini_file else Portal.create_for_unit_testing()

    @staticmethod
    def create_for_unit_testing() -> Any:
        minimal_ini_for_unit_testing = "[app:app]\nuse = egg:encoded\nsqlalchemy.url = postgresql://dummy\n"
        with Utils.temporary_file(content=minimal_ini_for_unit_testing, suffix=".ini") as ini_file:
            return Portal(create_testapp(ini_file))

    @staticmethod
    def create_for_local_testing(ini_file: Optional[str] = None) -> TestApp:
        if ini_file:
            return Portal(create_testapp(ini_file))
        minimal_ini_for_local_testing = "\n".join([
            "[app:app]\nuse = egg:encoded",
            "sqlalchemy.url = postgresql://postgres@localhost:5441/postgres?host=/tmp/snovault/pgdata",
            "multiauth.groupfinder = encoded.authorization.smaht_groupfinder",
            "multiauth.policies = auth0 session remoteuser accesskey",
            "multiauth.policy.session.namespace = mailto",
            "multiauth.policy.session.use = encoded.authentication.NamespacedAuthenticationPolicy",
            "multiauth.policy.session.base = pyramid.authentication.SessionAuthenticationPolicy",
            "multiauth.policy.remoteuser.namespace = remoteuser",
            "multiauth.policy.remoteuser.use = encoded.authentication.NamespacedAuthenticationPolicy",
            "multiauth.policy.remoteuser.base = pyramid.authentication.RemoteUserAuthenticationPolicy",
            "multiauth.policy.accesskey.namespace = accesskey",
            "multiauth.policy.accesskey.use = encoded.authentication.NamespacedAuthenticationPolicy",
            "multiauth.policy.accesskey.base = encoded.authentication.BasicAuthAuthenticationPolicy",
            "multiauth.policy.accesskey.check = encoded.authentication.basic_auth_check",
            "multiauth.policy.auth0.use = encoded.authentication.NamespacedAuthenticationPolicy",
            "multiauth.policy.auth0.namespace = auth0",
            "multiauth.policy.auth0.base = encoded.authentication.Auth0AuthenticationPolicy"
        ])
        with Utils.temporary_file(content=minimal_ini_for_local_testing, suffix=".ini") as ini_file:
            return Portal(create_testapp(ini_file))


class Schema:

    def __init__(self, schema_json: dict, portal: Optional[Portal] = None) -> None:
        self.data = schema_json
        self._portal = portal
        self._flattened_type_info = self._compute_flattened_schema_type_info(schema_json)

    @staticmethod
    def load_from_file(file_name: str, portal: Optional[Portal] = None) -> Optional[dict]:
        with open(file_name) as f:
            return Schema(json.load(f), portal)

    @staticmethod
    def load_by_name(file_or_schema_name: str, portal: Optional[Portal]) -> Optional[dict]:
        return Schema(portal.get_schema(Utils.get_type_name(file_or_schema_name)), portal) if portal else None

    def map_value(self, flattened_column_name: str, value: str) -> Optional[Any]:
        flattened_column_name = self._normalize_flattened_column_name(flattened_column_name)
        if (map_function := self._flattened_type_info.get(flattened_column_name, {}).get("map")) is None:
            map_function = self._flattened_type_info.get(flattened_column_name + ARRAY_NAME_SUFFIX_CHAR, {}).get("map")
        return map_function(value) if map_function else value

    def get_flattened_type_info(self, debug: bool = False):
        return {key: {k: (self._map_function_name(v) if k == "map" and isinstance(v, Callable) and debug else v)
                      for k, v in value.items()} for key, value in self._flattened_type_info.items()}

    def validate(self, data: dict) -> Optional[List[str]]:
        validator = JsonSchemaValidator(self.data, format_checker=JsonSchemaValidator.FORMAT_CHECKER)
        errors = []
        for error in validator.iter_errors(data):
            errors.append(str(error))
        return errors if errors else None

    def _compute_flattened_schema_type_info(self, schema_json: dict, parent_key: Optional[str] = None) -> dict:
        """
        Given a JSON schema return a dictionary of all the property names it defines, but with
        the names of any nested properties (i.e objects within objects) flattened into a single
        property name in dot notation; and set the value of each of these flattened property names
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
                      "jkl": { "type": "string" },
                      "mno": { "type": "number" }
                    }
                  }
                }
              },
              "pqr": { "type": "integer" },
              "stu": { "type": "array", "items": { "type": "string" } },
              "vw": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "xy": { "type": "integer" },
                    "z": { "type": "boolean" }
                  }
                }
              }
            }
          }

        Then we will return this flattened dictionary:

          { "abc.def":     { "type": "string", "map": <map_value_string> },
            "abc.ghi.jkl": { "type": "string", "map": <map_value_string> },
            "abc.ghi.mno": { "type": "number", "map": <map_value_number> },
            "pqr":         { "type": "integer", "map": <map_value_integer> },
            "stu#":        { "type": "string", "map": <map_value_string> },
            "vw#.xy":      { "type": "integer", "map": <map_value_intege> },
            "vw#.z":       { "type": "boolean", "map": <map_value_boolean> } }
        """
        result = {}
        if (properties := schema_json.get("properties")) is None:
            if parent_key:
                if (schema_type := schema_json.get("type")) is None:
                    raise Exception(f"Array of undefined type in JSON schema NOT supported: {parent_key}")
                if schema_type == "array":
                    raise Exception(f"Array of array in JSON schema NOT supported: {parent_key}")
                result[parent_key] = {"type": schema_type, "map": self._map_function_array(schema_json)}
            return result
        for property_key, property_value in properties.items():
            if not isinstance(property_value, dict) or not property_value:
                # Should not happen; every property within properties should be an object; no harm; ignore.
                continue
            key = property_key if parent_key is None else f"{parent_key}{DOTTED_NAME_DELIMITER_CHAR}{property_key}"
            if ARRAY_NAME_SUFFIX_CHAR in property_key:
                raise Exception(f"Property name with \"{ARRAY_NAME_SUFFIX_CHAR}\" in JSON schema NOT supported: {key}")
            if (property_value_type := property_value.get("type")) == "object" and "properties" in property_value:
                result.update(self._compute_flattened_schema_type_info(property_value, parent_key=key))
                continue
            if property_value_type == "array":
                key += ARRAY_NAME_SUFFIX_CHAR
                if not isinstance(array_property_items := property_value.get("items"), dict):
                    if array_property_items is None:
                        raise Exception(f"Array of undefined type in JSON schema NOT supported: {key}")
                    if isinstance(array_property_items, list):
                        raise Exception(f"Array of multiple types in JSON schema NOT supported: {key}")
                    raise Exception(f"Invalid array type specifier in JSON schema: {key}")
                result.update(self._compute_flattened_schema_type_info(array_property_items, parent_key=key))
                continue
            result[key] = {"type": property_value_type, "map": self._map_function(property_value)}
        return result

    @staticmethod
    def _normalize_flattened_column_name(flattened_column_name: str) -> str:
        """
        Given a string representing a flattened column name, i.e possibly dot-separated name components,
        and where each component possibly ends with an array suffix (i.e. pound sign - #) followed by
        an integer, removes the integer part for each such array component; also ensures that
        any extraneous spaces which might be surrounding each component are removed.
        For example given "abc#12. def .ghi#3" returns "abc#.def.ghi#".
        """
        flattened_column_name_components = Utils.split_dotted_string(flattened_column_name)
        for i in range(len(flattened_column_name_components)):
            flattened_column_name_components[i] = ARRAY_NAME_SUFFIX_REGEX.sub(ARRAY_NAME_SUFFIX_CHAR,
                                                                              flattened_column_name_components[i])
        return DOTTED_NAME_DELIMITER_CHAR.join(flattened_column_name_components)

    def _map_function(self, type_info: dict) -> Optional[Callable]:
        MAP_FUNCTIONS = {
            "array": self._map_function_array,
            "boolean": self._map_function_boolean,
            "enum": self._map_function_enum,
            "integer": self._map_function_integer,
            "number": self._map_function_number,
            "ref": self._map_function_ref,
            "string": self._map_function_string
        }
        if isinstance(type_info, dict) and (type_info_type := type_info.get("type")) is not None:
            if isinstance(type_info_type, list):
                # The type specifier can actually be a list of acceptable types; for
                # example smaht-portal/schemas/meta_workflow.json/workflows#.input#.value;
                # we will take the first one for which we have a mapping function.
                # TODO: Maybe more correct to get all map function and map to any for values.
                for acceptable_type in type_info_type:
                    if (map_function := MAP_FUNCTIONS.get(acceptable_type)) is not None:
                        break
            elif not isinstance(type_info_type, str):
                raise Exception(f"Invalid type specifier type ({type(type_info_type).__name__}) in JSON schema.")
            elif isinstance(type_info.get("enum"), list):
                map_function = MAP_FUNCTIONS.get("enum")
            elif isinstance(type_info.get("linkTo"), str):
                map_function = MAP_FUNCTIONS.get("ref")
            else:
                map_function = MAP_FUNCTIONS.get(type_info_type)
            return map_function(type_info) if map_function else None
        return None

    def _map_function_array(self, type_info: dict) -> Callable:
        def map_value_array(value: str, array_type_map_function: Optional[Callable]) -> Any:
            value = Utils.split_array_string(value)
            return [array_type_map_function(value) for value in value] if array_type_map_function else value
        return lambda value: map_value_array(value, self._map_function(type_info))

    def _map_function_boolean(self, type_info: dict) -> Callable:
        def map_value_boolean(value: str) -> Any:
            if isinstance(value, str) and (value := value.strip().lower()):
                if (lower_value := value.lower()) in ["true", "t"]:
                    return True
                elif lower_value in ["false", "f"]:
                    return False
            return value
        return map_value_boolean

    def _map_function_enum(self, type_info: dict) -> Callable:
        def map_value_enum(value: str, enum_specifier: dict) -> Any:
            if isinstance(value, str) and (value := value.strip()):
                if (enum_value := enum_specifier.get(lower_value := value.lower())) is not None:
                    return enum_value
                matches = []
                for enum_canonical, _ in enum_specifier.items():
                    if enum_canonical.startswith(lower_value):
                        matches.append(enum_canonical)
                if len(matches) == 1:
                    return enum_specifier[matches[0]]
            return value
        return lambda value: map_value_enum(value, {str(enum).lower(): enum for enum in type_info.get("enum", [])})

    def _map_function_integer(self, type_info: dict) -> Callable:
        def map_value_integer(value: str) -> Any:
            return Utils.to_integer(value, value)
        return map_value_integer

    def _map_function_ref(self, type_info: dict) -> Callable:
        def map_value_ref(value: str, link_to: str, portal: Optional[Portal]) -> Any:
            if link_to and portal and not portal.ref_exists(link_to, value):
                raise Exception(f"Cannot resolve reference (linkTo): {link_to}/{value}")
            return value
        return lambda value: map_value_ref(value, type_info.get("linkTo"), self._portal)

    def _map_function_number(self, type_info: dict) -> Callable:
        def map_value_number(value: str) -> Any:
            try:
                return float(value)
            except Exception:
                pass
            return value
        return map_value_number

    def _map_function_string(self, type_info: dict) -> Callable:
        def map_value_string(value: str) -> str:
            return value if value is not None else ""
        return map_value_string

    def _map_function_name(self, map_function: Callable) -> str:
        # This is ONLY for testing/troubleshooting; get the NAME of the mapping function; this is HIGHLY
        # implementation DEPENDENT, on the map_function_<type> functions. The map_function, as a string,
        # looks like: <function Schema._map_function_string.<locals>.map_value_string at 0x103474900> or
        # if it is implemented as a lambda (to pass in closure), then inspect.getclosurevars.nonlocals looks like:
        # {"map_value_enum": <function Schema._map_function_enum.<locals>.map_value_enum at 0x10544cd60>, ...}
        if isinstance(map_function, Callable):
            if (match := re.search(r"\.(\w+) at", str(map_function))):
                return f"<{match.group(1)}>"
            for item in inspect.getclosurevars(map_function).nonlocals:
                if item.startswith("map_value_"):
                    return f"<{item}>"
        return type(map_function)


class RowReader(abc.ABC):
    def __init__(self):
        self._header = None
        self._row_number = 0
        self._warning_empty_header_columns = False
        self._warning_extraneous_row_values = []  # Line numbers.
        self.open()

    def __iter__(self) -> Iterator:
        for row in self.rows:
            self._row_number += 1
            if self.is_terminating_row(row):
                break
            if len(self.header) < len(row):
                # If any row values present beyond what there are headers for then ignore.
                self._warning_extraneous_row_values.append(self._row_number)
            yield {column: self.cell_value(value) for column, value in zip(self.header, row)}

    @property
    def header(self) -> List[str]:
        return self._header

    def define_header(self, header: List[Optional[Any]]) -> None:
        self._header = []
        for column in header or []:
            if not (column := str(column).strip() if column is not None else ""):
                self._warning_empty_header_columns = True
                break  # If empty header column encountered then signals end of header.
            self._header.append(column)

    @abc.abstractproperty
    def rows(self) -> Generator[Union[List[Optional[Any]], Tuple[Optional[Any], ...]], None, None]:
        pass

    def is_terminating_row(self, row: Union[List[Optional[Any]], Tuple[Optional[Any]]]) -> bool:
        return False

    def cell_value(self, value: Optional[Any]) -> Optional[Any]:
        return str(value).strip() if value is not None else ""

    def open(self) -> None:
        pass

    @property
    def warnings(self) -> Optional[list]:
        warnings = []
        if self._warning_empty_header_columns:
            warnings.append("Empty header column encountered; ignore it and all following it.")
        if self._warning_extraneous_row_values:
            warnings.extend([f"Extra column values on row: {row_number}"
                             for row_number in self._warning_extraneous_row_values])
        return warnings if warnings else None


class ListReader(RowReader):
    def __init__(self, rows: List[List[Optional[Any]]]) -> None:
        self._rows = rows
        super().__init__()

    @property
    def rows(self) -> Generator[List[Optional[Any]], None, None]:
        for row in self._rows[1:]:
            yield row

    def open(self) -> None:
        if not self.header:
            self.define_header(self._rows[0] if self._rows else [])


class CsvReader(RowReader):
    def __init__(self, file: str) -> None:
        self._file = file
        self._file_handle = None
        self._reader = None
        super().__init__()

    @property
    def rows(self) -> Generator[List[Optional[Any]], None, None]:
        for row in self._reader:
            yield row

    def open(self) -> None:
        if self._file_handle is None:
            self._file_handle = open(self._file, newline="")
            self._reader = csv.reader(self._file_handle)
            self.define_header(next(self._reader, []))

    def __del__(self) -> None:
        if (file_handle := self._file_handle) is not None:
            self._file_handle = None
            file_handle.close()


class ExcelSheetReader(RowReader):
    def __init__(self, workbook: openpyxl.workbook.workbook.Workbook, sheet_name: str) -> None:
        self._workbook = workbook
        self._worksheet_rows = None
        self._sheet_name = sheet_name or "Sheet1"
        super().__init__()

    @property
    def rows(self) -> Generator[Tuple[Optional[Any], ...], None, None]:
        for row in self._worksheet_rows(min_row=2, values_only=True):
            yield row

    def is_terminating_row(self, row: Tuple[Optional[Any]]) -> bool:
        # If an empty row is encountered then it signals the end of the data.
        return all(cell is None for cell in row)

    @property
    def sheet_name(self) -> str:
        return self._sheet_name

    def open(self) -> None:
        if not self._worksheet_rows:
            self._worksheet_rows = self._workbook[self._sheet_name].iter_rows
            self.define_header(next(self._worksheet_rows(min_row=1, max_row=1, values_only=True), []))


class Excel:
    def __init__(self, file: str) -> None:
        self._file = file
        self._workbook = None
        self._sheet_names = None

    @property
    def sheet_names(self) -> List[str]:
        self.open()
        return self._sheet_names

    def sheet_reader(self, sheet_name: str) -> ExcelSheetReader:
        self.open()
        return ExcelSheetReader(workbook=self._workbook, sheet_name=sheet_name)

    def open(self) -> None:
        if self._workbook is None:
            self._workbook = openpyxl.load_workbook(self._file, data_only=True)
            self._sheet_names = self._workbook.sheetnames or []

    def __del__(self) -> None:
        if (workbook := self._workbook) is not None:
            self._workbook = None
            workbook.close()


class StructuredDataSet:

    def __init__(self, file: Optional[str] = None,
                 portal: Optional[Union[Portal, VirtualApp, TestApp]] = None, prune: bool = True) -> None:
        self.data = {}
        if isinstance(portal, Portal):
            self._portal = portal.vapp
        elif isinstance(portal, (VirtualApp, TestApp)):
            self._portal = Portal(portal, self.data)
        else:
            self._portal = None
        self._prune = prune
        self.load_file(file)

    @staticmethod
    def load(file: str, portal: Portal) -> Tuple[dict, Optional[List[str]]]:
        structured_data_set = StructuredDataSet(file, portal)
        validation_errors = structured_data_set.validate()
        return structured_data_set.data, validation_errors

    def load_file(self, file: str) -> None:
        # Returns a dictionary where each property is the name (i.e. the type) of the data,
        # and the value is array of dictionaries for the data itself. Handle thse kinds of files:
        # 1.  Single CSV of JSON file, where the (base) name of the file is the data type name.
        # 2.  Single Excel file containing one or more sheets, where each sheet
        #     represents (i.e. is named for, and contains data for) a different type.
        # 3.  Zip file (.zip or .tar.gz or .tgz or .tar), containing data files to load,
        #     where the (base) name of each contained file is the data type name.
        if file:
            if file.endswith(".csv"):
                self.load_csv_file(file)
            elif file.endswith(".xls") or file.endswith(".xlsx"):
                self.load_excel_file(file)
            elif file.endswith(".json"):
                self.load_json_file(file)
            elif UnpackUtils.is_packed_file(file):
                self.load_packed_file(file)

    def load_csv_file(self, file: str) -> None:
        self.add(Utils.get_type_name(file),
                 StructuredData.load_from_csv_file(file, portal=self._portal, prune=self._prune))

    def load_excel_file(self, file: str) -> None:
        excel = Excel(file)
        for sheet_name in excel.sheet_names:
            self.add(Utils.get_type_name(sheet_name),
                     StructuredData.load_from_excel_sheet(excel, sheet_name, portal=self._portal, prune=self._prune))

    def load_json_file(self, file: str) -> None:
        self.add(Utils.get_type_name(file), StructuredData.load_from_json_file(file))

    def load_packed_file(self, file: str) -> None:
        for file in UnpackUtils.unpack_files(file):
            self.load_file(file)

    def add(self, type_name: str, data: Union[dict, List[dict], Any]) -> None:
        if isinstance(data, StructuredDataSet):
            data = data.data
        elif isinstance(data, dict):
            data = [data]
        if isinstance(data, list):
            if type_name in self.data:
                self.data[type_name].extend(data)
            else:
                self.data[type_name] = data

    def validate(self) -> Optional[List[str]]:
        errors = []
        for type_name in self.data:
            if (schema := Schema.load_by_name(type_name, portal=self._portal)):
                for data in self.data[type_name]:
                    if (validate_errors := schema.validate(data)) is not None:
                        errors.extend(validate_errors)
        return errors


class StructuredData:

    @staticmethod
    def load_from_csv_file(file: str,
                           schema: Optional[Schema] = None,
                           portal: Optional[Portal] = None, prune: bool = False) -> List[dict]:
        if not schema and portal:
            schema = Schema.load_by_name(file, portal=portal)
        return StructuredData._load_from_reader(CsvReader(file), schema=schema, prune=prune)

    def load_from_excel_sheet(excel: Excel, sheet_name: str,
                              schema: Optional[Schema] = None,
                              portal: Optional[Portal] = None, prune: bool = False) -> List[dict]:
        reader = excel.sheet_reader(sheet_name)
        if not schema and portal:
            schema = Schema.load_by_name(reader.sheet_name, portal=portal)
        return StructuredData._load_from_reader(reader, schema=schema, prune=prune)

    @staticmethod
    def load_from_rows(rows: str, schema: Optional[Schema] = None, prune: bool = False) -> List[dict]:
        return StructuredData._load_from_reader(ListReader(rows), schema=schema, prune=prune)

    @staticmethod
    def _load_from_reader(reader: RowReader, schema: Optional[Schema] = None, prune: bool = False) -> List[dict]:
        structured_data = []
        structured_column_data = StructuredColumnData(reader.header)
        for row in reader:
            structured_row = structured_column_data.create_row()
            for flattened_column_name, value in row.items():
                structured_column_data.set_row_value(structured_row, flattened_column_name, value, schema)
            structured_data.append(structured_row)
        if prune:
            Utils.remove_empty_properties(structured_data)
        return structured_data

    @staticmethod
    def load_from_json_file(file: str) -> List[dict]:
        with open(file) as f:
            data = json.load(f)
            return [data] if isinstance(data, dict) else data


class StructuredColumnData:

    def __init__(self, flattened_column_names: List[str]) -> None:
        self.row_template = self._parse_column_headers_into_structured_row_template(flattened_column_names)

    def create_row(self) -> dict:
        return copy.deepcopy(self.row_template)

    @staticmethod
    def set_row_value(structured_row: dict,
                      flattened_column_name: str, value: str,
                      schema: Optional[Schema] = None) -> None:

        def set_single_row_value(structured_row: Union[dict, list],
                                 flattened_column_name_components: List[str],
                                 parent_array_index: Optional[int] = None) -> None:

            if not structured_row or not flattened_column_name_components:
                return
            if isinstance(structured_row, list):
                if parent_array_index is None or parent_array_index < 0:
                    for structured_row_array_element in structured_row:
                        set_single_row_value(structured_row_array_element, flattened_column_name_components)
                else:
                    set_single_row_value(structured_row[parent_array_index], flattened_column_name_components)
                return

            flattened_column_name_component = flattened_column_name_components[0]
            array_name, array_index = StructuredColumnData._get_array_info(flattened_column_name_component)
            column_name_component = array_name if array_name else flattened_column_name_component
            if len(flattened_column_name_components) > 1:
                set_single_row_value(structured_row[column_name_component],
                                     flattened_column_name_components[1:], parent_array_index=array_index)
                return

            nonlocal flattened_column_name, value, schema
            if schema:
                value = schema.map_value(flattened_column_name, value)
            elif array_name is not None and isinstance(value, str):
                value = Utils.split_array_string(value)
            if array_name and array_index >= 0:
                if (not isinstance(structured_row[column_name_component], list) and
                        isinstance(structured_row[column_name_component], str)):
                    # Turns out to be an array afterall, e.g.: abc,abc#2
                    structured_row[column_name_component] = (
                        Utils.split_array_string(structured_row[column_name_component]))
                if len(structured_row[column_name_component]) < array_index + 1:
                    array_extension = [None] * (array_index + 1 - len(structured_row[column_name_component]))
                    structured_row[column_name_component].extend(array_extension)
                structured_row[column_name_component] = (
                    structured_row[column_name_component][:array_index] + value +
                    structured_row[column_name_component][array_index + 1:])
            else:
                structured_row[column_name_component] = value

        if (flattened_column_name_components := Utils.split_dotted_string(flattened_column_name)):
            set_single_row_value(structured_row, flattened_column_name_components)

    @staticmethod
    def _parse_column_headers_into_structured_row_template(flattened_column_names: List[str]) -> dict:

        def parse_column_header_components(flattened_column_name_components: List[str]) -> dict:
            if len(flattened_column_name_components) > 1:
                value = parse_column_header_components(flattened_column_name_components[1:])
            else:
                value = None
            flattened_column_name_component = flattened_column_name_components[0]
            array_name, array_index = StructuredColumnData._get_array_info(flattened_column_name_component)
            if array_name:
                array_length = array_index + 1 if array_index >= 0 else (0 if value is None else 1)
                # Doing it the obvious way, like in the comment right below here, we get
                # identical (shared) values; which we do not want; so do a real/deep copy.
                # return {array_name: [value] * array_length}
                return {array_name: [copy.deepcopy(value) for _ in range(array_length)]}
            return {flattened_column_name_component: value}

        structured_row_template = {}
        for flattened_column_name in flattened_column_names or []:
            if (flattened_column_name_components := Utils.split_dotted_string(flattened_column_name)):
                Utils.merge_objects(structured_row_template,
                                    parse_column_header_components(flattened_column_name_components))
        return structured_row_template

    @staticmethod
    def _get_array_info(name: str) -> Tuple[Optional[str], Optional[int]]:
        if (array_indicator_position := name.rfind(ARRAY_NAME_SUFFIX_CHAR)) > 0:
            array_index = name[array_indicator_position + 1:] if array_indicator_position < len(name) - 1 else -1
            if (array_index := Utils.to_integer(array_index)) is not None:
                return name[0:array_indicator_position], array_index
        return None, None


class Utils:

    @staticmethod
    def split_dotted_string(value: str) -> List[str]:
        return Utils.split_string(value, DOTTED_NAME_DELIMITER_CHAR)

    @staticmethod
    def split_array_string(value: str) -> List[str]:
        return Utils.split_string(value, ARRAY_VALUE_DELIMITER_CHAR, ARRAY_VALUE_DELIMITER_ESCAPE_CHAR)

    @staticmethod
    def split_string(value: str, delimiter: str, escape: Optional[str] = None) -> List[str]:
        if not isinstance(value, str) or not (value := value.strip()):
            return []
        if not isinstance(escape, str) or not escape:
            return [item.strip() for item in value.split(delimiter)]
        result = []
        item = r""
        escaped = False
        for c in value:
            if c == delimiter and not escaped:
                result.append(item.strip())
                item = r""
            elif c == escape and not escaped:
                escaped = True
            else:
                item += c
                escaped = False
        result.append(item.strip())
        return [item for item in result if item]

    @staticmethod
    def merge_objects(target: Union[dict, List[Any]], source: Union[dict, List[Any]]) -> dict:
        """
        Merge, recursively, the given source object into the given target object and return target.
        """
        if isinstance(target, dict) and isinstance(source, dict) and source:
            for source_key, source_value in source.items():
                if source_key in target:
                    target[source_key] = Utils.merge_objects(target[source_key], source_value)
                else:
                    target[source_key] = source_value
        elif isinstance(target, list) and isinstance(source, list) and source:
            for index in range(max(len(source), len(target))):
                if index < len(target):
                    source_value = source[index] if index < len(source) else source[len(source) - 1]
                    target[index] = Utils.merge_objects(target[index], source_value)
                else:
                    target.append(source[index])
        elif source:
            target = source
        return target

    @staticmethod
    def remove_empty_properties(data: Optional[Union[list, dict]]) -> None:
        if isinstance(data, dict):
            for key in list(data.keys()):
                if (value := data[key]) in [None, ""]:
                    del data[key]
                else:
                    Utils.remove_empty_properties(value)
        elif isinstance(data, list):
            for item in data:
                Utils.remove_empty_properties(item)

    @staticmethod
    def to_integer(value: str, fallback: Optional[Any] = None) -> Optional[int]:
        try:
            return int(value)
        except Exception:
            return fallback

    @staticmethod
    def get_type_name(file_or_other_string: str) -> str:
        name = os.path.basename(file_or_other_string or "").replace(" ", "")
        return to_camel_case(name[0:dot] if (dot := name.rfind(".")) > 0 else name)

    @contextmanager
    def temporary_file(name: Optional[str] = None, suffix: Optional[str] = None,
                       content: Optional[Union[str, List[str]]] = None) -> str:
        with Utils.temporary_directory() as tmp_directory_name:
            tmp_file_name = os.path.join(tmp_directory_name, name or tempfile.mktemp(dir="")) + (suffix or "")
            try:
                with open(tmp_file_name, "w") as tmp_file:
                    if isinstance(content, str):
                        tmp_file.write(content)
                    elif isinstance(content, list):
                        [tmp_file.write(line + "\n") for line in content]
                yield tmp_file_name
            finally:
                pass  # Utils.temporary_directory handles cleanup.

    @staticmethod
    @contextmanager
    def temporary_directory() -> str:
        try:
            with tempfile.TemporaryDirectory() as tmp_directory_name:
                yield tmp_directory_name
        finally:
            Utils.remove_temporary_directory(tmp_directory_name)

    @staticmethod
    def is_temporary_directory(path: str) -> bool:
        try:
            tmpdir = tempfile.gettempdir()
            return os.path.commonpath([path, tmpdir]) == tmpdir and os.path.exists(path) and os.path.isdir(path)
        except Exception:
            return False

    @staticmethod
    def remove_temporary_directory(tmp_directory_name: str) -> None:
        if Utils.is_temporary_directory(tmp_directory_name):  # Guard against errant deletion.
            shutil.rmtree(tmp_directory_name)


class UnpackUtils:

    @staticmethod
    def is_packed_file(file: str) -> bool:
        return UnpackUtils.get_unpack_context_manager(file) is not None

    @staticmethod
    def get_unpack_context_manager(file: str) -> Optional[Callable]:
        UNPACK_CONTEXT_MANAGERS = {
            ".gz": UnpackUtils.unpack_gz_file_to_temporary_directory,
            ".tar": UnpackUtils.unpack_tar_file_to_temporary_directory,
            ".tar.gz": UnpackUtils.unpack_targz_file_to_temporary_directory,
            ".tgz": UnpackUtils.unpack_targz_file_to_temporary_directory,
            ".zip": UnpackUtils.unpack_zip_file_to_temporary_directory
        }
        dot = file.rfind(".")
        return UNPACK_CONTEXT_MANAGERS.get(file[dot:]) if dot > 0 else None

    @contextmanager
    @staticmethod
    def unpack_zip_file_to_temporary_directory(file: str) -> str:
        with Utils.temporary_directory() as tmp_directory_name:
            with zipfile.ZipFile(file, "r") as zipf:
                zipf.extractall(tmp_directory_name)
            yield tmp_directory_name

    @contextmanager
    @staticmethod
    def unpack_tar_file_to_temporary_directory(file: str) -> str:
        with Utils.temporary_directory() as tmp_directory_name:
            with tarfile.open(file, "r") as tarf:
                tarf.extractall(tmp_directory_name)
            yield tmp_directory_name

    @contextmanager
    @staticmethod
    def unpack_targz_file_to_temporary_directory(file: str) -> str:
        with Utils.temporary_directory() as tmp_directory_name:
            with tarfile.open(file, "r:gz") as targzf:
                targzf.extractall(tmp_directory_name)
            yield tmp_directory_name

    @contextmanager
    @staticmethod
    def unpack_gz_file_to_temporary_directory(file: str) -> str:
        with Utils.temporary_directory() as tmp_directory_name:
            gunzip_tmp_file = os.path.join(tmp_directory_name, file.replace(".gz", ""))
            with gzip.open(file, "rb") as gunzipf_input:
                with open(gunzip_tmp_file, "wb") as gunzipf_output:
                    gunzipf_output.write(gunzipf_input.read())
            yield tmp_directory_name

    @staticmethod
    def unpack_files(file: str) -> Optional[str]:
        if (unpack_file_to_tmp_directory := UnpackUtils.get_unpack_context_manager(file)) is not None:
            with unpack_file_to_tmp_directory(file) as tmp_directory_name:
                for directory, _, files in os.walk(tmp_directory_name):
                    for file in files:
                        if any(file.endswith(suffix) for suffix in ACCEPTABLE_FILE_SUFFIXES):
                            yield os.path.join(directory, file)
