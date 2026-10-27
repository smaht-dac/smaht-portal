from snovault import collection, load_schema

from .submitted_file import SubmittedFile


@collection(
    name="histology-images",
    unique_key="submitted_id",
    properties={
        "title": "Histology Images",
        "description": "Histological image files of tissue samples",
    },
)
class HistologyImage(SubmittedFile):
    item_type = "histology_image"
    schema = load_schema("encoded:schemas/histology_image.json")
    embedded_list = [
        # Lets HistologyImage search filter by its reports' samples' tissue_type
        # and donor population -- Browse by Tissue's chart links to the images
        # of one tissue (see PathologyReport's own identical embeds).
        "pathology_reports.tissue_samples.sample_sources.tissue_type",
        "pathology_reports.tissue_samples.sample_sources.donor.study",
        "pathology_reports.tissue_samples.sample_sources.donor.tags",
    ]
