import copy

from snovault import calculated_property, collection, load_schema
from encoded_core.types.workflow import WorkflowRun as CoreWorkflowRun

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item


def _build_workflow_run_embedded_list():
    """ Helper function for building workflow embedded list. """
    return Item.embedded_list + [
        # Workflow linkTo
        'workflow.category',
        'workflow.app_name',
        'workflow.title',
        'workflow.steps.name',

        # Software linkTo
        'workflow.steps.meta.software_used.name',
        'workflow.steps.meta.software_used.title',
        'workflow.steps.meta.software_used.version',
        'workflow.steps.meta.software_used.source_url',

        # String
        'input_files.workflow_argument_name',
        # File linkTo
        'input_files.value.filename',
        'input_files.value.display_title',
        'input_files.value.href',
        'input_files.value.file_format',
        'input_files.value.accession',
        'input_files.value.@type',
        'input_files.value.@id',
        'input_files.value.file_size',
        'input_files.value.quality_metric.url',
        'input_files.value.quality_metric.overall_quality_status',
        'input_files.value.status',
        'input_files.value.data_generation_summary',
        'input_files.value.file_status_tracking',

        # String
        'output_files.workflow_argument_name',

        # File linkTo
        'output_files.value.filename',
        'output_files.value.display_title',
        'output_files.value.href',
        'output_files.value.file_format',
        'output_files.value.accession',
        'output_files.value.@type',
        'output_files.value.@id',
        'output_files.value.file_size',
        'output_files.value.quality_metric.url',
        'output_files.value.quality_metric.overall_quality_status',
        'output_files.value.status',
        'output_files.value.data_generation_summary',
        'output_files.value.file_status_tracking',
        'output_files.value_qc.url',
        'output_files.value_qc.overall_quality_status'
    ]


steps_run_data_schema = {
    "type": "object",
    "properties": {
        "file": {
            "type": "array",
            "title": "File(s)",
            "description": "File(s) for this step input/output argument.",
            "items": {
                "type": ["string", "object"],  # Either string (uuid) or a object/dict containing uuid & other front-end-relevant properties from File Item.
                "linkTo": "File"  # TODO: (Med/High Priority) Make this work. Will likely wait until after embedding edits b.c. want to take break from WF stuff and current solution works.
            }
        },
        "meta": {
            "type": "array",
            "title": "Additional metadata for input/output file(s)",
            "description": "List of additional info that might be related to file, but not part of File Item itself, such as ordinal.",
            "items": {
                "type": "object"
            }
        },
        "value": {  # This is used in place of run_data.file, e.g. for a parameter string value, that does not actually have a file.
            "title": "Value",
            "type": "string",
            "description": "Value used for this output argument."
        },
        "type": {
            "type": "string",
            "title": "I/O Type"
        }
    }
}

workflow_schema = load_schema('encoded:schemas/workflow.json')
workflow_steps_property_schema = workflow_schema.get('properties', {}).get('steps')
# This is the schema used for WorkflowRun.steps. Extends Workflow.steps schema.
workflow_run_steps_property_schema = copy.deepcopy(workflow_steps_property_schema)
workflow_run_steps_property_schema['items']['properties']['inputs']['items']['properties']['run_data'] = steps_run_data_schema
workflow_run_steps_property_schema['items']['properties']['outputs']['items']['properties']['run_data'] = steps_run_data_schema


@collection(
    name='workflow-runs',
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        'title': 'Workflow Runs',
        'description': 'Listing of executions of analysis workflows',
    })
class WorkflowRun(Item, CoreWorkflowRun):
    """The WorkflowRun class that describes execution of a workflow."""

    item_type = 'workflow_run'
    schema = load_schema("encoded:schemas/workflow_run.json")
    embedded_list = []  # _build_workflow_run_embedded_list()

    @calculated_property(schema=workflow_run_steps_property_schema, category='page')
    def steps(self, request):
        return CoreWorkflowRun.steps(self, request)
