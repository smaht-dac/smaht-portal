import abc
import copy
from contextlib import contextmanager
import csv
from functools import lru_cache
import gzip
import json
from jsonschema import Draft7Validator as JsonSchemaValidator
import openpyxl
import os
import re
import shutil
import sys
import tarfile
import tempfile
from typing import Any, Callable, Generator, Iterator, List, Optional, Tuple, Type, Union
from webtest.app import TestApp
import zipfile
from dcicutils.ff_utils import get_metadata, get_schema
from dcicutils.misc_utils import merge_objects, remove_empty_properties, split_string, to_camel_case, VirtualApp
from snovault.loadxl import create_testapp

# Classes/functions to parse a CSV or Excel Spreadsheet into structured data, using a specialized
# syntax to allow structured object properties to be referenced by column specifiers. This syntax
# uses an (intuitive) dot notation to reference nested objects, and a (less intuitive) notation
# utilizing the "#" character to reference array elements. May also further coerce data types by
# consulting an optionally specified JSON schema.
#
# Alternate and semantically equivalent implementation of dcicutils.{sheet,bundle}_utils.
# Spare time exercise, with benefit of sheet_utils implementation experience.

ACCEPTABLE_FILE_SUFFIXES = [".csv", ".json", ".xls", ".xlsx", ".gz", ".tar", ".tar.gz", ".tgz", ".zip"]
ARRAY_VALUE_DELIMITER_CHAR = "|"
ARRAY_VALUE_DELIMITER_ESCAPE_CHAR = "\\"
ARRAY_NAME_SUFFIX_CHAR = "#"
ARRAY_NAME_SUFFIX_REGEX = re.compile(rf"{ARRAY_NAME_SUFFIX_CHAR}\d+")
DOTTED_NAME_DELIMITER_CHAR = "."

# Forward type references for type hints.
Excel = Type["Excel"]
Portal = Type["Portal"]
PortalAny = Union[VirtualApp, TestApp, Portal]
RowReader = Type["RowReader"]
Schema = Type["Schema"]
StructuredDataSet = Type["StructuredDataSet"]


class StructuredDataSet:

    def __init__(self, file: Optional[str] = None, data: Optional[List[dict]] = None,
                 portal: Optional[PortalAny] = None, schemas: Optional[List[dict]] = None,
                 order: Optional[List[str]] = None, prune: bool = True) -> None:
        self.data = {} if not data else data
        self._portal = Portal.create(portal, data=self.data, schemas=schemas)  # If None then no schemas nor refs.
        self._order = order
        self._prune = prune
        self.load_file(file)

    @staticmethod
    def load(file: str, portal: Optional[PortalAny] = None, schemas: Optional[List[dict]] = None,
             order: Optional[List[str]] = None) -> StructuredDataSet:
        return StructuredDataSet(file=file, portal=portal, schemas=schemas, order=order)

    def load_file(self, file: str) -> None:
        # Returns a dictionary where each property is the name (i.e. the type) of the data,
        # and the value is array of dictionaries for the data itself. Handle these kinds of files:
        # 1.  Single CSV of JSON file, where the (base) name of the file is the data type name.
        # 2.  Single Excel file containing one or more sheets, where each sheet
        #     represents (i.e. is named for, and contains data for) a different type.
        # 3.  Zip file (.zip or .tar.gz or .tgz or .tar), containing data files to load, where the
        #     base name of each contained file is the data type name; or any of above gzipped (.gz).
        if file:
            if file.endswith(".gz") or file.endswith(".tgz"):
                with UnpackUtils.unpack_gz_file_to_temporary_file(file) as file:
                    return self._load_file(file)
            return self._load_file(file)

    def _load_file(self, file: str) -> None:
        if file.endswith(".csv"):
            self.load_csv_file(file)
        elif file.endswith(".xls") or file.endswith(".xlsx"):
            self.load_excel_file(file)
        elif file.endswith(".json"):
            self.load_json_file(file)
        elif file.endswith(".tar") or file.endswith(".zip"):
            self.load_packed_file(file)

    def load_csv_file(self, file: str) -> None:
        StructuredData.load_from_csv_file(file, portal=self._portal,
                                          addto=lambda data: self.add(Utils.get_type_name(file), data))

    def load_excel_file(self, file: str) -> None:
        excel = Excel(file)  # Order the sheet names by any specified ordering (e.g. ala snovault.loadxl).
        order = {Utils.get_type_name(key): index for index, key in enumerate(self._order)} if self._order else {}
        for sheet_name in sorted(excel.sheet_names, key=lambda key: order.get(Utils.get_type_name(key), sys.maxsize)):
            StructuredData.load_from_excel_sheet(excel, sheet_name, portal=self._portal,
                                                 addto=lambda data: self.add(Utils.get_type_name(sheet_name), data))

    def load_json_file(self, file: str) -> None:
        self.add(Utils.get_type_name(file), StructuredData.load_from_json_file(file))

    def load_packed_file(self, file: str) -> None:
        for file in UnpackUtils.unpack_files(file):
            self.load_file(file)

    def add(self, type_name: str, data: Union[dict, List[dict], StructuredDataSet]) -> None:
        if isinstance(data, dict):
            data = [data]
        if self._prune:
            remove_empty_properties(data)
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
                           schema: Optional[Schema] = None, portal: Optional[Portal] = None,
                           addto: Optional[Callable] = None) -> Optional[List[dict]]:
        return StructuredData._load_from_reader(CsvReader(file), schema=schema or file, portal=portal, addto=addto)

    def load_from_excel_sheet(excel: Excel, sheet_name: str,
                              schema: Optional[Schema] = None, portal: Optional[Portal] = None,
                              addto: Optional[Callable] = None) -> Optional[List[dict]]:
        reader = excel.sheet_reader(sheet_name)
        return StructuredData._load_from_reader(reader, schema=schema or reader.sheet_name, portal=portal, addto=addto)

    @staticmethod
    def load_from_rows(rows: List[List[Optional[Any]]], schema: Optional[Schema] = None) -> Optional[List[dict]]:
        return StructuredData._load_from_reader(ListReader(rows), schema=schema)

    @staticmethod
    def _load_from_reader(reader: RowReader, schema: Optional[Union[Schema, str]] = None,
                          portal: Optional[Portal] = None, addto: Optional[Callable] = None) -> Optional[List[dict]]:
        structured_data = [] if not addto else None
        structured_column_data = _StructuredColumnData(reader.header)
        for row in reader:
            if isinstance(schema, str):  # Allow by name just so we do not fetch the schema if no rows.
                schema = Schema.load_by_name(schema, portal=portal)
            structured_row = structured_column_data.create_row()
            for flat_column_name, value in row.items():
                structured_column_data.set_value(structured_row, flat_column_name, value, schema, reader.location)
            structured_data.append(structured_row) if not addto else addto(structured_row)
        return structured_data if not addto else None

    @staticmethod
    def load_from_json_file(file: str) -> List[dict]:
        with open(file) as f:
            data = json.load(f)
            return [data] if isinstance(data, dict) else data


class _StructuredColumnData:

    def __init__(self, flat_column_names: List[str]) -> None:
        self._row_template = self._parse_column_headers_into_structured_row_template(flat_column_names)

    def create_row(self) -> dict:
        return copy.deepcopy(self._row_template)

    @staticmethod
    def set_value(row: dict, flat_column_name: str, value: str, schema: Optional[Schema], loc: int) -> None:

        def setv(row: Union[dict, list], flat_column_name_components: List[str], parent_array_index: int = -1) -> None:

            if not flat_column_name_components:
                return
            if isinstance(row, list):
                if parent_array_index < 0:
                    for row_item in row:
                        setv(row_item, flat_column_name_components)
                else:
                    setv(row[parent_array_index], flat_column_name_components)
                return
            if not isinstance(row, dict):
                return

            flat_column_name_component = flat_column_name_components[0]
            array_name, array_index = _StructuredColumnData._get_array_info(flat_column_name_component)
            name = array_name if array_name else flat_column_name_component
            if len(flat_column_name_components) > 1:
                if not isinstance(row[name], dict) and not isinstance(row[name], list):
                    row[name] = {}
                setv(row[name], flat_column_name_components[1:], parent_array_index=array_index)
                return

            nonlocal flat_column_name, value, schema, loc
            if schema:
                value = schema.map_value(value, flat_column_name, loc)
            if array_name is not None and isinstance(value, str):
                value = Utils.split_array_string(value)
            if array_name and array_index >= 0:
                if isinstance(row[name], str):  # An array afterall e.g.: abc,abc#2
                    row[name] = Utils.split_array_string(row[name])
                if len(row[name]) < array_index + 1:
                    row[name].extend([None] * (array_index + 1 - len(row[name])))
                row[name] = row[name][:array_index] + value + row[name][array_index + 1:]
            else:
                row[name] = value

        setv(row, Utils.split_dotted_string(flat_column_name))

    @staticmethod
    def _parse_column_headers_into_structured_row_template(flat_column_names: List[str]) -> dict:

        def parse_components(flat_column_name_components: List[str]) -> dict:
            value = parse_components(flat_column_name_components[1:]) if len(flat_column_name_components) > 1 else None
            flat_column_name_component = flat_column_name_components[0]
            array_name, array_index = _StructuredColumnData._get_array_info(flat_column_name_component)
            if array_name:
                array_length = array_index + 1 if array_index >= 0 else (0 if value is None else 1)
                # Doing it the obvious way, like in the comment right below here, we get
                # identical (shared) values; which we do not want; so do a real/deep copy.
                # return {array_name: [value] * array_length}
                return {array_name: [copy.deepcopy(value) for _ in range(array_length)]}
            return {flat_column_name_component: value}

        structured_row_template = {}
        for flat_column_name in flat_column_names or []:
            if (flat_column_name_components := Utils.split_dotted_string(flat_column_name)):
                merge_objects(structured_row_template, parse_components(flat_column_name_components))
        return structured_row_template

    @staticmethod
    def _get_array_info(name: str) -> Tuple[Optional[str], Optional[int]]:
        if (array_indicator_position := name.rfind(ARRAY_NAME_SUFFIX_CHAR)) > 0:
            array_index = name[array_indicator_position + 1:] if array_indicator_position < len(name) - 1 else -1
            if (array_index := Utils.to_integer(array_index)) is not None:
                return name[0:array_indicator_position], array_index
        return None, None


class Schema:

    def __init__(self, schema_json: dict, portal: Optional[Portal] = None) -> None:
        self.data = schema_json
        self.name = Utils.get_type_name(schema_json.get("title", "")) if schema_json else ""
        self._portal = portal  # Needed only to resolve linkTo references.
        self._flat_type_info = self._compute_flat_schema_type_info(schema_json)

    @staticmethod
    def load_by_name(name: str, portal: Portal) -> Optional[dict]:
        return Schema(portal.get_schema(Utils.get_type_name(name)), portal) if portal else None

    @staticmethod
    def load_from_file(file: str, portal: Optional[Portal] = None) -> Optional[dict]:
        with open(file) as f:
            return Schema(json.load(f), portal)

    def validate(self, data: dict) -> Optional[List[str]]:
        errors = []
        validator = JsonSchemaValidator(self.data, format_checker=JsonSchemaValidator.FORMAT_CHECKER)
        for error in validator.iter_errors(data):
            errors.append(error.message)
        return errors if errors else None

    def map_value(self, value: str, flat_column_name: str, loc: int) -> Optional[Any]:
        flat_column_name = self._normalize_flat_column_name(flat_column_name)
        if (map_value := self._flat_type_info.get(flat_column_name, {}).get("map")) is None:
            map_value = self._flat_type_info.get(flat_column_name + ARRAY_NAME_SUFFIX_CHAR, {}).get("map")
        src = f"{self.name}{f'.{flat_column_name}' if flat_column_name else ''}{f' [{loc}]' if loc else ''}"
        return map_value(value, src) if map_value else value
        
    def _map_function(self, type_info: dict) -> Optional[Callable]:
        MAP_FUNCTIONS = {
            "array": self._map_function_array,
            "boolean": self._map_function_boolean,
            "enum": self._map_function_enum,
            "integer": self._map_function_integer,
            "number": self._map_function_number,
            "string": self._map_function_string
        }
        if isinstance(type_info, dict) and (type_info_type := type_info.get("type")) is not None:
            if isinstance(type_info_type, list):
                # The type specifier can actually be a list of acceptable types; for
                # example smaht-portal/schemas/mixins.json/meta_workflow_input#.value;
                # we will take the first one for which we have a mapping function.
                # TODO: Maybe more correct to get all map function and map to any for values.
                for acceptable_type in type_info_type:
                    if (map_function := MAP_FUNCTIONS.get(acceptable_type)) is not None:
                        break
            elif not isinstance(type_info_type, str):
                raise Exception(f"Invalid type specifier type ({type(type_info_type).__name__}) in JSON schema.")
            elif isinstance(type_info.get("enum"), list):
                map_function = self._map_function_enum
            elif isinstance(type_info.get("linkTo"), str):
                map_function = self._map_function_ref
            else:
                map_function = MAP_FUNCTIONS.get(type_info_type)
            return map_function(type_info) if map_function else None
        return None

    def _map_function_array(self, type_info: dict) -> Callable:
        def map_value_array(value: str, array_type_map_function: Optional[Callable], src: Optional[str]) -> Any:
            value = Utils.split_array_string(value)
            return [array_type_map_function(value, src) for value in value] if array_type_map_function else value
        return lambda value, src: map_value_array(value, self._map_function(type_info), src)

    def _map_function_boolean(self, type_info: dict) -> Callable:
        def map_value_boolean(value: str, src: Optional[str]) -> Any:
            if isinstance(value, str) and (value := value.strip().lower()):
                if (lower_value := value.lower()) in ["true", "t"]:
                    return True
                elif lower_value in ["false", "f"]:
                    return False
            return value
        return map_value_boolean

    def _map_function_enum(self, type_info: dict) -> Callable:
        def map_value_enum(value: str, enum_specifiers: dict, src: Optional[str]) -> Any:
            if isinstance(value, str) and (value := value.strip()):
                if (enum_value := enum_specifiers.get(lower_value := value.lower())) is not None:
                    return enum_value
                matches = []
                for enum_canonical, _ in enum_specifiers.items():
                    if enum_canonical.startswith(lower_value):
                        matches.append(enum_canonical)
                if len(matches) == 1:
                    return enum_specifiers[matches[0]]
            return value
        enum_specifiers = {str(enum).lower(): enum for enum in type_info.get("enum", [])}
        return lambda value, src: map_value_enum(value, enum_specifiers, src)

    def _map_function_integer(self, type_info: dict) -> Callable:
        def map_value_integer(value: str, src: Optional[str]) -> Any:
            return Utils.to_integer(value, value)
        return map_value_integer

    def _map_function_number(self, type_info: dict) -> Callable:
        def map_value_number(value: str, src: Optional[str]) -> Any:
            try:
                return float(value)
            except Exception:
                return value
        return map_value_number

    def _map_function_string(self, type_info: dict) -> Callable:
        def map_value_string(value: str, src: Optional[str]) -> str:
            return value if value is not None else ""
        return map_value_string

    def _map_function_ref(self, type_info: dict) -> Callable:
        def map_value_ref(value: str, link_to: str, portal: Optional[Portal], src: Optional[str]) -> Any:
            nonlocal self, type_info
            exception = None
            if not value and (column := type_info.get("column")) and column in self.data.get("required", []):
                exception = f"No required reference (linkTo) value for: {link_to}"
            elif link_to and portal and not portal.ref_exists(link_to, value):
                exception = f"Cannot resolve reference (linkTo) for: {link_to}"
            if exception:
                raise Exception(exception + f"{f'/{value}' if value else ''}{f' from {src}' if src else ''}")
            return value
        return lambda value, src: map_value_ref(value, type_info.get("linkTo"), self._portal, src)

    def _compute_flat_schema_type_info(self, schema_json: dict, parent_key: Optional[str] = None) -> dict:
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
                }
              },
              "stu": { "type": "array", "items": { "type": "string" } },
              "vw": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "xyz": { "type": "integer" }
                  }
                }
              } } }

        Then we will return this flat dictionary:

          { "abc.def":     { "type": "string", "map": <map_value_string> },
            "abc.ghi.mno": { "type": "number", "map": <map_value_number> },
            "stu#":        { "type": "string", "map": <map_value_string> },
            "vw#.xyz":     { "type": "integer", "map": <map_value_integer> } }
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
                continue  # Should not happen; every property within properties should be an object; no harm; ignore.
            key = property_key if parent_key is None else f"{parent_key}{DOTTED_NAME_DELIMITER_CHAR}{property_key}"
            if ARRAY_NAME_SUFFIX_CHAR in property_key:
                raise Exception(f"Property name with \"{ARRAY_NAME_SUFFIX_CHAR}\" in JSON schema NOT supported: {key}")
            if (property_value_type := property_value.get("type")) == "object" and "properties" in property_value:
                result.update(self._compute_flat_schema_type_info(property_value, parent_key=key))
                continue
            if property_value_type == "array":
                key += ARRAY_NAME_SUFFIX_CHAR
                if not isinstance(array_property_items := property_value.get("items"), dict):
                    if array_property_items is None:
                        raise Exception(f"Array of undefined type in JSON schema NOT supported: {key}")
                    if isinstance(array_property_items, list):
                        raise Exception(f"Array of multiple types in JSON schema NOT supported: {key}")
                    raise Exception(f"Invalid array type specifier in JSON schema: {key}")
                result.update(self._compute_flat_schema_type_info(array_property_items, parent_key=key))
                continue
            result[key] = {"type": property_value_type, "map": self._map_function({**property_value, "column": key})}
        return result

    @staticmethod
    def _normalize_flat_column_name(flat_column_name: str) -> str:
        """
        Given a string representing a flat column name, i.e possibly dot-separated name components,
        and where each component possibly ends with an array suffix (i.e. pound sign - #) followed by
        an integer, removes the integer part for each such array component; also ensures that
        any extraneous spaces which might be surrounding each component are removed.
        For example given "abc#12. def .ghi#3" returns "abc#.def.ghi#".
        """
        flat_column_name_components = Utils.split_dotted_string(flat_column_name)
        for i in range(len(flat_column_name_components)):
            flat_column_name_components[i] = ARRAY_NAME_SUFFIX_REGEX.sub(ARRAY_NAME_SUFFIX_CHAR,
                                                                         flat_column_name_components[i])
        return DOTTED_NAME_DELIMITER_CHAR.join(flat_column_name_components)


class RowReader(abc.ABC):  # These readers may evenutally go into dcicutils.

    def __init__(self):
        self.header = None
        self.location = 0
        self._warning_empty_headers = False
        self._warning_extra_values = []  # Line numbers.
        self.open()

    def __iter__(self) -> Iterator:
        for row in self.rows:
            self.location += 1
            if self.is_terminating_row(row):
                break
            if len(self.header) < len(row): # Row values beyond what there are headers for are ignored.
                self._warning_extra_values.append(self.location)
            yield {column: self.cell_value(value) for column, value in zip(self.header, row)}

    def define_header(self, header: List[Optional[Any]]) -> None:
        self.header = []
        for index, column in enumerate(header or []):
            if not (column := str(column).strip() if column is not None else ""):
                self._warning_empty_headers = True
                break  # Empty header column signals end of header.
            self.header.append(column)

    def rows(self) -> Generator[Union[List[Optional[Any]], Tuple[Optional[Any], ...]], None, None]:
        yield

    def is_terminating_row(self, row: Union[List[Optional[Any]], Tuple[Optional[Any]]]) -> bool:
        return False

    def cell_value(self, value: Optional[Any]) -> Optional[Any]:
        return str(value).strip() if value is not None else ""

    def open(self) -> None:
        pass

    @property
    def warnings(self) -> Optional[list]:
        warnings = []
        if self._warning_empty_headers:
            warnings.append("Empty header column encountered; ignore it and all following it.")
        if self._warning_extra_values:
            warnings.extend([f"Extra column values on row: {row_number}" for row_number in self._warning_extra_values])
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
        self._rows = None
        super().__init__()

    @property
    def rows(self) -> Generator[List[Optional[Any]], None, None]:
        for row in self._rows:
            yield row

    def open(self) -> None:
        if self._file_handle is None:
            self._file_handle = open(self._file)
            self._rows = csv.reader(self._file_handle)
            self.define_header(next(self._rows, []))

    def __del__(self) -> None:
        if (file_handle := self._file_handle) is not None:
            self._file_handle = None
            file_handle.close()


class ExcelSheetReader(RowReader):

    def __init__(self, sheet_name: str, workbook: openpyxl.workbook.workbook.Workbook) -> None:
        self.sheet_name = sheet_name or "Sheet1"
        self._workbook = workbook
        self._rows = None
        super().__init__()

    @property
    def rows(self) -> Generator[Tuple[Optional[Any], ...], None, None]:
        for row in self._rows(min_row=2, values_only=True):
            yield ExcelSheetReader._trim(row)

    def is_terminating_row(self, row: Tuple[Optional[Any]]) -> bool:
        return all(cell is None for cell in row)  # Empty row signals end of data.

    def open(self) -> None:
        if not self._rows:
            self._rows = self._workbook[self.sheet_name].iter_rows
            self.define_header(ExcelSheetReader._trim(next(self._rows(min_row=1, max_row=1, values_only=True), [])))

    @staticmethod
    def _trim(row: Tuple[Any]) -> Tuple[Any]:  # Returns given tuple with trailing None values removed.
        i = len(row) - 1
        while i >= 0 and row[i] is None:
            i -= 1
        return row[:i + 1]


class Excel:

    def __init__(self, file: str) -> None:
        self._file = file
        self._workbook = None
        self._sheet_names = None
        self.open()

    @property
    def sheet_names(self) -> List[str]:
        return self._sheet_names

    def sheet_reader(self, sheet_name: str) -> ExcelSheetReader:
        return ExcelSheetReader(sheet_name=sheet_name, workbook=self._workbook)

    def open(self) -> None:
        if self._workbook is None:
            self._workbook = openpyxl.load_workbook(self._file, data_only=True)
            self._sheet_names = self._workbook.sheetnames or []

    def __del__(self) -> None:
        if (workbook := self._workbook) is not None:
            self._workbook = None
            workbook.close()


class Portal:

    def __init__(self, portal: PortalAny, data: Optional[dict] = None, schemas: Optional[List[dict]] = None) -> None:
        self.vapp = portal.vapp if isinstance(portal, Portal) else portal
        self._data = data  # Data set being loaded (e.g. by StructuredDataSet).
        self._schemas = schemas  # Explicitly specified known schemas.

    @lru_cache(maxsize=256)
    def get_schema(self, schema_name: str) -> Optional[dict]:
        return (next((schema for schema in self._schemas or []
                     if Utils.get_type_name(schema.get("title")) == Utils.get_type_name(schema_name)), None) or
                get_schema(schema_name, portal_vapp=self.vapp))

    @lru_cache(maxsize=256)
    def get_metadata(self, object_name: str) -> Optional[dict]:
        try:
            return get_metadata(object_name, vapp=self.vapp)
        except Exception:
            return None

    def ref_exists(self, type_name: str, value: str) -> bool:
        if self._data and (items := self._data.get(type_name)) and (schema := self.get_schema(type_name)):
            id_properties = set(schema.get("identifyingProperties", [])) | {"identifier", "uuid"}
            for item in items:
                for id_property in id_properties:
                    if (id_value := item.get(id_property)) is not None:
                        if isinstance(id_value, list) and value in id_value or id_value == value:
                            return True
        return self.get_metadata(f"/{type_name}/{value}") is not None

    @staticmethod
    def create(portal: Optional[PortalAny] = None,
               data: Optional[dict] = None, schemas: Optional[List[dict]] = None) -> Optional[Portal]:
        if isinstance(portal, Portal):
            if data is not None:
                portal._data = data
            return portal
        return Portal(portal, data=data, schemas=schemas) if portal else None

    @staticmethod
    def create_for_testing(ini_file: Optional[str] = None, schemas: Optional[List[dict]] = None) -> Portal:
        if isinstance(ini_file, str):
            return Portal(create_testapp(ini_file), schemas=schemas)
        minimal_ini_for_unit_testing = "[app:app]\nuse = egg:encoded\nsqlalchemy.url = postgresql://dummy\n"
        with Utils.temporary_file(content=minimal_ini_for_unit_testing, suffix=".ini") as ini_file:
            return Portal(create_testapp(ini_file), schemas=schemas)


class UnpackUtils:  # Some of these may eventually go into dcicutils.

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

    @staticmethod
    def unpack_files(file: str) -> Optional[str]:
        unpack_file_to_tmp_directory = {
            ".tar": UnpackUtils.unpack_tar_file_to_temporary_directory,
            ".zip": UnpackUtils.unpack_zip_file_to_temporary_directory
        }.get(file[dot:]) if (dot := file.rfind(".")) > 0 else None
        if unpack_file_to_tmp_directory is not None:
            with unpack_file_to_tmp_directory(file) as tmp_directory_name:
                for directory, _, files in os.walk(tmp_directory_name):  # Ignore "." prefixed files.
                    for file in [file for file in files if not file.startswith(".")]:
                        if any(file.endswith(suffix) for suffix in ACCEPTABLE_FILE_SUFFIXES):
                            yield os.path.join(directory, file)

    @contextmanager
    @staticmethod
    def unpack_gz_file_to_temporary_file(file: str, suffix: Optional[str] = None) -> str:
        if (gz := file.endswith(".gz")) or file.endswith(".tgz"):  # The .tgz suffix is simply short for .tar.gz.
            with Utils.temporary_file(name=os.path.basename(file[:-3] if gz else file[:-4] + ".tar")) as tmp_file_name:
                with open(tmp_file_name, "wb") as outputf:
                    with gzip.open(file, "rb") as inputf:
                        outputf.write(inputf.read())
                        outputf.close()
                        yield tmp_file_name


class Utils:  # Some of these may eventually go into dcicutils.

    @staticmethod
    def split_dotted_string(value: str) -> List[str]:
        return split_string(value, DOTTED_NAME_DELIMITER_CHAR)

    @staticmethod
    def split_array_string(value: str) -> List[str]:
        return split_string(value, ARRAY_VALUE_DELIMITER_CHAR, ARRAY_VALUE_DELIMITER_ESCAPE_CHAR)

    @staticmethod
    def to_integer(value: str, fallback: Optional[Any] = None) -> Optional[int]:
        try:
            return int(value)
        except Exception:
            return fallback

    @staticmethod
    def get_type_name(value: str) -> str:  # File or other name.
        name = os.path.basename(value).replace(" ", "") if isinstance(value, str) else ""
        return to_camel_case(name[0:dot] if (dot := name.rfind(".")) > 0 else name)

    @contextmanager
    def temporary_file(name: Optional[str] = None, suffix: Optional[str] = None,
                       content: Optional[Union[str, List[str]]] = None) -> str:
        with Utils.temporary_directory() as tmp_directory_name:
            tmp_file_name = os.path.join(tmp_directory_name, name or tempfile.mktemp(dir="")) + (suffix or "")
            with open(tmp_file_name, "w") as tmp_file:
                tmp_file.write("\n".join(content) if isinstance(content, list) else str(content))
            yield tmp_file_name

    @staticmethod
    @contextmanager
    def temporary_directory() -> str:
        try:
            with tempfile.TemporaryDirectory() as tmp_directory_name:
                yield tmp_directory_name
        finally:
            Utils.remove_temporary_directory(tmp_directory_name)

    @staticmethod
    def remove_temporary_directory(tmp_directory_name: str) -> None:
        def is_temporary_directory(path: str) -> bool:
            try:
                tmpdir = tempfile.gettempdir()
                return os.path.commonpath([path, tmpdir]) == tmpdir and os.path.exists(path) and os.path.isdir(path)
            except Exception:
                return False
        if is_temporary_directory(tmp_directory_name):  # Guard against errant deletion.
            shutil.rmtree(tmp_directory_name)
