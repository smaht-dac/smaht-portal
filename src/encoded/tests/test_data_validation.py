from encoded.ingestion.data_validation import validate_data_against_schemas
from snovault.schema_utils import load_schema


def load_sample_schemas():
    return {"file_format": load_schema("encoded:schemas/file_format.json")}


def test_validate_data_against_schemas_okay():
    schemas = load_sample_schemas()
    data = {
      "file_format": [
        {
          "uuid": "c72926d4-7c47-41df-b678-58938eaa1000",
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
          "uuid": "c72926d4-7c47-41df-b678-58938eaa1001",
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
          "uuid": "c72926d4-7c47-41df-b678-58938eaa1002",
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
    schemas = load_sample_schemas()
    data = {
      # Missing standard_file_extension property.
      "file_format": [
        {
          "uuid": "c72926d4-7c47-41df-b678-58938eaa3f75",
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
    assert results == {"errors": [{"type": "file_format", "item": "c72926d4-7c47-41df-b678-58938eaa3f75", "index": 0, "missing_properties": ["standard_file_extension"]}]}


def test_validate_data_against_schemas_missing_any_of_properties():
    schemas = load_sample_schemas()
    data = {
      # Missing consortia and/or submission_centers properties.
      "file_format": [
        {
          "uuid": "c72926d4-7c47-41df-b678-58938eaa3f75",
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
    schemas = load_sample_schemas()
    data = {
      # Extraneous property (some_extraneous_property).
      "file_format": [
        {
          "uuid": "c72926d4-7c47-41df-b678-58938eaa3f75",
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
    assert results == {"errors": [{"type": "file_format", "item": "c72926d4-7c47-41df-b678-58938eaa3f75", "index": 0, "extraneous_properties": ["some_extraneous_property"]}]}
