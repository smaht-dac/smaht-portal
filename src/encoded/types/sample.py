from snovault import abstract_collection, load_schema

from .submitted_item import SubmittedItem


@abstract_collection(
    name="samples",
    unique_key="submitted_id",
    properties={
        "title": "Samples",
        "description": "Samples from a living organism for subsequent analysis",
    },
)
class Sample(SubmittedItem):
    item_type = "sample"
    base_types = ["Sample"] + SubmittedItem.base_types
    schema = load_schema("encoded:schemas/sample.json")
    embedded_list = [
        #"sample_sources.*",  # this will capture everything of note for the manifest file
        #"sample_sources.donor.*"

        # Specific embeds for sample manifest
        "sample_sources.donor.accession",
        "sample_sources.description",
        "sample_sources.external_id",
        "sample_sources.sample_count",
        "sample_sources.anatomical_location",
        "sample_sources.ischemic_time",
        "sample_sources.pathology_notes",
        "sample_sources.ph",
        "sample_sources.preservation_medium",
        "sample_sources.preservation_type",
        "sample_sources.prosector_notes",
        "sample_sources.sample_count",
        "sample_sources.size",
        "sample_sources.size_unit",
        "sample_sources.uberon_id.identifier",
        "sample_sources.volume",
        "sample_sources.weight",

        #from Cell Sample
        "parent_samples.accession", # do we want this?
 
        # from CellCulture
        "sample_sources.culture_duration",
        "sample_sources.culture_harvest_date",
        "sample_sources.culture_start_date",
        "sample_sources.growth_medium",
        "sample_sources.karyotype",
        "sample_sources.cell_line.code",
        "sample_sources.cell_line.parent_cell_lines.code", # do we need this?
        "sample_sources.cell_line.source",
        "sample_sources.cell_line.url"

    ]
