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
from typing import Any, Callable, Generator, Iterator, List, Optional, Tuple, Type, Union
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
# Alternate and semantically equivalent implementation of dcicutils.{sheet,bundle}_utils.
# Spare time exercise, with benefit of sheet_utils implementation experience.

ACCEPTABLE_FILE_SUFFIXES = [".csv", ".json", ".xls", ".xlsx", ".gz", ".tar", ".tar.gz", ".tgz", ".zip"]
ARRAY_VALUE_DELIMITER_CHAR = "|"
ARRAY_VALUE_DELIMITER_ESCAPE_CHAR = "\\"
ARRAY_NAME_SUFFIX_CHAR = "#"
ARRAY_NAME_SUFFIX_REGEX = re.compile(rf"{ARRAY_NAME_SUFFIX_CHAR}\d+")
DOTTED_NAME_DELIMITER_CHAR = "."
PRUNE_STRUCTURED_DATA_SET = True

# Forward type references for type hints.
Excel = Type["Excel"]
Portal = Type["Portal"]
RowReader = Type["RowReader"]
Schema = Type["Schema"]
StructuredDataSet = Type["StructuredDataSet"]


class StructuredDataSet:

    def __init__(self, file: Optional[str] = None,
                 portal: Optional[Union[VirtualApp, TestApp, Portal]] = None,
                 order: Optional[List[str]] = None, prune: bool = PRUNE_STRUCTURED_DATA_SET) -> None:
        self.data = {}
        self._portal = Portal.create(portal, loading_data_set=self.data)
        self._order = order
        self._prune = prune
        self.load_file(file)

    @staticmethod
    def load(file: str, portal: Union[VirtualApp, TestApp, Portal],
             order: Optional[List[str]] = None) -> Tuple[dict, Optional[List[str]]]:
        structured_data_set = StructuredDataSet(file=file, portal=portal, order=order)
        return structured_data_set.data, structured_data_set.validate()

    def load_file(self, file: str) -> None:
        # Returns a dictionary where each property is the name (i.e. the type) of the data,
        # and the value is array of dictionaries for the data itself. Handle thse kinds of files:
        # 1.  Single CSV of JSON file, where the (base) name of the file is the data type name.
        # 2.  Single Excel file containing one or more sheets, where each sheet
        #     represents (i.e. is named for, and contains data for) a different type.
        # 3.  Zip file (.zip or .tar.gz or .tgz or .tar), containing data files to load,
        #     where the (base) name of each contained file is the data type name.
        if file:
            if file.endswith(".gz"):
                with UnpackUtils.unpack_gz_file_to_temporary_file(file) as file:
                    self._load_file(file)
            else:
                self._load_file(file)

    def _load_file(self, file: str) -> None:
        if file.endswith(".csv"):
            self.load_csv_file(file)
        elif file.endswith(".xls") or file.endswith(".xlsx"):
            self.load_excel_file(file)
        elif file.endswith(".json"):
            self.load_json_file(file)
        elif UnpackUtils.is_packed_file(file):
            self.load_packed_file(file)

    def load_csv_file(self, file: str) -> None:
        StructuredData.load_from_csv_file(file, portal=self._portal,
                                          addto=lambda data: self.add(Utils.get_type_name(file), data))

    def load_excel_file(self, file: str) -> None:

        def ordered_sheet_names(sheet_names: List[str]) -> List[str]:
            if not self._order:
                return sheet_names
            ordered_sheet_names = []
            for item in self._order:
                for sheet_name in sheet_names:
                    if Utils.get_type_name(item) == Utils.get_type_name(sheet_name):
                        ordered_sheet_names.append(sheet_name)
            for sheet_name in sheet_names:
                if sheet_name not in ordered_sheet_names:
                    ordered_sheet_names.append(sheet_name)
            return ordered_sheet_names

        excel = Excel(file)
        for sheet_name in ordered_sheet_names(excel.sheet_names):
            StructuredData.load_from_excel_sheet(excel, sheet_name, portal=self._portal,
                                                 addto=lambda data: self.add(Utils.get_type_name(sheet_name), data))

    def load_json_file(self, file: str) -> None:
        self.add(Utils.get_type_name(file), StructuredData.load_from_json_file(file))

    def load_packed_file(self, file: str) -> None:
        for file in UnpackUtils.unpack_files(file):
            self.load_file(file)

    def add(self, type_name: str, data: Union[dict, List[dict], StructuredDataSet]) -> None:
        if isinstance(data, StructuredDataSet):
            data = data.data
        elif isinstance(data, dict):
            data = [data]
        if self._prune:
            Utils.remove_empty_properties(data)
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
        if not schema and portal:
            schema = Schema.load_by_name(file, portal=portal)
        return StructuredData._load_from_reader(CsvReader(file), schema=schema, addto=addto)

    def load_from_excel_sheet(excel: Excel, sheet_name: str,
                              schema: Optional[Schema] = None, portal: Optional[Portal] = None,
                              addto: Optional[Callable] = None) -> Optional[List[dict]]:
        reader = excel.sheet_reader(sheet_name)
        if not schema and portal:
            schema = Schema.load_by_name(reader.sheet_name, portal=portal)
        return StructuredData._load_from_reader(reader, schema=schema, addto=addto)

    @staticmethod
    def load_from_rows(rows: List[List[Optional[Any]]], schema: Optional[Schema] = None) -> List[dict]:
        return StructuredData._load_from_reader(ListReader(rows), schema=schema)

    @staticmethod
    def _load_from_reader(reader: RowReader, schema: Optional[Schema] = None,
                          addto: Optional[Callable] = None) -> Optional[List[dict]]:
        structured_data = [] if not addto else None
        structured_column_data = StructuredColumnData(reader.header)
        for row in reader:
            structured_row = structured_column_data.create_row()
            for flattened_column_name, value in row.items():
                structured_column_data.set_value(structured_row, flattened_column_name, value, schema)
            structured_data.append(structured_row) if not addto else addto(structured_row)
        return structured_data if not addto else None

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
    def set_value(row: dict, flattened_column_name: str, value: str, schema: Optional[Schema] = None) -> None:

        def setv(row: Union[dict, list],
                 flattened_column_name_components: List[str], parent_array_index: int = -1) -> None:

            if not flattened_column_name_components:
                return

            if isinstance(row, list):
                if parent_array_index < 0:
                    for row_item in row:
                        setv(row_item, flattened_column_name_components)
                else:
                    setv(row[parent_array_index], flattened_column_name_components)
                return

            if not isinstance(row, dict):
                return

            flattened_column_name_component = flattened_column_name_components[0]
            array_name, array_index = StructuredColumnData._get_array_info(flattened_column_name_component)
            name = array_name if array_name else flattened_column_name_component
            if len(flattened_column_name_components) > 1:
                if not isinstance(row[name], dict) and not isinstance(row[name], list):
                    row[name] = {}
                setv(row[name], flattened_column_name_components[1:], parent_array_index=array_index)
                return

            nonlocal flattened_column_name, value, schema
            if schema:
                value = schema.map_value(flattened_column_name, value)
            elif array_name is not None and isinstance(value, str):
                value = Utils.split_array_string(value)
            if array_name and array_index >= 0:
                if isinstance(row[name], str):  # An array afterall e.g.: abc,abc#2
                    row[name] = Utils.split_array_string(row[name])
                if len(row[name]) < array_index + 1:
                    array_extension = [None] * (array_index + 1 - len(row[name]))
                    row[name].extend(array_extension)
                row[name] = row[name][:array_index] + value + row[name][array_index + 1:]
            else:
                row[name] = value

        if (flattened_column_name_components := Utils.split_dotted_string(flattened_column_name)):
            setv(row, flattened_column_name_components)

    @staticmethod
    def _parse_column_headers_into_structured_row_template(flattened_column_names: List[str]) -> dict:

        def parse_components(flattened_column_name_components: List[str]) -> dict:
            if len(flattened_column_name_components) > 1:
                value = parse_components(flattened_column_name_components[1:])
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
                Utils.merge_objects(structured_row_template, parse_components(flattened_column_name_components))
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
        self._portal = portal  # Needed only to resolve linkTo references.
        self._flattened_type_info = self._compute_flattened_schema_type_info(schema_json)

    @staticmethod
    def load_by_name(name: str, portal: Portal) -> Optional[dict]:
        return Schema(portal.get_schema(Utils.get_type_name(name)), portal) if portal else None

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
            errors.append(error.message)
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
            result[key] = {"type": property_value_type, "map": self._map_function({**property_value, "column": key})}
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

    def _map_function_number(self, type_info: dict) -> Callable:
        def map_value_number(value: str) -> Any:
            try:
                return float(value)
            except Exception:
                return value
        return map_value_number

    def _map_function_string(self, type_info: dict) -> Callable:
        def map_value_string(value: str) -> str:
            return value if value is not None else ""
        return map_value_string

    def _map_function_ref(self, type_info: dict) -> Callable:
        def map_value_ref(value: str, link_to: str, portal: Optional[Portal]) -> Any:
            if not value:
                nonlocal self, type_info
                if (column := type_info.get("column")) and column in self.data.get("required", []):
                    raise Exception(f"No required reference (linkTo) value for: {self._ref_info(link_to, value)}")
                return True
            if link_to and portal and not portal.ref_exists(link_to, value):
                raise Exception(f"Cannot resolve reference (linkTo) for: {self._ref_info(link_to, value)}")
            return value
        return lambda value: map_value_ref(value, type_info.get("linkTo"), self._portal)

    def _ref_info(self, link_to: str, value: str) -> str:
        link_from = Utils.get_type_name(self.data.get("title"))
        return f"{link_to}" + (f"/{value}" if value else "") + (f" (from {link_from})" if link_from else "")

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
                break  # Empty header column signals end of header.
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
            self._file_handle = open(self._file)
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
        return all(cell is None for cell in row)  # Empty row signals end of data.

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


class Portal:

    def __init__(self, portal: Union[VirtualApp, TestApp, Portal], loading_data_set: Optional[dict] = None) -> None:
        self.vapp = portal.vapp if isinstance(portal, Portal) else portal
        self.loading_data_set = loading_data_set

    @lru_cache(maxsize=256)
    def get_schema(self, schema_name: str) -> Optional[dict]:
        return get_schema(schema_name, portal_vapp=self.vapp)

    @lru_cache(maxsize=256)
    def get_metadata(self, object_name: str) -> Optional[dict]:
        try:
            return get_metadata(object_name, vapp=self.vapp)
        except Exception:
            return None

    def ref_exists(self, type_name: str, value: str) -> bool:
        return self._ref_exists_internally(type_name, value) or self.get_metadata(f"/{type_name}/{value}") is not None

    def _ref_exists_internally(self, type_name: str, value: str) -> bool:
        if self.loading_data_set and isinstance(items := self.loading_data_set.get(type_name), list):
            if (type_schema := self.get_schema(type_name)):
                identifying_properties = set(type_schema.get("identifyingProperties", [])) | {"identifier", "uuid"}
                for item in items:
                    for identifying_property in identifying_properties:
                        if (identifying_value := item.get(identifying_property)) is not None:
                            if isinstance(identifying_value, list):
                                if value in identifying_value:
                                    return True
                            elif identifying_value == value:
                                return True
        return False

    @staticmethod
    def create(portal: Optional[Union[VirtualApp, TestApp, Portal]] = None,
               loading_data_set: Optional[dict] = None) -> Optional[Portal]:
        if isinstance(portal, Portal):
            if loading_data_set:
                portal.loading_data_set = loading_data_set
            return portal
        return Portal(portal, loading_data_set=loading_data_set) if portal else None

    @staticmethod
    def create_for_unit_testing() -> Portal:
        minimal_ini_for_unit_testing = "[app:app]\nuse = egg:encoded\nsqlalchemy.url = postgresql://dummy\n"
        with Utils.temporary_file(content=minimal_ini_for_unit_testing, suffix=".ini") as ini_file:
            return Portal(create_testapp(ini_file))

    @staticmethod
    def create_for_local_testing(ini_file: Optional[str] = None) -> Portal:
        if isinstance(ini_file, str):
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


class UnpackUtils:

    @staticmethod
    def is_packed_file(file: str) -> bool:
        return UnpackUtils.get_unpack_context_manager(file) is not None

    @staticmethod
    def get_unpack_context_manager(file: str) -> Optional[Callable]:
        UNPACK_CONTEXT_MANAGERS = {
            ".tar": UnpackUtils.unpack_tar_file_to_temporary_directory,
            ".tar.gz": UnpackUtils.unpack_targz_file_to_temporary_directory,
            ".tgz": UnpackUtils.unpack_targz_file_to_temporary_directory,
            ".zip": UnpackUtils.unpack_zip_file_to_temporary_directory
        }
        return UNPACK_CONTEXT_MANAGERS.get(file[dot:]) if (dot := file.rfind(".")) > 0 else None

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

    @staticmethod
    def unpack_files(file: str) -> Optional[str]:
        if (unpack_file_to_tmp_directory := UnpackUtils.get_unpack_context_manager(file)) is not None:
            with unpack_file_to_tmp_directory(file) as tmp_directory_name:
                for directory, _, files in os.walk(tmp_directory_name):
                    for file in files:
                        if any(file.endswith(suffix) for suffix in ACCEPTABLE_FILE_SUFFIXES):
                            yield os.path.join(directory, file)

    @contextmanager
    @staticmethod
    def unpack_gz_file_to_temporary_file(file: str, suffix: Optional[str] = None) -> str:
        if file.endswith(".gz"):
            with Utils.temporary_file(name=os.path.basename(file[:-3])) as tmp_file_name:
                with open(tmp_file_name, "wb") as outputf:
                    with gzip.open(file, "rb") as inputf:
                        outputf.write(inputf.read())
                        outputf.close()
                        yield tmp_file_name


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
                if (value := data[key]) in [None, "", {}, []]:
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
        name = os.path.basename(file_or_other_string or "").replace(" ", "") if file_or_other_string else ""
        return to_camel_case(name[0:dot] if (dot := name.rfind(".")) > 0 else name)

    @contextmanager
    def temporary_file(name: Optional[str] = None, suffix: Optional[str] = None,
                       content: Optional[Union[str, List[str]]] = None) -> str:
        with Utils.temporary_directory() as tmp_directory_name:
            tmp_file_name = os.path.join(tmp_directory_name, name or tempfile.mktemp(dir="")) + (suffix or "")
            with open(tmp_file_name, "w") as tmp_file:
                if isinstance(content, list):
                    content = "\n".join(content)
                if isinstance(content, str):
                    tmp_file.write(content)
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
