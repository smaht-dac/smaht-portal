from typing import Any, Dict, List, Union, Optional

from pyramid.view import view_config
from pyramid.request import Request
from snovault import calculated_property, collection, load_schema
from snovault.util import debug_log, get_item_or_none
from encoded.validator_decorators import link_related_validator
import structlog

from .submitted_item import (
    SUBMITTED_ITEM_ADD_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PUT_VALIDATORS,
    SubmittedItem,
)
from ..item_utils import (
    assay as assay_utils,
    file_set as file_set_utils,
    item as item_utils,
    library as library_utils,
    sequencing as sequencing_utils,
    sample as sample_utils
)
from ..item_utils.utils import (
    RequestHandler,
    get_property_value_from_identifier,
    get_property_values_from_identifiers
)
from ..utils import load_extended_descriptions_in_schemas


from .base import (
    collection_add,
    item_edit,
    Item
)

from .utils import get_properties, get_property_for_validation
log = structlog.getLogger(__name__)


# These codes are used to generate the mergeable bam grouping calc prop
# This obviously is not data drive, but in calc props we cannot rely on search
# and would rather hard code this potentially expensive operation - Will 16 April 2024
SINGLE_CELL_ASSAY_CODES = [
    '016', '012', '014', '105', '104', '103', '013', '011', '010'
]

def _build_file_set_embedded_list():
    """Embeds for search on file sets."""
    return [
        "submission_centers.identifier",

        # Assay LinkTo - used in file_merge_group
        "libraries.assay.code",
        "libraries.assay.identifier",

        # Sample/SampleSource LinkTo - used in file_merge_group and submission status page
        "libraries.analytes.samples.display_title",
        "libraries.analytes.samples.sample_sources.submitted_id",
        "libraries.analytes.samples.sample_sources.code",
        "libraries.analytes.samples.sample_sources.cell_line.code",

        # Sequencing/Sequencer LinkTo - used in file_merge_group
        "sequencing.submitted_id",
        "sequencing.target_coverage",
        "sequencing.target_read_count",
        "sequencing.read_type",
        "sequencing.target_read_length",
        "sequencing.flow_cell",
        "sequencing.sequencer.identifier",

        "files.accession",
        "files.o2_path",
        "files.upload_key",
        "files.file_format.display_title",
        "files.file_status_tracking",
        "files.quality_metrics.overall_quality_status",
        
        "meta_workflow_runs.meta_workflow.display_title",
        "meta_workflow_runs.meta_workflow.category",
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
    schema = load_extended_descriptions_in_schemas(load_schema("encoded:schemas/file_set.json"))
    embedded_list = _build_file_set_embedded_list()
    rev = {
        "files": ("File", "file_sets"),
        "meta_workflow_runs": ("MetaWorkflowRun", "file_sets"),
    }

    class Collection(Item.Collection):
        pass

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

    @staticmethod
    def generate_sequencing_part(
        request_handler: RequestHandler, sequencing: Dict[str, Any]
    ) -> str:
        """ The sequencing part of the file_merge_group consists of the name of the sequencer,
            the read type, the target read length and flow cell
        """
        sequencer = get_property_value_from_identifier(
            request_handler,
            sequencing_utils.get_sequencer(sequencing),
            item_utils.get_identifier
        )
        read_type_part = sequencing_utils.get_read_type(sequencing)
        target_read_length = sequencing_utils.get_target_read_length(sequencing)
        flow_cell = sequencing_utils.get_flow_cell(sequencing) or "no-flow-cell"
        return f'{sequencer}-{read_type_part}-{target_read_length}-{flow_cell}'

    @staticmethod
    def generate_assay_part(
        request_handler: RequestHandler, library: Dict[str, Any]
    ) -> Union[str, None]:
        """ The library of the merge_file_group contains information on the assay
            This basically just checks the assay code isn't a single cell type and if
            it isn't return the identifier
        """
        assay = request_handler.get_item(library_utils.get_assay(library))
        assay_code = item_utils.get_code(assay)
        if assay_code not in SINGLE_CELL_ASSAY_CODES:
            return item_utils.get_identifier(assay)

    @staticmethod
    def generate_sample_source_part(
        request_handler: RequestHandler, library: Dict[str, Any]
    ) -> Union[str, None]:
        """ Note this is also derived from the library """
        samples = library_utils.get_samples(
            library, request_handler=request_handler
        )
        if len(samples) == 0:
            return None
        if len(samples) > 1:
            samples_meta = request_handler.get_items(samples)
            for sample_meta in samples_meta:
                if sample_utils.is_tissue_sample(sample_meta) and sample_meta.get('category') != 'Homogenate':
                    return None # this should give some kind of warning. Should not have multiple intact tissue samples
        if len(samples) == 1:
            sample = samples[0]
            if 'tissue' in sample:
                sample_meta = request_handler.get_item(sample)
                if sample_meta.get('category') != 'Homogenate':
                    return get_property_value_from_identifier(
                        request_handler, sample, item_utils.get_submitted_id
                    )
        # If we are a tissue sample, generate this based on the sample field, not the sample
        # sources field

        # If we get here, we are a Homogenate tissue sample or cell line and should rely on sample sources
        sample_sources = library_utils.get_sample_sources(
            library, request_handler=request_handler
        )
        if len(sample_sources) > 1:
            return None  # there is too much complexity
        else:
            sample_source = sample_sources[0]
        return get_property_value_from_identifier(
            request_handler, sample_source, item_utils.get_submitted_id
        )

    @calculated_property(
        schema={
            "title": "File Group",
            "description": "Object tag for files that are candidates for merging",
            "type": "object",
            "properties": {
                "submission_center": {
                    "title": "Submitted By Tag",
                    "type": "string"
                },
                "sample_source": {
                    "title": "Sample Source Tag",
                    "type": "string"
                },
                "sequencing": {
                    "title": "Sequencing Tag",
                    "type": "string"
                },
                "assay": {
                    "title": "Assay Tag",
                    "type": "string"
                }
            }
        }
    )
    def file_group(self, request):
        """ The File Merge Group as it's called determines which file sets contain files
            that are candidates for merging. Note that this NOT a hard and fast rule - just
            because the group matches does NOT mean that ALL files can be merged, or even most
            of them across file sets. Further heuristics are needed to determine specifically
            which files are mergeable, but this ID will tell you what the candidates are.

            The group is constructed by combining several pieces of information into an object that
            determines the "mergeability" of the files, being on order of appearance in the
            object:
                * The submission center who submitted this file set
                * The sample source identifier, whether it be a tissue or cell sample
                * Various information on the sequencer: name, read type, target read length
                  and flow cell
                * Assay identifier
        """
        # NOTE: we assume the first library is representative if there are multiple
        # We also assume this will always be present, and if not we do not produce this property
        # This assumption may not hold true forever, we should monitor this closely - Will 17 April 24
        request_handler = RequestHandler(request=request)
        library = file_set_utils.get_libraries(self.properties)
        if not library:
            return None
        library = request_handler.get_item(library[0])
        assay_part = self.generate_assay_part(request_handler, library)
        if not assay_part:  # we return none if this is a single cell assay to omit this prop
            return None

        sample_source_part = self.generate_sample_source_part(request_handler, library)
        if not sample_source_part:
            return None

        # If we've reached this part, the library/assay is compatible
        sequencing = request_handler.get_item(
            file_set_utils.get_sequencing(self.properties)
        )
        sequencing_part = self.generate_sequencing_part(request_handler, sequencing)
        if not sequencing_part:
            return None

        # We need this because sequencing and sample submission centers could be different
        # this is the last thing we do since we could have exited above and the submission
        # center will always be present
        sc_part = get_property_value_from_identifier(
            request_handler,
            item_utils.get_submission_centers(self.properties)[0],
            item_utils.get_identifier,
        )

        return {
            'submission_center': sc_part,
            'sample_source': sample_source_part,
            'sequencing': sequencing_part,
            'assay': assay_part
        }


@link_related_validator
def validate_compatible_assay_and_sequencer_on_add(context, request):
    """Check filesets to make sure they are linked to compatible library.assay and sequencing items on add.
    
    The assays with `valid_sequencers` property may need to be updated as new techologies come out 
    or are added to the portal.
    """
    data = request.json
    assays = []
    valid_sequencers = []
    for library in data['libraries']:
        assay_aid = library_utils.get_assay(
            get_item_or_none(request, library, 'library')
        )
        assay = get_item_or_none(request, assay_aid, 'assay')
        assays.append(
            item_utils.get_identifier(assay)
        )
        valid_sequencers += assay_utils.get_valid_sequencers(assay)
    sequencer_aid = sequencing_utils.get_sequencer(
        get_item_or_none(request, data['sequencing'], 'sequencing')
    )
    sequencer = item_utils.get_identifier(
        get_item_or_none(request, sequencer_aid, 'sequencer')
    )
    if valid_sequencers:
        if sequencer not in valid_sequencers:
            msg = f"Sequencer {sequencer} is not allowed for assay {assay}. Valid sequencers are {','.join(valid_sequencers)}"
            return request.errors.add('body', 'FileSet: invalid links', msg)
    return request.validated.update({})


def validate_compatible_assay_and_sequencer_on_edit(context, request):
    """Check filesets to make sure they are linked to compatible library.assay and sequencing items on edit.
    
    The assays with `valid_sequencers` property may need to be updated as new techologies come out 
    or are added to the portal.
    """
    existing_properties = get_properties(context)
    properties_to_update = get_properties(request)
    libraries = get_property_for_validation('libraries', existing_properties, properties_to_update)
    assays = []
    valid_sequencers = []
    for library in libraries:
        assay_aid = library_utils.get_assay(
            get_item_or_none(request, library, 'library')
        )
        assay = get_item_or_none(request, assay_aid, 'assay')
        assays.append(
            item_utils.get_identifier(assay)
        )
        valid_sequencers += assay_utils.get_valid_sequencers(assay)
    sequencing = get_property_for_validation('sequencing', existing_properties, properties_to_update)
    sequencer_aid = sequencing_utils.get_sequencer(
        get_item_or_none(request, sequencing, 'sequencing')
    )
    sequencer = item_utils.get_identifier(
        get_item_or_none(request, sequencer_aid, 'sequencer')
    )
    if valid_sequencers:
        if sequencer not in valid_sequencers:
            msg = f"Sequencer {sequencer} is not allowed for assay {assays}. Valid sequencers are {','.join(valid_sequencers)}"
            return request.errors.add('body', 'FileSet: invalid links', msg)
    return request.validated.update({})


FILE_SET_ADD_VALIDATORS = SUBMITTED_ITEM_ADD_VALIDATORS + [
    validate_compatible_assay_and_sequencer_on_add
]

@view_config(
    context=FileSet.Collection,
    permission='add',
    request_method='POST',
    validators=FILE_SET_ADD_VALIDATORS,
)
@debug_log
def file_set_add(context, request, render=None):
    return collection_add(context, request, render)


FILE_SET_EDIT_PATCH_VALIDATORS = SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS + [
    validate_compatible_assay_and_sequencer_on_edit
]

FILE_SET_EDIT_PUT_VALIDATORS = SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + [
    validate_compatible_assay_and_sequencer_on_edit
]

@view_config(
    context=FileSet,
    permission='edit',
    request_method='PUT',
    validators=FILE_SET_EDIT_PUT_VALIDATORS,
)
@view_config(
    context=FileSet,
    permission='edit',
    request_method='PATCH',
    validators=FILE_SET_EDIT_PATCH_VALIDATORS,
)
@debug_log
def file_set_edit(context, request, render=None):
    return item_edit(context, request, render)
