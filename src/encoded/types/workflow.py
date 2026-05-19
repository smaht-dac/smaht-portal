"""The type file for the workflow related items.
"""

import copy
import cProfile
import io
import pstats

from collections import defaultdict
from dcicutils.misc_utils import ignored, ignorable, PRINT
from inspect import signature
from pyramid.response import Response
from pyramid.view import view_config
from snovault import calculated_property, collection, load_schema, CONNECTION, TYPES
from snovault.util import debug_log, get_item_or_none
from encoded_core.types.workflow import Workflow as CoreWorkflow, WorkflowRun as CoreWorkflowRun
from time import sleep

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item


def get_unique_key_from_at_id(at_id):
    if not at_id:
        return None
    at_id_parts = at_id.split('/')
    return at_id_parts[2]


DEFAULT_TRACING_OPTIONS = {
    'max_depth_history': 9,
    'max_depth_future': 9,
    "group_similar_workflow_runs": True,
    "track_performance": False,
    "trace_direction": ["history"]
}


class WorkflowRunTracingException(Exception):
    pass


def item_model_to_object(model, request):
    '''
    Converts a model fetched via either ESStorage or RDBStorage into a class instance and then returns partial/performant JSON representation.
    Used as a 'lite' performant version of request.subrequest(...) which avoids overhead of spinning up extra HTTP requests & (potentially recursive) embeds.
    Item types supported or possible to pass through this function include: File, Workflow, WorkflowRun; and to a lesser extent (display_title will not be 'full'): Experiment, ExperimentSet.

    :param model: Pyramid model instance as returned from e.g. RDBStorage.get_by_uuid(uuid), ESStorage.get_by_uuid(uuid), RDBStorage.get_by_unique_key(key, value), etc.
    :param request: Pyramid request object.
    :returns: JSON/Dictionary representation of the Item.
    '''
    ClassForItem = request.registry[TYPES].by_item_type.get(model.item_type).factory
    item_instance = ClassForItem(request.registry, model)
    dict_repr = item_instance.__json__(request)

    # Add common properties
    dict_repr['uuid'] = str(item_instance.uuid)
    dict_repr['@id'] = str(item_instance.jsonld_id(request))
    dict_repr['@type'] = item_instance.jsonld_type()

    display_title_parameters_requested = signature(item_instance.display_title).parameters
    display_title_parameters_requested_names = list(display_title_parameters_requested.keys())
    display_title_parameters = {arg: dict_repr.get(arg, display_title_parameters_requested[arg].default) for arg in display_title_parameters_requested_names if arg != 'request'}

    dict_repr['display_title'] = item_instance.display_title(request, **display_title_parameters)

    # Add or calculate necessary rev-links; attempt to get pre-calculated value from ES first for performance. Ideally we want this to happen 100% of the time.
    if hasattr(model, 'source') and model.source.get('object'):
        item_es_obj = model.source['object']
        # WFR
        if item_es_obj.get('workflow_run_outputs'):
            dict_repr['workflow_run_outputs'] = [get_unique_key_from_at_id(wfr_at_id) for wfr_at_id in item_es_obj['workflow_run_outputs']]
        if item_es_obj.get('workflow_run_inputs'):
            dict_repr['workflow_run_inputs'] = [get_unique_key_from_at_id(wfr_at_id) for wfr_at_id in item_es_obj['workflow_run_inputs']]
        # MWFR
        if item_es_obj.get('meta_workflow_run_outputs'):
            dict_repr['meta_workflow_run_outputs'] = [get_unique_key_from_at_id(wfr_at_id) for wfr_at_id in item_es_obj['meta_workflow_run_outputs']]
        if item_es_obj.get('meta_workflow_run_inputs'):
            dict_repr['meta_workflow_run_inputs'] = [get_unique_key_from_at_id(wfr_at_id) for wfr_at_id in item_es_obj['meta_workflow_run_inputs']]

    # If not yet indexed, calculate on back-end. (Fallback).
    # Much of the time, the entirety of rev links aren't returned?? Always get back more from ES than from here o.o'.
    # WFR
    if not dict_repr.get('workflow_run_outputs') and hasattr(item_instance, 'workflow_run_outputs') and hasattr(model, 'revs'):
        dict_repr['workflow_run_outputs'] = [str(uuid) for uuid in request.registry[CONNECTION].storage.write.get_rev_links(model, item_instance.rev['workflow_run_outputs'][1])]
    if not dict_repr.get('workflow_run_inputs') and hasattr(item_instance, 'workflow_run_inputs') and hasattr(model, 'revs'):
        dict_repr['workflow_run_inputs'] = [str(uuid) for uuid in request.registry[CONNECTION].storage.write.get_rev_links(model, item_instance.rev['workflow_run_inputs'][1])]
    # MWFR
    if not dict_repr.get('meta_workflow_run_outputs') and hasattr(item_instance, 'meta_meta_workflow_run_outputs') and hasattr(model, 'revs'):
        dict_repr['meta_workflow_run_outputs'] = [str(uuid) for uuid in request.registry[CONNECTION].storage.write.get_rev_links(model, item_instance.rev['meta_workflow_run_outputs'][1])]
    if not dict_repr.get('meta_workflow_run_inputs') and hasattr(item_instance, 'meta_workflow_run_inputs') and hasattr(model, 'revs'):
        dict_repr['meta_workflow_run_inputs'] = [str(uuid) for uuid in request.registry[CONNECTION].storage.write.get_rev_links(model, item_instance.rev['meta_workflow_run_inputs'][1])]

    # For files -- include download link/href (if available)
    if hasattr(item_instance, 'href'):
        href_parameters_requested = signature(item_instance.href).parameters
        href_parameters_requested_names = list(href_parameters_requested.keys())
        href_parameters = {arg: dict_repr.get(arg, href_parameters_requested[arg].default) for arg in href_parameters_requested_names if arg != 'request'}
        dict_repr['href'] = item_instance.href(request, **href_parameters)

    return dict_repr


def get_step_io_for_argument_name(argument_name, workflow_model_obj):
    for step in workflow_model_obj.get('steps', []):
        for input_io in step.get('inputs', []):
            for source in input_io.get('source', []):
                if not source.get('step') and source.get('name') == argument_name:
                    return input_io
        for output_io in step.get('outputs', []):
            for target in output_io.get('target', []):
                if not target.get('step') and target.get('name') == argument_name:
                    return output_io
    return None


def common_props_from_file(file_obj):
    '''
    Purpose of this function is to limit the amount of properties
    that are returned for file items to keep size of response down
    re: nested embedded items.
    '''

    ret_obj = {
        '@id': file_obj['@id'],
        'uuid': file_obj['uuid'],
        'display_title': file_obj['display_title'],
        'accession': file_obj.get('accession'),
        '@type': file_obj.get('@type')
    }

    for k in ['quality_metric', 'url', 'href', 'description', 'filename', 'file_format', 'file_type', 'file_size', 'status', 'data_generation_summary', 'file_status_tracking']:
        if k in file_obj:
            ret_obj[k] = file_obj[k]

    return ret_obj


def trace_meta_workflows(original_file_set_to_trace, request, options=None):
    '''
    Trace a set of files according to supplied options.

    -- TODO: After grouping design: CLEANUP! Rename get_model to get_item, etc. Remove grouping. --

    Argumements:

        original_file_set_to_trace      Must be a list of DICTIONARIES. If have Item instances, grab their model.source['object'] or similar.
                                        Each dict should have the following fields:
                                            `uuid` (string), `workflow_run_inputs` (list of UUIDs, NOT embeds), & `workflow_run_outputs` (list of UUIDs, NOT embeds)
        request                         The request instance.
        options                         Dict of options to use for tracing. These may change; it is suggested to use the defaults.

    Returns:
        A chronological list of steps (as dictionaries)

    '''

    if options is None:
        options = DEFAULT_TRACING_OPTIONS

    if options.get('track_performance'):
        pr = cProfile.Profile()
        pr.enable()

    steps = []                          # What we return

    def find_step_by_output(output_id, steps):
        """
        Finds the step that generates the specified output ID.
        """
        for step in steps:
            for output in step.get("outputs", []):
                # Check if the output contains run_data with file information
                run_data = output.get("run_data", {})
                files = run_data.get("file", [])
                for file_info in files:
                    if file_info.get("@id") == output_id:
                        return step
        return None

    def collect_relevant_steps(output_id, steps, visited=None):
        """
        Recursively collects all steps relevant to producing the specified output ID,
        including their inputs and outputs, until the root inputs are reached.
        """
        if visited is None:
            visited = set()

        # Find the step that generates the output
        step = find_step_by_output(output_id, steps)
        if not step or step["name"] in visited:
            return []

        # Mark this step as visited
        visited.add(step["name"])

        # Collect the current step
        relevant_steps = [step]

        # Traverse the inputs of the current step
        for input_data in step.get("inputs", []):
            for source in input_data.get("source", []):
                if "for_file" in source:
                    input_source_id = source["for_file"]
                    # Recursively collect steps that lead to this input
                    relevant_steps.extend(
                        collect_relevant_steps(input_source_id, steps, visited)
                    )

        return relevant_steps

    def filter_steps(steps, relevant_step_names):
        """
        Filters the steps to include only those in the relevant_step_names set.
        """
        return [step for step in steps if step["name"] in relevant_step_names]


    ###########################################
    ### Where function starts doing things. ###
    ###########################################

    # Initialize our stack (deque) of steps to process with WFR(s) that file(s) we received are output from.
    for original_file in original_file_set_to_trace:
        file_item_output_of_meta_workflow_run_uuids = original_file.get('meta_workflow_run_outputs', [])

        if len(file_item_output_of_meta_workflow_run_uuids) == 0:
            continue

        # When we trace history, we care only about the last workflow_run out of which file was generated.
        # A file should be output of only _one_ run.
        last_meta_workflow_run_uuid = file_item_output_of_meta_workflow_run_uuids[-1]

        # mfwrItem = get_model_embed(last_meta_workflow_run_uuid)
        mfwrItem = get_item_or_none(request, last_meta_workflow_run_uuid, frame='page')
        unfiltered_steps = transform_meta_workflow_run_to_steps(mfwrItem)

        # Collect relevant steps for the specified output
        relevant_steps = collect_relevant_steps(original_file.get('@id'), unfiltered_steps)
        relevant_step_names = {step["name"] for step in relevant_steps}

        # Filter the original JSON to include only relevant steps
        filtered_steps = filter_steps(unfiltered_steps, relevant_step_names)
        steps.extend(filtered_steps)

    if options.get('track_performance'):
        pr.disable()
        s = io.StringIO()
        sortby = 'cumulative'
        ps = pstats.Stats(pr, stream=s).sort_stats(sortby)
        ps.print_stats()
        output = s.getvalue()
        PRINT(output)
        return Response(
            content_type='text/plain',
            body=output
        )

    # Filter by input
    return steps


def transform_meta_workflow_run_to_steps(meta_workflow_run_item):
    '''
    Python counterpart of transformMetaWorkflowRunToSteps in MetaWorkflowRunView.js
    '''
    workflow_runs = meta_workflow_run_item.get("workflow_runs", [])
    meta_workflow = meta_workflow_run_item.get("meta_workflow", {})

    workflows = meta_workflow.get("workflows", [])
    workflows_by_name = {workflow.get("name"): workflow for workflow in workflows}

    # Combine MWF + MWFR data:
    combined_mwfrs = [
        {**copy.deepcopy(workflows_by_name.get(workflow_run.get("name"), {})), **workflow_run}
        for workflow_run in workflow_runs
    ]

    incomplete_steps = []
    for workflow_run_object in combined_mwfrs:
        workflow_run_data = workflow_run_object.get("workflow_run", {})
        input_files = workflow_run_data.get("input_files", [])
        output_files = workflow_run_data.get("output_files", [])
        parameters = workflow_run_data.get("parameters", [])

        input_grouped = defaultdict(list)
        for item in input_files:
            input_grouped[item["workflow_argument_name"]].append(item)

        params_grouped = defaultdict(list)
        for param in parameters:
            params_grouped[param["workflow_argument_name"]].append(param)

        output_grouped = defaultdict(list)
        for item in output_files:
            output_grouped[item["workflow_argument_name"]].append(item)

        initial_step = {
            "name": workflow_run_data.get("@id"),
            "meta": {
                "@id": workflow_run_data.get("@id"),
                "workflow": workflow_run_object.get("workflow"),
                "display_title": workflow_run_data.get("display_title"),
            },
            "inputs": [],
            "outputs": []
        }

        # Process inputs
        for wfr_object_input_object in workflow_run_object.get("input", []):
            argument_name = wfr_object_input_object.get("argument_name")
            argument_type = wfr_object_input_object.get("argument_type")
            mwfr_source_step_name = wfr_object_input_object.get("source")
            source_argument_name = wfr_object_input_object.get("source_argument_name")

            files_for_this_input = input_grouped.get(argument_name, [])
            parameters_for_this_input = params_grouped.get(argument_name, [])

            initial_source = {"name": source_argument_name or argument_name}
            initial_source_list = []

            if files_for_this_input:
                for file_object in files_for_this_input:
                    file_item = file_object.get("value", {})
                    output_of_wfr = next(iter(file_item.get("workflow_run_outputs", [])), {})
                    source_object = {**initial_source, "for_file": file_item.get("@id")}
                    if output_of_wfr.get("@id"):
                        source_object["step"] = output_of_wfr["@id"]
                    initial_source_list.append(source_object)
            else:
                initial_source_list.append(initial_source)

            is_parameter = argument_type == "parameter"
            is_reference_file_input = all(
                "FileReference" in file_object.get("value", {}).get("@type", [])
                for file_object in files_for_this_input
            ) if files_for_this_input else False

            step_input_object = {
                "name": argument_name,
                "source": initial_source_list,
                "meta": {
                    "global": not mwfr_source_step_name,
                    "in_path": True,
                    "type": (
                        "parameter" if is_parameter else
                        "reference file" if is_reference_file_input else
                        "data file" if files_for_this_input else
                        None
                    )
                },
                "run_data": {
                    "type": "parameter" if is_parameter else "input"
                }
            }

            if files_for_this_input:
                step_input_object["run_data"]["file"] = [
                    file_object["value"] for file_object in files_for_this_input
                ]
                step_input_object["run_data"]["meta"] = [
                    {k: v for k, v in file_object.items() if k != "value"}
                    for file_object in files_for_this_input
                ]
            elif parameters_for_this_input:
                step_input_object["run_data"]["value"] = [
                    param["value"] for param in parameters_for_this_input
                ]
                first_param = parameters_for_this_input[0]
                step_input_object["run_data"]["meta"] = {
                    k: v for k, v in first_param.items() if k != "value"
                }

            initial_step["inputs"].append(step_input_object)

        # Process outputs
        for wfr_output_object in workflow_run_object.get("output", []):
            argument_name = wfr_output_object.get("argument_name")
            source_argument_name = wfr_output_object.get("source_argument_name")

            output_file_objects = output_grouped.get(argument_name, [])
            initial_target = {"name": source_argument_name or argument_name}
            initial_target_list = []

            for output_file_object in output_file_objects:
                file_item = output_file_object.get("value", {})
                workflow_run_inputs = file_item.get("workflow_run_inputs", [])
                for input_of_wfr in workflow_run_inputs:
                    initial_target_list.append({
                        **initial_target,
                        "for_file": file_item.get("@id"),
                        "step": input_of_wfr.get("@id")
                    })

            if not initial_target_list:
                initial_target_list.append(initial_target)

            step_output_object = {
                "name": argument_name,
                "target": initial_target_list,
                "meta": {
                    "type": (
                        "parameter" if wfr_output_object.get("argument_type") == "parameter" else
                        "data file" if wfr_output_object.get("file") else None
                    )
                },
                "run_data": {
                    "type": "output"
                }
            }

            if output_file_objects:
                step_output_object["run_data"]["file"] = [output_file_objects[0]["value"]]
                step_output_object["run_data"]["meta"] = [{"type": "Output processed file"}]

            initial_step["outputs"].append(step_output_object)

        incomplete_steps.append(initial_step)

    return incomplete_steps


@collection(
    name='workflows',
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        'title': 'Workflows',
        'description': 'Listing of analysis workflows',
    })
class Workflow(Item, CoreWorkflow):
    """The Workflow class that describes a workflow and steps in it."""

    item_type = 'workflow'
    schema = load_schema("encoded:schemas/workflow.json")
    embedded_list = CoreWorkflow.embedded_list
