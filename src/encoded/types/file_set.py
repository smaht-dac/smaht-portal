from typing import Any, Dict, List, Union

from pyramid.view import view_config
from pyramid.request import Request
from snovault import calculated_property, collection, load_schema
from snovault.util import debug_log, get_item_or_none

from .submitted_item import (
    SUBMITTED_ITEM_ADD_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PUT_VALIDATORS,
    SubmittedItem,
)
from ..item_utils import (
    file_set as file_set_utils,
    item as item_utils,
    library as library_utils,
    sequencing as sequencing_utils,
)
from ..item_utils.utils import RequestHandler, get_property_value_from_identifier
from ..utils import load_extended_descriptions_in_schemas


from .base import (
    collection_add,
    item_edit,
    Item
)

# These codes are used to generate the mergeable bam grouping calc prop
# This obviously is not data drive, but in calc props we cannot rely on search
# and would rather hard code this potentially expensive operation - Will 16 April 2024
SINGLE_CELL_ASSAY_CODES = [
    '016', '012', '014', '105', '104', '103', '013', '011', '010'
]

CONDITIONALLY_DEPENDENT = {
    "bulk_fiberseq": ["pacbio_revio_hifi"], # Fiber-Seq and PacBio
    "bulk_mas_iso_seq":["pacbio_revio_hifi"], # MAS ISO-Seq and PacBio
    "cas9_nanopore":["ont_minion_mk1b","ont_promethion_2_solo","ont_promethion_24"], # Cas9 Nanopore and ONT
    "bulk_ultralong_wgs":["ont_minion_mk1b","ont_promethion_2_solo","ont_promethion_24"] # Ultralong WGS and ONT
}

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
        "sequencing.read_type",
        "sequencing.target_read_length",
        "sequencing.flow_cell",
        "sequencing.sequencer.identifier",

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
        if len(samples) > 1:
            return None  # there is too much complexity

        # If we are a tissue sample, generate this based on the sample field, not the sample
        # sources field
        sample = samples[0]
        if 'tissue' in sample:
            return get_property_value_from_identifier(
                request_handler, sample, item_utils.get_submitted_id
            )

        # If we get here, we are not a tissue sample and should rely on sample sources
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


def validate_compatible_assay_and_sequencer(context, request):
    """Check filesets to make sure they are linked to compatible library.assay and sequencing items.
    
    The list of `CONDITIONALLY_DEPENDENT` assays and sequencers may need to be updated as new techologies come out 
    or are added to the portal.
    """
    data = request.json
    if 'libraries' in data:
        libraries = data['libraries']
        assays = []
        for library in libraries:
            assay_aid=get_item_or_none(request,library,'library').get("assay","")
            assay=get_item_or_none(request,assay_aid,'assay')
            assays.append(assay.get("identifier",""))
        sequencer_aid=sequencing_utils.get_sequencer(get_item_or_none(request,data['sequencing'],'sequencing'))
        sequencer = get_item_or_none(request,sequencer_aid,'sequencer').get("identifier","")
        overlap = list(set(assays) & CONDITIONALLY_DEPENDENT.keys())
        if overlap:
            for assay in overlap:
                special_sequencers = CONDITIONALLY_DEPENDENT[assay]
                if sequencer not in special_sequencers:
                    msg = f"Sequencer {sequencer} is not allowed for assay {assay}."
                    return request.errors.add('body', 'FileSet: invalid links', msg)
        return request.validated.update({})


FILE_SET_ADD_VALIDATORS = SUBMITTED_ITEM_ADD_VALIDATORS + [
    validate_compatible_assay_and_sequencer
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
    validate_compatible_assay_and_sequencer
]

FILE_SET_EDIT_PUT_VALIDATORS = SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + [
    validate_compatible_assay_and_sequencer
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