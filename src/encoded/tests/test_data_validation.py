import pytest
from encoded.ingestion.data_validation import validate_data_against_schemas


schemas = {
  "file_format": {
    "title": "File Format",
    "description": "Data format for a file",
    "$id": "/profiles/file_format.json",
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": [
      "identifier",
      "standard_file_extension"
    ],
    "anyOf": [
      {
        "required": [
          "submission_centers"
        ]
      },
      {
        "required": [
          "consortia"
        ]
      }
    ],
    "identifyingProperties": [
      "accession",
      "aliases",
      "identifier",
      "uuid"
    ],
    "additionalProperties": False,
    "mixinProperties": [
      {
        "$ref": "mixins.json#/accession"
      },
      {
        "$ref": "mixins.json#/aliases"
      },
      {
        "$ref": "mixins.json#/attribution"
      },
      {
        "$ref": "mixins.json#/description"
      },
      {
        "$ref": "mixins.json#/identifier"
      },
      {
        "$ref": "mixins.json#/modified"
      },
      {
        "$ref": "mixins.json#/schema_version"
      },
      {
        "$ref": "mixins.json#/status"
      },
      {
        "$ref": "mixins.json#/submitted"
      },
      {
        "$ref": "mixins.json#/tags"
      },
      {
        "$ref": "mixins.json#/uuid"
      }
    ],
    "properties": {
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
      "tags": {
        "title": "Tags",
        "description": "Key words that can tag an item - useful for filtering.",
        "type": "array",
        "uniqueItems": True,
        "ff_flag": "clear clone",
        "items": {
          "title": "Tag",
          "description": "A tag for the item.",
          "type": "string",
          "minLength": 1,
          "maxLength": 50,
          "pattern": "^[a-zA-Z0-9_-]$"
        }
      },
      "date_created": {
        "rdfs:subPropertyOf": "dc:created",
        "title": "Date Created",
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
        "serverDefault": "userid",
        "permission": "restricted_fields"
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
      "last_modified": {
        "title": "Last Modified",
        "exclude_from": [
          "FFedit-create"
        ],
        "type": "object",
        "additionalProperties": False,
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
      "identifier": {
        "title": "Identifier",
        "description": "Unique, identifying name for the item",
        "type": "string",
        "uniqueKey": True,
        "pattern": "^[A-Za-z0-9-_]+$",
        "permission": "restricted_fields"
      },
      "description": {
        "title": "Description",
        "description": "Plain text description of the item",
        "type": "string",
        "formInput": "textarea"
      },
      "submission_centers": {
        "title": "Submission Centers",
        "description": "Submission Centers associated with this item.",
        "type": "array",
        "uniqueItems": True,
        "items": {
          "type": "string",
          "linkTo": "SubmissionCenter"
        },
        "serverDefault": "user_submission_centers"
      },
      "consortia": {
        "title": "Consortia",
        "description": "Consortia associated with this item.",
        "type": "array",
        "uniqueItems": True,
        "items": {
          "type": "string",
          "linkTo": "Consortium"
        },
        "serverDefault": "user_consortia"
      },
      "aliases": {
        "title": "Aliases",
        "description": "Institution-specific ID (e.g. bgm:cohort-1234-a).",
        "type": "array",
        "comment": "Colon separated lab name and lab identifier, no slash. (e.g. dcic-lab:42).",
        "uniqueItems": True,
        "ff_flag": "clear clone",
        "permission": "restricted_fields",
        "items": {
          "uniqueKey": "alias",
          "title": "ID Alias",
          "description": "Institution-specific ID (e.g. bgm:cohort-1234-a).",
          "type": "string",
          "pattern": "^[^\\s\\\\\\/]+:[^\\s\\\\\\/]+$"
        }
      },
      "accession": {
        "title": "Accession",
        "description": "A unique identifier to be used to reference the object.",
        "internal_comment": "Only admins are allowed to set or update this value.",
        "exclude_from": [
          "FFedit-create"
        ],
        "type": "string",
        "format": "accession",
        "permission": "restricted_fields",
        "serverDefault": "accession",
        "accessionType": "FF"
      },
      "alternate_accessions": {
        "title": "Alternate Accessions",
        "description": "Accessions previously assigned to objects that have been merged with this object.",
        "type": "array",
        "internal_comment": "Only admins are allowed to set or update this value.",
        "items": {
          "title": "Alternate Accession",
          "description": "An accession previously assigned to an object that has been merged with this object.",
          "type": "string",
          "permission": "restricted_fields",
          "format": "accession"
        }
      },
      "standard_file_extension": {
        "description": "Standard extension added to files for download",
        "permission": "restricted_fields",
        "title": "Standard File Extension",
        "type": "string"
      },
      "other_allowed_extensions": {
        "description": "Additional allowable extensions for uploading files of this format",
        "items": {
          "title": "OK Extension",
          "type": "string"
        },
        "minItems": 1,
        "permission": "restricted_fields",
        "title": "Allowed Extensions",
        "type": "array",
        "uniqueItems": True
      },
      "extra_file_formats": {
        "items": {
          "description": "A file format for an extra file",
          "linkTo": "FileFormat",
          "title": "Format",
          "type": "string"
        },
        "minItems": 1,
        "permission": "restricted_fields",
        "title": "Extra File Formats",
        "type": "array",
        "uniqueItems": True
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
    "@type": [
      "JSONSchema"
    ],
    "rdfs:seeAlso": "/terms/FileFormat",
    "children": [],
    "rdfs:subClassOf": "/profiles/SMAHTItem.json",
    "isAbstract": False
  }
}


def test_validate_data_against_schemas_okay():
    data = {
      "file_format": [
        {
          "status": "shared",
          "description": "Tabix index file of vcf, compressed",
          "identifier": "vcf_gz_tbi",
          "consortia": [
            "358aed10-9b9d-4e26-ab84-4bd162da182b"
          ],
          "submission_centers": [
            "9626d82e-8110-4213-ac75-0a50adf890ff"
          ],
          "standard_file_extension": "vcf.gz.tbi"
        },
        {
          "identifier": "txt",
          "standard_file_extension": "txt",
          "description": "This format is used for aligned reads",
          "status": "shared",
          "consortia": [
            "358aed10-9b9d-4e26-ab84-4bd162da182b"
          ],
          "submission_centers": [
            "9626d82e-8110-4213-ac75-0a50adf890ff"
          ]
        },
        {
          "identifier": "vcf_gz",
          "consortia": [
            "358aed10-9b9d-4e26-ab84-4bd162da182b"
          ],
          "submission_centers": [
            "9626d82e-8110-4213-ac75-0a50adf890ff"
          ],
          "status": "shared",
          "description": "vcf, compressed",
          "standard_file_extension": "vcf.gz",
          "other_allowed_extensions": [
            "vcf"
          ]
        }
      ]
    }
    results = validate_data_against_schemas(data, schemas=schemas)
    assert not results

def test_validate_data_against_schemas_missing_property():
    data = {
      "file_format": [
        {
          "identifier": "txt",
          "description": "This format is used for aligned reads",
          "status": "shared",
          "consortia": [
            "358aed10-9b9d-4e26-ab84-4bd162da182b"
          ],
          "submission_centers": [
            "9626d82e-8110-4213-ac75-0a50adf890ff"
          ]
        }
      ]
    }
    results = validate_data_against_schemas(data, schemas=schemas)
    assert results == {"errors": [{"type": "file_format", "item": "txt", "index": 0, "missing_properties": ["standard_file_extension"]}]}


def test_validate_data_against_schemas_missing_any_of_properties():
    data = {
      "file_format": [
        {
          "identifier": "txt",
          "description": "This format is used for aligned reads",
          "status": "shared",
          "standard_file_extension": "vcf.gz.tbi",
        }
      ]
    }
    results = validate_data_against_schemas(data, schemas=schemas)
    assert results["errors"][0]["unclassified_error"]
    assert results["errors"][0]["validator"] == "anyOf"
    assert "required" in results["errors"][0]["context"]
    assert "consortia" in results["errors"][0]["context"]
    assert "submission_centers" in results["errors"][0]["context"]


def test_validate_data_against_schemas_extraneous_property():
    data = {
      "file_format": [
        {
          "status": "shared",
          "description": "Tabix index file of vcf, compressed",
          "identifier": "vcf_gz_tbi",
          "consortia": [
            "358aed10-9b9d-4e26-ab84-4bd162da182b"
          ],
          "submission_centers": [
            "9626d82e-8110-4213-ac75-0a50adf890ff"
          ],
          "standard_file_extension": "vcf.gz.tbi",
          "some_extraneous_property": "xyzzy"
        }
      ]
    }
    results = validate_data_against_schemas(data, schemas=schemas)
    assert results == {"errors": [{"type": "file_format", "item": "vcf_gz_tbi", "index": 0, "extraneous_properties": ["some_extraneous_property"]}]}
