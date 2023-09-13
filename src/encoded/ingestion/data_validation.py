import json
from typing import Optional
from dcicutils.ff_utils import get_schema
from dcicutils.misc_utils import VirtualApp
from dcicutils.task_utils import pmap
from snovault.loadxl import get_identifying_value


def validate_data_against_schemas(data: dict[str, list[dict]],
                                  portal_vapp: Optional[VirtualApp] = None,
                                  schemas: Optional[list[dict]] = None) -> Optional[dict]:
    """
    TODO: This is just until this schema validation is fully supported in sheet_utils.
    If there are any missing required properties or any extraneous properties then return a
    dictionary with an itemized description of each of these problems, otherwise return None.
    """

    def fetch_relevant_schemas(schema_names: list, portal_vapp: VirtualApp) -> list:
        def fetch_schema(schema_name: str) -> Optional[dict]:
            return schema_name, get_schema(schema_name, portal_vapp=portal_vapp)
        return {schema_name: schema for schema_name, schema in pmap(fetch_schema, schema_names)}

    if not schemas:
        if not portal_vapp:
            raise Exception("Must specify portal_vapp if no schemas specified.")
        try:
            schema_names = [data_type for data_type in data]
            schemas = fetch_relevant_schemas(schema_names, portal_vapp=portal_vapp)
        except Exception as e:
            errors.append(f"Exception: {str(e)}")

    problems = {}
    errors = []

    for data_type in data:
        schema = schemas.get(data_type)
        if not schema:
            errors.append(f"No schema found for: {data_type}")
            continue
        merge_problems(problems, validate_data_items_against_schemas(data[data_type], data_type, schema))
    if errors:
        problems["errors"] = errors
    return problems if problems else None


def validate_data_items_against_schemas(data_items: list[dict],
                                        data_type: str,
                                        schema: dict) -> Optional[dict]:
    """
    TODO: This is just until this schema validation is fully supported in sheet_utils.
    If there are any missing required properties or any extraneous properties then return a
    dictionary with an itemized description of each of these problems, otherwise return None.
    """
    problems = {}
    for data_item_index, data_item in enumerate(data_items):
        merge_problems(problems, validate_data_item_against_schemas(data_item, data_type, data_item_index, schema))
    return problems if problems else None


def validate_data_item_against_schemas(data_item: dict,
                                       data_type: str,
                                       data_item_index: Optional[int],
                                       schema: dict) -> Optional[dict]:
    """
    TODO: This is just until this schema validation is fully supported in sheet_utils.
    If there are any missing required properties or any extraneous properties then return a
    dictionary with an itemized description of each of these problems, otherwise return None.
    """

    problems = {}
    unidentified = []
    missing_properties = []
    extraneous_properties = []

    allowed_properties = schema.get("properties", {}).keys()
    required_properties = schema.get("required", [])
    identifying_properties = schema.get("identifyingProperties", [])

    identifying_value = get_identifying_value(data_item, identifying_properties)
    if not identifying_value:
        identifying_value = "<unidentified>"
        unidentified.append({
            "type": data_type,
            "item": identifying_value,
            "index": data_item_index,
            "identifying_properties": identifying_properties
        })
    missing = [required for required in required_properties if required not in data_item]
    if missing:
        missing_properties.append({
            "type": data_type,
            "item": identifying_value,
            "index": data_item_index,
            "missing_properties": missing
            })
    extraneous = [not_allowed for not_allowed in data_item if not_allowed not in allowed_properties]
    if extraneous:
        extraneous_properties.append({
            "type": data_type,
            "item": identifying_value,
            "index": data_item_index,
            "extraneous_properties": extraneous
        })

    if unidentified:
        problems["unidentified"] = unidentified
    if missing_properties:
        problems["missing"] = missing_properties
    if extraneous_properties:
        problems["extraneous"] = extraneous_properties
    return problems if problems else None


def merge_problems(problems: dict, additional_problems: dict):
    if additional_problems:
        if additional_problems.get("unidentified"):
            if not problems.get("unidentified"):
                problems["unidentified"] = []
            problems["unidentified"].extend(additional_problems["unidentified"])
        if additional_problems.get("missing"):
            if not problems.get("missing"):
                problems["missing"] = []
            problems["missing"].extend(additional_problems["missing"])
        if additional_problems.get("extraneous"):
            if not problems.get("extraneous"):
                problems["extraneous"] = []
            problems["extraneous"].extend(additional_problems["extraneous"])



data = {
  "file_format": [
    {
      "status": "shared",
      "foobar": 123,
      "description": "Tabix index file of vcf, compressed",
      "consortia": [
        "358aed10-9b9d-4e26-ab84-4bd162da182b"
      ],
      "submission_centers": [
        "9626d82e-8110-4213-ac75-0a50adf890ff"
      ],
      "valid_item_types": [
        "FileReference",
        "FileProcessed"
      ]
    },
    {
      "file_format": "txt",
      "adfadf": "txt",
      "standard_file_extension": "txt",
      "description": "This format is used for aligned reads",
      "status": "shared",
      "valid_item_types": [
        "FileProcessed",
        "FileReference"
      ],
      "consortia": [
        "358aed10-9b9d-4e26-ab84-4bd162da182b"
      ],
      "submission_centers": [
        "9626d82e-8110-4213-ac75-0a50adf890ff"
      ]
    },
    {
      "file_format": "vcf_gz",
      "consortia": [
        "358aed10-9b9d-4e26-ab84-4bd162da182b"
      ],
      "submission_centers": [
        "9626d82e-8110-4213-ac75-0a50adf890ff"
      ],
      "status": "shared",
      "description": "vcf, compressed",
      "other_allowed_extensions": [
        "vcf"
      ],
      "valid_item_types": [
        "FileSubmitted",
        "FileProcessed"
      ]
    }
  ],
  "file_submitted": [
    {
      "md5sum": "f820d51b0d8cedefc4cae95d11c3c50c",
      "status": "shared",
      "aliases": [
        "cypress-main:GAPFI9FZPWSX.fastq.gz"
      ],
      "filename": "GAPFI9FZPWSX.fastq.gz",
      "accession": "GAPFIDVOP17S",
      "file_size": 35766794213,
      "file_type": "reads",
      "paired_end": "1",
      "content_md5sum": "88f2fc895de6f47e99d637097427f34b",
      "file_classification": "raw file",
      "s3_lifecycle_status": "standard",
      "consortia": [
        "358aed10-9b9d-4e26-ab84-4bd162da182b"
      ],
      "submission_centers": [
        "9626d82e-8110-4213-ac75-0a50adf890ff"
      ]
    },
    {
      "md5sum": "762a7580d2858af4bd52febebe6bf425",
      "status": "shared",
      "aliases": [
        "cypress-main:GAPFIUCATWEO.fastq.gz"
      ],
      "filename": "GAPFIUCATWEO.fastq.gz",
      "accession": "GAPFIIFN66Z6",
      "file_size": 44503273316,
      "file_type": "reads",
      "paired_end": "2",
      "file_format": "vcf_gz_tbi",
      "adfadf": "vcf_gz_tbi",
      "content_md5sum": "f8a85522512cdcd2f8c22c3fd263356c",
      "file_classification": "raw file",
      "s3_lifecycle_status": "standard",
      "consortia": [
        "358aed10-9b9d-4e26-ab84-4bd162da182b"
      ],
      "submission_centers": [
        "9626d82e-8110-4213-ac75-0a50adf890ff"
      ]
    }
  ]
}

schemas = {
  "file_format": {
    "title": "File Format",
    "description": "Known file formats and information about them.",
    "$id": "/profiles/file_format.json",
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": [
      "file_format",
      "standard_file_extension"
    ],
    "identifyingProperties": [
      "uuid",
      "file_format"
    ],
    "additionalProperties": False,
    "mixinProperties": [
      {
        "$ref": "mixins.json#/schema_version"
      },
      {
        "$ref": "mixins.json#/uuid"
      },
      {
        "$ref": "mixins.json#/aliases"
      },
      {
        "$ref": "mixins.json#/submitted"
      },
      {
        "$ref": "mixins.json#/modified"
      },
      {
        "$ref": "mixins.json#/static_embeds"
      },
      {
        "$ref": "mixins.json#/status"
      },
      {
        "$ref": "mixins.json#/tags"
      }
    ],
    "properties": {
      "tags": {
        "title": "Tags",
        "description": "Key words that can tag an item - useful for filtering.",
        "type": "array",
        "lookup": 1000,
        "uniqueItems": True,
        "ff_flag": "clear clone",
        "items": {
          "title": "Tag",
          "description": "A tag for the item.",
          "type": "string",
          "minLength": 1,
          "maxLength": 50,
          "pattern": "^[a-zA-Z0-9_\\-][a-zA-Z0-9_\\-\\s]+[a-zA-Z0-9_\\-]$"
        }
      },
      "status": {
        "title": "Status",
        "type": "string",
        "default": "in review",
        "permission": "restricted_fields",
        "enum": [
          "shared",
          "obsolete",
          "current",
          "inactive",
          "in review",
          "deleted"
        ]
      },
      "static_headers": {
        "title": "Static Headers",
        "description": "Array of linkTos for static sections to be displayed at the top of an item page",
        "type": "array",
        "uniqueItems": True,
        "permission": "restricted_fields",
        "items": {
          "title": "Static Header",
          "description": "Static section displayed at the top of an item page",
          "type": "string",
          "linkTo": "UserContent"
        }
      },
      "static_content": {
        "title": "Static Content",
        "description": "Array of objects containing linkTo UserContent and 'position' to be placed on Item view(s).",
        "type": "array",
        "uniqueItems": True,
        "permission": "restricted_fields",
        "items": {
          "title": "Static Content Definition",
          "description": "Link to UserContent Item plus location.",
          "type": "object",
          "required": [
            "location",
            "content"
          ],
          "properties": {
            "content": {
              "type": "string",
              "linkTo": "UserContent",
              "title": "Link to Content",
              "description": "A UserContent Item."
            },
            "location": {
              "type": "string",
              "title": "Location of Content",
              "description": "Where this content should be displayed. Item schemas could potentially define an enum to contrain values.",
              "default": "header"
            },
            "description": {
              "type": "string",
              "title": "Description",
              "description": "Description or note about this content. Might be displayed as a footnote or caption, if applicable for view."
            }
          }
        }
      },
      "last_modified": {
        "title": "Last Modified",
        "exclude_from": [
          "FFedit-create"
        ],
        "type": "object",
        "additionalProperties": False,
        "lookup": 1000,
        "properties": {
          "date_modified": {
            "title": "Date Modified",
            "description": "Do not submit, value is assigned by the server. The date the object is modified.",
            "type": "string",
            "anyOf": [
              {
                "format": "date-time"
              },
              {
                "format": "date"
              }
            ],
            "permission": "restricted_fields"
          },
          "modified_by": {
            "title": "Modified By",
            "description": "Do not submit, value is assigned by the server. The user that modfied the object.",
            "type": "string",
            "linkTo": "User",
            "permission": "restricted_fields"
          }
        }
      },
      "date_created": {
        "rdfs:subPropertyOf": "dc:created",
        "title": "Date Created",
        "lookup": 1000,
        "exclude_from": [
          "FFedit-create"
        ],
        "type": "string",
        "anyOf": [
          {
            "format": "date-time"
          },
          {
            "format": "date"
          }
        ],
        "serverDefault": "now",
        "permission": "restricted_fields"
      },
      "submitted_by": {
        "rdfs:subPropertyOf": "dc:creator",
        "title": "Submitted By",
        "exclude_from": [
          "FFedit-create"
        ],
        "type": "string",
        "linkTo": "User",
        "lookup": 1000,
        "serverDefault": "userid",
        "permission": "restricted_fields"
      },
      "aliases": {
        "title": "Aliases",
        "description": "Institution-specific ID (e.g. bgm:cohort-1234-a).",
        "type": "array",
        "comment": "Colon separated lab name and lab identifier, no slash. (e.g. dcic-lab:42).",
        "lookup": 1,
        "uniqueItems": True,
        "ff_flag": "clear clone",
        "items": {
          "uniqueKey": "alias",
          "title": "ID Alias",
          "description": "Institution-specific ID (e.g. bgm:cohort-1234-a).",
          "type": "string",
          "pattern": "^[^\\s\\\\\\/]+:[^\\s\\\\\\/]+$"
        }
      },
      "uuid": {
        "title": "UUID",
        "type": "string",
        "format": "uuid",
        "exclude_from": [
          "FFedit-create"
        ],
        "serverDefault": "uuid4",
        "permission": "restricted_fields",
        "requestMethod": "POST"
      },
      "schema_version": {
        "title": "Schema Version",
        "internal_comment": "Do not submit, value is assigned by the server. The version of the JSON schema that the server uses to validate the object. Schema version indicates generation of schema used to save version to to enable upgrade steps to work. Individual schemas should set the default.",
        "type": "string",
        "exclude_from": [
          "FFedit-create"
        ],
        "pattern": "^\\d+(\\.\\d+)*$",
        "requestMethod": [],
        "default": "1"
      },
      "file_format": {
        "title": "File Format",
        "type": "string",
        "permission": "restricted_fields",
        "uniqueKey": True,
        "description": "Format or extension of this File."
      },
      "standard_file_extension": {
        "title": "Standard File Extension",
        "description": "The standard extension that is added to 4DN files for download.",
        "type": "string",
        "permission": "restricted_fields"
      },
      "other_allowed_extensions": {
        "title": "Allowed Extensions",
        "description": "Additional allowable extensions for uploading filenames of this format",
        "type": "array",
        "permission": "restricted_fields",
        "items": {
          "title": "OK Extension",
          "type": "string"
        }
      },
      "description": {
        "title": "File Format Description",
        "type": "string"
      },
      "extrafile_formats": {
        "title": "Extrafile Formats",
        "type": "array",
        "permission": "restricted_fields",
        "items": {
          "title": "Format",
          "description": "A file format for an extrafile of the file",
          "type": "string",
          "linkTo": "FileFormat"
        }
      },
      "file_format_specification": {
        "title": "File format specification",
        "description": "Text or pdf file that further explains the file format",
        "type": "object",
        "lookup": 1,
        "additionalProperties": False,
        "formInput": "file",
        "attachment": True,
        "ff_flag": "clear clone",
        "properties": {
          "download": {
            "title": "File Name",
            "description": "File Name of the attachment.",
            "type": "string"
          },
          "href": {
            "internal_comment": "Internal webapp URL for document file",
            "title": "href",
            "description": "Path to download the file attached to this Item.",
            "type": "string"
          },
          "type": {
            "title": "Media Type",
            "type": "string",
            "enum": [
              "application/msword",
              "application/pdf",
              "text/plain"
            ]
          },
          "md5sum": {
            "title": "MD5 Checksum",
            "description": "Use this to ensure that your file was downloaded without errors or corruption.",
            "type": "string",
            "format": "md5sum"
          },
          "size": {
            "title": "File size",
            "description": "Size of the file on disk",
            "type": "integer"
          },
          "blob_id": {
            "title": "Blob ID",
            "type": "string",
            "internal_comment": "blob storage ID. Use to like with s3/rds"
          }
        }
      },
      "valid_item_types": {
        "title": "Valid Item Types",
        "description": "Types of items that can utilize this file format",
        "type": "array",
        "permission": "restricted_fields",
        "items": {
          "title": "Item Type",
          "description": "Item class name (e.g. FileFastq)",
          "type": "string",
          "enum": [
            "FileSubmitted",
            "FileProcessed",
            "FileReference"
          ]
        }
      },
      "submission_centers": {
        "type": "array",
        "items": {
          "type": "string",
          "linkTo": "SubmissionCenter"
        },
        "serverDefault": "user_submission_centers"
      },
      "consortia": {
        "type": "array",
        "items": {
          "type": "string",
          "linkTo": "Consortium"
        },
        "serverDefault": "user_consortia"
      },
      "@id": {
        "title": "ID",
        "type": "string",
        "calculatedProperty": True
      },
      "@type": {
        "title": "Type",
        "type": "array",
        "items": {
          "type": "string"
        },
        "calculatedProperty": True
      },
      "principals_allowed": {
        "title": "principals_allowed",
        "description": "Calculated permissions used for ES filtering",
        "type": "object",
        "properties": {
          "view": {
            "type": "string"
          },
          "edit": {
            "type": "string"
          }
        },
        "calculatedProperty": True
      },
      "display_title": {
        "title": "Display Title",
        "description": "A calculated title for every object",
        "type": "string",
        "calculatedProperty": True
      }
    },
    "facets": {
      "valid_item_types": {
        "title": "Valid item types",
        "disabled": True
      }
    },
    "@type": [
      "JSONSchema"
    ],
    "rdfs:seeAlso": "/terms/FileFormat",
    "children": [],
    "rdfs:subClassOf": "/profiles/SMAHTItem.json",
    "isAbstract": False
  },
  "file_submitted": {
    "title": "Submitted file",
    "description": "File submitted to ENCODED",
    "$id": "/profiles/file_submitted.json",
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": [
      "file_format"
    ],
    "identifyingProperties": [
      "uuid",
      "accession",
      "aliases"
    ],
    "additionalProperties": False,
    "mixinProperties": [
      {
        "$ref": "mixins.json#/schema_version"
      },
      {
        "$ref": "mixins.json#/uuid"
      },
      {
        "$ref": "mixins.json#/submitted"
      },
      {
        "$ref": "mixins.json#/modified"
      },
      {
        "$ref": "mixins.json#/aliases"
      },
      {
        "$ref": "mixins.json#/accession"
      },
      {
        "$ref": "mixins.json#/dbxrefs"
      },
      {
        "$ref": "mixins.json#/tags"
      },
      {
        "$ref": "mixins.json#/static_embeds"
      },
      {
        "$ref": "file.json#/properties"
      }
    ],
    "mixinFacets": [
      {
        "$ref": "file.json#/facets"
      }
    ],
    "mixinColumns": [
      {
        "$ref": "file.json#/columns"
      }
    ],
    "properties": {
      "accession": {
        "accessionType": "FI",
        "title": "Accession",
        "description": "A unique identifier to be used to reference the object.",
        "internal_comment": "Only admins are allowed to set or update this value.",
        "exclude_from": [
          "FFedit-create"
        ],
        "type": "string",
        "format": "accession",
        "permission": "restricted_fields",
        "serverDefault": "accession"
      },
      "description": {
        "title": "Description",
        "description": "A plain text description of the file.",
        "type": "string",
        "lookup": 10,
        "formInput": "textarea"
      },
      "filename": {
        "title": "File Name",
        "description": "The local file name used at time of submission. Must be alphanumeric, with the exception of the following special characters: '+=,.@-_'",
        "s3Upload": True,
        "ff_flag": "second round",
        "type": "string",
        "pattern": "^[\\w+=,.@-]*$",
        "comment": "ultimately uploaded filename will be uuid/accession, but filename with no directory will be store in metadata as passed in"
      },
      "file_format": {
        "title": "File Format",
        "type": "string",
        "linkTo": "FileFormat",
        "lookup": 20,
        "ff_flag": "filter:valid_item_types"
      },
      "file_type": {
        "title": "File Type",
        "description": "The type of file based on the information in the file.",
        "type": "string",
        "lookup": 22
      },
      "file_version": {
        "title": "File Version",
        "description": "The version of file based on how it was originally generated.",
        "type": "string"
      },
      "file_version_date": {
        "title": "File Version",
        "description": "The date of the version of file based on when it was originally generated. Accepted formats: YYYYMMDD, YYYY-MM-DD, YYYY-MM-DD-HH:MM:SS",
        "type": "string",
        "anyOf": [
          {
            "format": "date-time"
          },
          {
            "format": "date"
          }
        ]
      },
      "file_classification": {
        "title": "General Classification",
        "description": "General classification group for the File (raw, processed, ancillary (eg. index files))",
        "internal_comment": "This will control how, when and where a file can be displayed - on pages (eg. ancillary files like index files will show up in workflow_run but not experiment)",
        "type": "string",
        "lookup": 23,
        "enum": [
          "raw file",
          "processed file",
          "ancillary file",
          "other file",
          "visualization"
        ]
      },
      "md5sum": {
        "title": "MD5sum",
        "description": "The md5sum of the file being transferred.",
        "comment": "This can vary for files of same content gzipped at different times",
        "type": "string",
        "exclude_from": [
          "FFedit-create"
        ],
        "ff_flag": "clear edit",
        "format": "hex"
      },
      "content_md5sum": {
        "title": "Content MD5sum",
        "description": "The MD5sum of the uncompressed file.",
        "comment": "This is only relavant for gzipped files.",
        "type": "string",
        "exclude_from": [
          "FFedit-create"
        ],
        "format": "hex",
        "uniqueKey": "file:content_md5sum"
      },
      "file_size": {
        "title": "File Size",
        "exclude_from": [
          "FFedit-create"
        ],
        "description": "Size of file on disk.",
        "comment": "File size is specified in bytes - presumably this can be a calculated property as well",
        "type": "integer"
      },
      "extra_files": {
        "title": "Extra Files",
        "description": "Links to extra files on s3 that don't have associated metadata",
        "type": "array",
        "exclude_from": [
          "FFedit-create"
        ],
        "items": {
          "title": "Extra File",
          "type": "object",
          "required": [
            "file_format"
          ],
          "additionalProperties": True,
          "properties": {
            "filename": {
              "title": "File Name",
              "type": "string"
            },
            "file_format": {
              "title": "File Format",
              "type": "string",
              "linkTo": "FileFormat",
              "lookup": 400
            },
            "href": {
              "title": "Download URL",
              "type": "string",
              "exclude_from": [
                "FFedit-create"
              ]
            },
            "md5sum": {
              "title": "MD5sum",
              "description": "The md5sum of the extra file.",
              "type": "string",
              "exclude_from": [
                "FFedit-create"
              ],
              "ff_flag": "clear edit",
              "format": "hex"
            },
            "file_size": {
              "title": "File Size",
              "exclude_from": [
                "FFedit-create"
              ],
              "description": "Size of file of the extra file.",
              "comment": "File size is specified in bytes",
              "type": "integer"
            },
            "status": {
              "title": "Status",
              "type": "string",
              "default": "uploading",
              "enum": [
                "uploading",
                "uploaded",
                "upload failed",
                "to be uploaded by workflow",
                "current",
                "shared",
                "replaced",
                "in review",
                "obsolete",
                "inactive",
                "archived",
                "deleted"
              ]
            }
          }
        }
      },
      "related_files": {
        "title": "Related Files",
        "description": "Files related to this one",
        "ff_flag": "second round",
        "type": "array",
        "items": {
          "title": "Related File",
          "type": "object",
          "required": [
            "relationship_type",
            "file"
          ],
          "additionalProperties": False,
          "properties": {
            "relationship_type": {
              "type": "string",
              "lookup": 31,
              "description": "A controlled term specifying the relationship between files.",
              "title": "Relationship Type",
              "enum": [
                "supercedes",
                "is superceded by",
                "derived from",
                "parent of",
                "paired with"
              ]
            },
            "file": {
              "type": "string",
              "lookup": 32,
              "description": "The related file",
              "linkTo": "File"
            }
          }
        }
      },
      "restricted": {
        "title": "Is Restricted File",
        "exclude_from": [
          "FFedit-create"
        ],
        "description": "A flag to indicate whether this file is subject to restricted access",
        "type": "boolean"
      },
      "s3_lifecycle_category": {
        "title": "S3 Lifecycle Category",
        "description": "The lifecycle category determines how long a file remains in a certain storage class.  If set to ignore, lifecycle management will have no effect on this file",
        "type": "string",
        "suggested_enum": [
          "short_term_access_long_term_archive",
          "long_term_access_long_term_archive",
          "long_term_access",
          "short_term_access",
          "long_term_archive",
          "short_term_archive",
          "no_storage",
          "ignore"
        ]
      },
      "s3_lifecycle_status": {
        "title": "S3 Lifecycle Status",
        "description": "Current S3 storage class of this object.",
        "internal_comment": "Files in Standard and Infrequent Access are accessible without restriction. Files in Glacier and Deep Archive need to be requested and cannot be downloaded",
        "type": "string",
        "default": "standard",
        "enum": [
          "standard",
          "infrequent access",
          "glacier",
          "deep archive",
          "deleted"
        ]
      },
      "s3_lifecycle_last_checked": {
        "title": "S3 Lifecycle - last checked",
        "description": "Date when the lifecycle status of the file was last checked",
        "type": "string",
        "anyOf": [
          {
            "format": "date-time"
          },
          {
            "format": "date"
          }
        ]
      },
      "status": {
        "title": "Status",
        "type": "string",
        "default": "uploading",
        "permission": "restricted_fields",
        "enum": [
          "uploading",
          "uploaded",
          "upload failed",
          "to be uploaded by workflow",
          "current",
          "shared",
          "replaced",
          "in review",
          "obsolete",
          "inactive",
          "archived",
          "deleted"
        ]
      },
      "quality_metric": {
        "notes": "This could be a single Quality Metric or a 'container' Quality Metric item that contains a list of QualityMetrics in its 'qc_list' property.",
        "type": "string",
        "title": "Quality Metric",
        "description": "The associated QC reports",
        "exclude_from": [
          "FFedit-create"
        ],
        "linkTo": "QualityMetric"
      },
      "quality_metrics": {
        "type": "array",
        "title": "Quality Metrics",
        "description": "Associated QC reports",
        "items": {
          "type": "string",
          "title": "Quality Metric",
          "description": "Associated QC report",
          "linkTo": "QualityMetric"
        }
      },
      "quality_metric_summary": {
        "type": "array",
        "title": "Quality Metric Summary",
        "description": "Selected Quality Metrics for Summary",
        "items": {
          "title": "Selected Quality Metric",
          "type": "object",
          "required": [
            "title",
            "value",
            "numberType"
          ],
          "additionalProperties": False,
          "properties": {
            "title": {
              "type": "string",
              "description": "Title of the Quality Metric",
              "title": "Title of the Quality Metric"
            },
            "value": {
              "type": "string",
              "title": "Value of the Quality Metric",
              "description": "value of the quality metric as a string"
            },
            "tooltip": {
              "type": "string",
              "title": "Tooltip for the Quality Metric",
              "description": "tooltip for the quality metric to be displayed upon mouseover"
            },
            "numberType": {
              "type": "string",
              "title": "Type of the Quality Metric",
              "description": "type of the quality metric",
              "enum": [
                "string",
                "integer",
                "float",
                "percent"
              ]
            }
          }
        }
      },
      "genome_assembly": {
        "title": "Genome Assembly",
        "description": "The genome assembly associated with the file",
        "type": "string",
        "enum": [
          "hg19",
          "GRCh37",
          "GRCh38"
        ]
      },
      "paired_end": {
        "title": "Paired End Identifier",
        "description": "Which pair the file belongs to (if paired end library)",
        "type": "string",
        "enum": [
          "1",
          "2"
        ]
      },
      "variant_type": {
        "title": "Variant Type",
        "description": "The variant type associated with this file",
        "comment": "Property included in meta_workflow.workflows.custom_pf_fields. Any changes here should also be made there.",
        "type": "string",
        "enum": [
          "SNV",
          "SV",
          "CNV"
        ]
      },
      "override_lab_name": {
        "description": "The lab that did the experiment if not the attributed Lab from whence this file",
        "type": "string",
        "permission": "restricted_fields",
        "comment": "value will be used to populate the calculated property value of the same name w/o underscore (in this case in track_and_facet_info calcprop)"
      },
      "override_experiment_type": {
        "description": "The type of experiment to which this file is associated",
        "type": "string",
        "permission": "restricted_fields",
        "comment": "value will be used to populate the calculated property value of the same name w/o underscore (in this case in track_and_facet_info calcprop)"
      },
      "override_biosource_name": {
        "description": "The name of the cell line or tissue sample for this track",
        "type": "string",
        "permission": "restricted_fields",
        "comment": "value will be used to populate the calculated property value of the same name w/o underscore (in this case in track_and_facet_info calcprop)"
      },
      "override_assay_info": {
        "description": "Information that helps distinguish the assay eg. ChIP-seq target or repliseq phase",
        "type": "string",
        "permission": "restricted_fields",
        "comment": "value will be used to populate the calculated property value of the same name w/o underscore (in this case in track_and_facet_info calcprop)"
      },
      "override_replicate_info": {
        "description": "Information on which replicate this file belongs",
        "type": "string",
        "permission": "restricted_fields",
        "comment": "value will be used to populate the calculated property value of the same name w/o underscore (in this case in track_and_facet_info calcprop)"
      },
      "override_experiment_bucket": {
        "description": "Where does a file sit in an experiment or set",
        "type": "string",
        "permission": "restricted_fields",
        "comment": "value will be used to populate the calculated property value of the same name w/o underscore (in this case in track_and_facet_info calcprop)"
      },
      "override_dataset": {
        "description": "What dataset does the file belong to",
        "type": "string",
        "permission": "restricted_fields",
        "comment": "value will be used to populate the calculated property value of the same name w/o underscore (in this case in track_and_facet_info calcprop)"
      },
      "override_condition": {
        "description": "What condition distinguishes the members of a dataset",
        "type": "string",
        "permission": "restricted_fields",
        "comment": "value will be used to populate the calculated property value of the same name w/o underscore (in this case in track_and_facet_info calcprop)"
      },
      "static_headers": {
        "title": "Static Headers",
        "description": "Array of linkTos for static sections to be displayed at the top of an item page",
        "type": "array",
        "uniqueItems": True,
        "permission": "restricted_fields",
        "items": {
          "title": "Static Header",
          "description": "Static section displayed at the top of an item page",
          "type": "string",
          "linkTo": "UserContent"
        }
      },
      "static_content": {
        "title": "Static Content",
        "description": "Array of objects containing linkTo UserContent and 'position' to be placed on Item view(s).",
        "type": "array",
        "uniqueItems": True,
        "permission": "restricted_fields",
        "items": {
          "title": "Static Content Definition",
          "description": "Link to UserContent Item plus location.",
          "type": "object",
          "required": [
            "location",
            "content"
          ],
          "properties": {
            "content": {
              "type": "string",
              "linkTo": "UserContent",
              "title": "Link to Content",
              "description": "A UserContent Item."
            },
            "location": {
              "type": "string",
              "title": "Location of Content",
              "description": "Where this content should be displayed. Item schemas could potentially define an enum to contrain values.",
              "default": "header"
            },
            "description": {
              "type": "string",
              "title": "Description",
              "description": "Description or note about this content. Might be displayed as a footnote or caption, if applicable for view."
            }
          }
        }
      },
      "tags": {
        "title": "Tags",
        "description": "Key words that can tag an item - useful for filtering.",
        "type": "array",
        "lookup": 1000,
        "uniqueItems": True,
        "ff_flag": "clear clone",
        "items": {
          "title": "Tag",
          "description": "A tag for the item.",
          "type": "string",
          "minLength": 1,
          "maxLength": 50,
          "pattern": "^[a-zA-Z0-9_\\-][a-zA-Z0-9_\\-\\s]+[a-zA-Z0-9_\\-]$"
        }
      },
      "dbxrefs": {
        "@type": "@id",
        "rdfs:subPropertyOf": "rdfs:seeAlso",
        "title": "External identifiers",
        "comment": "Enter as a database name:identifier eg. HGNC:PARK2",
        "description": "Unique identifiers from external resources.",
        "type": "array",
        "ff_flag": "clear clone",
        "uniqueItems": True,
        "items": {
          "title": "External identifier",
          "description": "A unique identifier from external resource.",
          "type": "string"
        }
      },
      "alternate_accessions": {
        "title": "Alternate Accessions",
        "description": "Accessions previously assigned to objects that have been merged with this object.",
        "type": "array",
        "lookup": 1000,
        "internal_comment": "Only admins are allowed to set or update this value.",
        "items": {
          "title": "Alternate Accession",
          "description": "An accession previously assigned to an object that has been merged with this object.",
          "type": "string",
          "permission": "restricted_fields",
          "format": "accession"
        }
      },
      "aliases": {
        "title": "Aliases",
        "description": "Institution-specific ID (e.g. bgm:cohort-1234-a).",
        "type": "array",
        "comment": "Colon separated lab name and lab identifier, no slash. (e.g. dcic-lab:42).",
        "lookup": 1,
        "uniqueItems": True,
        "ff_flag": "clear clone",
        "items": {
          "uniqueKey": "alias",
          "title": "ID Alias",
          "description": "Institution-specific ID (e.g. bgm:cohort-1234-a).",
          "type": "string",
          "pattern": "^[^\\s\\\\\\/]+:[^\\s\\\\\\/]+$"
        }
      },
      "last_modified": {
        "title": "Last Modified",
        "exclude_from": [
          "FFedit-create"
        ],
        "type": "object",
        "additionalProperties": False,
        "lookup": 1000,
        "properties": {
          "date_modified": {
            "title": "Date Modified",
            "description": "Do not submit, value is assigned by the server. The date the object is modified.",
            "type": "string",
            "anyOf": [
              {
                "format": "date-time"
              },
              {
                "format": "date"
              }
            ],
            "permission": "restricted_fields"
          },
          "modified_by": {
            "title": "Modified By",
            "description": "Do not submit, value is assigned by the server. The user that modfied the object.",
            "type": "string",
            "linkTo": "User",
            "permission": "restricted_fields"
          }
        }
      },
      "date_created": {
        "rdfs:subPropertyOf": "dc:created",
        "title": "Date Created",
        "lookup": 1000,
        "exclude_from": [
          "FFedit-create"
        ],
        "type": "string",
        "anyOf": [
          {
            "format": "date-time"
          },
          {
            "format": "date"
          }
        ],
        "serverDefault": "now",
        "permission": "restricted_fields"
      },
      "submitted_by": {
        "rdfs:subPropertyOf": "dc:creator",
        "title": "Submitted By",
        "exclude_from": [
          "FFedit-create"
        ],
        "type": "string",
        "linkTo": "User",
        "lookup": 1000,
        "serverDefault": "userid",
        "permission": "restricted_fields"
      },
      "uuid": {
        "title": "UUID",
        "type": "string",
        "format": "uuid",
        "exclude_from": [
          "FFedit-create"
        ],
        "serverDefault": "uuid4",
        "permission": "restricted_fields",
        "requestMethod": "POST"
      },
      "schema_version": {
        "title": "Schema Version",
        "internal_comment": "Do not submit, value is assigned by the server. The version of the JSON schema that the server uses to validate the object. Schema version indicates generation of schema used to save version to to enable upgrade steps to work. Individual schemas should set the default.",
        "type": "string",
        "exclude_from": [
          "FFedit-create"
        ],
        "pattern": "^\\d+(\\.\\d+)*$",
        "requestMethod": [],
        "default": "1"
      },
      "submission_centers": {
        "type": "array",
        "items": {
          "type": "string",
          "linkTo": "SubmissionCenter"
        },
        "serverDefault": "user_submission_centers"
      },
      "consortia": {
        "type": "array",
        "items": {
          "type": "string",
          "linkTo": "Consortium"
        },
        "serverDefault": "user_consortia"
      },
      "@id": {
        "title": "ID",
        "type": "string",
        "calculatedProperty": True
      },
      "@type": {
        "title": "Type",
        "type": "array",
        "items": {
          "type": "string"
        },
        "calculatedProperty": True
      },
      "principals_allowed": {
        "title": "principals_allowed",
        "description": "Calculated permissions used for ES filtering",
        "type": "object",
        "properties": {
          "view": {
            "type": "string"
          },
          "edit": {
            "type": "string"
          }
        },
        "calculatedProperty": True
      },
      "display_title": {
        "title": "Display Title",
        "description": "A calculated title for every object",
        "type": "string",
        "calculatedProperty": True
      }
    },
    "facets": {
      "file_type": {
        "title": "File Type",
        "descripton": "Type or categorization of this file."
      },
      "file_format.file_format": {
        "title": "File Format",
        "description": "Format of the file, i.e. the file extension."
      },
      "file_size": {
        "title": "File Size",
        "description": "Filter using range of size of the file",
        "aggregation_type": "stats",
        "increments": [
          1024,
          10240,
          1048576,
          10485760,
          104857600,
          1073741824,
          10737418240,
          107374182400
        ],
        "disabled": False,
        "comment": "disabled flag may be removed once we (a) can handle ?field=val1-to-val2 (ranges) in filters and (b) send ranges from FacetList to search URI."
      },
      "date_created": {
        "title": "Date Created",
        "aggregation_type": "date_histogram",
        "disabled": True,
        "comment": "disabled flag may be removed after we can handle ranges in URI filters."
      }
    },
    "columns": {
      "file_type": {
        "title": "File Type"
      },
      "file_format.file_format": {
        "title": "File Format"
      },
      "file_size": {
        "title": "File Size",
        "default_hidden": False
      },
      "date_created": {
        "default_hidden": True
      },
      "last_modified.date_modified": {
        "default_hidden": True
      }
    },
    "@type": [
      "JSONSchema"
    ],
    "rdfs:seeAlso": "/terms/FileSubmitted",
    "children": [],
    "rdfs:subClassOf": "/profiles/File.json",
    "isAbstract": False
  }
}

#problems = validate_data_against_schemas(data, schemas=schemas)
#print(json.dumps(problems, indent=4))
