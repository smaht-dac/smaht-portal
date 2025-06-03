from typing import Any, Dict, List, Union
import functools

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
    analyte as analyte_utils,
    sample as sample_utils,
    tissue_sample as tissue_sample_utils,
    tissue as tissue_utils,
)
from ..item_utils.utils import (
    RequestHandler,
    get_property_value_from_identifier,
    get_property_values_from_identifiers,

)
from ..utils import load_extended_descriptions_in_schemas


from .base import (
    collection_add,
    item_edit,
    Item
)

from .utils import get_properties, get_property_for_validation
log = structlog.getLogger(__name__)


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
        "libraries.analytes.samples.sample_sources.uberon_id",
        "libraries.analytes.samples.sample_sources.cell_line.code",
        "libraries.analytes.samples.sample_sources.uberon_id",
        "libraries.analytes.samples.sample_sources.donor.display_title",

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
            This basically just checks the cell isolation method is bulk (isn't a single cell  or microbulk) and if it is, return the identifier
        """
        assay = request_handler.get_item(library_utils.get_assay(library))
        cell_isolation_method = assay_utils.get_cell_isolation_method(assay)
        if cell_isolation_method == "Bulk":
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
        # if len(samples) > 1:
        #     samples_meta = request_handler.get_items(samples)
        #     for sample_meta in samples_meta:
        #         if sample_utils.is_tissue_sample(sample_meta) and tissue_sample_utils.has_spatial_information(sample_meta):
        #             return None # this should give some kind of warning. Should not have multiple intact tissue samples
        if len(samples) == 1:
            sample = samples[0]
            if 'tissue' in sample:
                sample_meta = request_handler.get_item(sample)
                if tissue_sample_utils.has_spatial_information(sample_meta):
                    return get_property_value_from_identifier(
                        request_handler, sample, item_utils.get_submitted_id
                    )
        # If we are a single tissue sample with spatial information, generate this based on the sample field, not the sample
        # sources field

        # If we get here, we are a Homogenate tissue sample, multiple merged tissue samples, or cell line and should rely on sample sources
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
                },
                "group_tag": {
                    "title": "Group Tag",
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
                * An optional flag to differentiate the group from ones that would otherwise be in the
                same merge group, but should be kept separate for QC or other reasons
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
        group_tag_part = file_set_utils.get_group_tag(self.properties)

        return {
            'submission_center': sc_part,
            'sample_source': sample_source_part,
            'sequencing': sequencing_part,
            'assay': assay_part,
            'group_tag': group_tag_part
        }

    @calculated_property(
        schema={
            "title": "Tissue Type",
            "description": "Higher level tissue type of file set",
            "type": "string"
        }
    )
    def tissue_types(self, request):
        """"Get top ontology term tissue type from tissue."""
        request_handler = RequestHandler(request=request)
        return get_property_values_from_identifiers(
            request_handler,
            file_set_utils.get_tissues(self.properties, request_handler),
            functools.partial(
                tissue_utils.get_top_grouping_term, request_handler=request_handler
            )
        )


@link_related_validator
def validate_compatible_assay_and_sequencer_on_add(context, request):
    """Check filesets to make sure they are linked to compatible library.assay and sequencing items on add."""
    if 'force_pass' in request.query_string:
        return
    data = request.json
    libraries = data['libraries']
    sequencing = data['sequencing']
    return check_compatible_assay_and_sequencer(request, libraries, sequencing)


@link_related_validator
def validate_compatible_assay_and_sequencer_on_edit(context, request):
    """Check filesets to make sure they are linked to compatible library.assay and sequencing items on edit."""
    if 'force_pass' in request.query_string:
        return
    existing_properties = get_properties(context)
    properties_to_update = get_properties(request)
    libraries = get_property_for_validation('libraries', existing_properties, properties_to_update)
    sequencing = get_property_for_validation('sequencing', existing_properties, properties_to_update)
    return check_compatible_assay_and_sequencer(request, libraries, sequencing)


def check_compatible_assay_and_sequencer(request, libraries: List[str], sequencing: str):
    """Checks that if library.assay has a valid_sequencer property, that sequencing.sequencer is among them.

    The assays with `valid_sequencers` property may need to be updated as new techologies come out
    or are added to the portal.
    """
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
    sequencer_aid = sequencing_utils.get_sequencer(
        get_item_or_none(request, sequencing, 'sequencing')
    )
    sequencer = item_utils.get_identifier(
        get_item_or_none(request, sequencer_aid, 'sequencer')
    )
    if valid_sequencers:
        if sequencer not in valid_sequencers:
            msg = f"Sequencer {sequencer} is not allowed for assay {assay}. Valid sequencers are {','.join(valid_sequencers)}"
            return request.errors.add('body', 'FileSet: invalid links', msg)
    return request.validated.update({})


@link_related_validator
def validate_molecule_sequencing_properties_on_add(context, request):
    """Check that sequencing properties are molecule-appropriate on add."""
    if 'force_pass' in request.query_string:
        return
    data = request.json
    libraries = data['libraries']
    sequencing = data['sequencing']
    return check_molecule_sequencing_properties(request, libraries, sequencing)


@link_related_validator
def validate_molecule_sequencing_properties_on_edit(context, request):
    """Check that sequencing properties are molecule-appropriate on edit."""
    if 'force_pass' in request.query_string:
        return
    existing_properties = get_properties(context)
    properties_to_update = get_properties(request)
    libraries = get_property_for_validation('libraries', existing_properties, properties_to_update)
    sequencing = get_property_for_validation('sequencing', existing_properties, properties_to_update)
    return check_molecule_sequencing_properties(request, libraries, sequencing)


def check_molecule_sequencing_properties(request, libraries: List[str], sequencing: str):
    """Check at the FileSet level if Sequencing molecule-specific properties are present.

    If 'RNA' is in libraries.analytes.molecule, sequencing.target_read_count is present.
    """
    molecules = []
    for library in libraries:
        analytes_aid = library_utils.get_analytes(
            get_item_or_none(request, library, 'library')
        )
        for analyte in analytes_aid:
            molecules += analyte_utils.get_molecule(
                get_item_or_none(request, analyte, 'analytes')
            )
    target_read_count = sequencing_utils.get_target_read_count(
        get_item_or_none(request, sequencing, 'sequencing')
    )
    if "RNA" in molecules:
        if not target_read_count:
            msg = "property `target_read_count` is required for sequencing of RNA libraries"
            return request.errors.add('body', 'Sequencing: invalid property', msg)
    return request.validated.update({})


FILE_SET_ADD_VALIDATORS = SUBMITTED_ITEM_ADD_VALIDATORS + [
    validate_compatible_assay_and_sequencer_on_add,
    validate_molecule_sequencing_properties_on_add
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
    validate_compatible_assay_and_sequencer_on_edit,
    validate_molecule_sequencing_properties_on_edit
]

FILE_SET_EDIT_PUT_VALIDATORS = SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + [
    validate_compatible_assay_and_sequencer_on_edit,
    validate_molecule_sequencing_properties_on_edit
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
