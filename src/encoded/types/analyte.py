from snovault import collection, load_schema

from .submitted_item import SubmittedItem


@collection(
    name="analytes",
    unique_key="submitted_id",
    properties={
        "title": "Analytes",
        "description": "Molecules extracted from samples for subsequent analysis",
    },
)
class Analyte(SubmittedItem):
    item_type = "analyte"
    schema = load_schema("encoded:schemas/analyte.json")
    embedded_list = [
        # embeds for experimental analyte manifest
        "samples.accession",
        "samples.sample_sources.donor.accession",
        "analyte_preparation.cell_lysis_method",
        "analyte_preparation.description",
        "analyte_preparation.extraction_method",
        "analyte_preparation.homogenization_method",
        "analyte_preparation.suspension_type",
        "analyte_preparation.treatments.agent",
        "analyte_preparation.treatments.concentration",
        "analyte_preparation.treatments.concentration_units",
        "analyte_preparation.treatments.duration",
        "analyte_preparation.treatments.temperature",
        "analyte_preparation.preparation_kits.title",
        "analyte_preparation.preparation_kits.catalog_number",
        "analyte_preparation.preparation_kits.vendor",
        "analyte_preparation.preparation_kits.version",
    ]
