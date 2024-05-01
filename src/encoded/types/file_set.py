from typing import List, Union

from pyramid.request import Request
from snovault import calculated_property, collection, load_schema

from .submitted_item import SubmittedItem


def _build_file_set_embedded_list():
    """Embeds for search on file sets."""
    return [
        "libraries.assay",
        "libraries.analyte.samples.display_title",
        "sequencing.sequencer.display_title",
        "sequencing.target_coverage",
        "files.o2_path",
        "files.upload_key",
        "files.file_format.display_title",
        "files.file_status_tracking",
        "meta_workflow_runs.meta_workflow.display_title",
        "meta_workflow_runs.accession",
        "meta_workflow_runs.final_status",
        "meta_workflow_runs.date_created",
    ]


@collection(
    name="file-sets",
    unique_key="submitted_id",
    properties={
        "title": "File Sets",
        "description": "Collections of related files",
    })
class FileSet(SubmittedItem):
    item_type = "file_set"
    schema = load_schema("encoded:schemas/file_set.json")
    embedded_list = _build_file_set_embedded_list()
    rev = {
        "files": ("File", "file_sets"),
        "meta_workflow_runs": ("MetaWorkflowRun", "file_sets"),
    }

    @calculated_property(
        schema={
            "title": "Files",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "File",
            },
        },
    )
    def files(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "files")
        if result:
            return result
        return

    @calculated_property(
        schema={
            "title": "MetaWorkflowRuns",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "MetaWorkflowRun",
            },
        },
    )
    def meta_workflow_runs(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "meta_workflow_runs")
        if result:
            return result
        return
