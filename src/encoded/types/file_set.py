from typing import List, Union

from pyramid.request import Request
from snovault import calculated_property, collection, load_schema
from snovault.util import get_item_or_none
from .submitted_item import SubmittedItem


# These codes are used to generate the mergeable bam grouping calc prop
# This obviously is not data drive, but in calc props we cannot rely on search
# and would rather hard code this potentially expensive operation - Will 16 April 2024
SINGLE_CELL_ASSAY_CODES = [
    '016', '012', '014', '105', '104', '103', '013', '011', '010'
]


def _build_file_set_embedded_list():
    """Embeds for search on file sets."""
    return [
        "submission_centers.name",
        "submission_centers.identifier",

        # Assay LinkTo - used in file_merge_group
        "libraries.assay.code",
        "libraries.assay.identifier",

        # Sample/SampleSource LinkTo - used in file_merge_group
        "libraries.analyte.samples.display_title",
        "libraries.analyte.samples.sample_sources.submitted_id",

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

    @staticmethod
    def generate_sequencing_part(request, sequencing):
        """ The sequencing part of the file_merge_group consists of the name of the sequencer,
            the read type, the target read length and flow cell
        """
        read_type_part = sequencing.get('read_type')
        sequencer = get_item_or_none(request, sequencing.get('sequencer')).get('identifier')
        target_read_length = sequencing.get('target_read_length')
        flow_cell = sequencing.get('flow_cell', 'no-flow-cell')
        return f'{sequencer}-{read_type_part}-{target_read_length}-{flow_cell}'

    @staticmethod
    def generate_assay_part(request, library):
        """ The library of the merge_file_group contains information on the assay
            This basically just checks the assay code isn't a single cell type and if
            it isn't return the identifier
        """
        assay = get_item_or_none(request, library.get('assay'))
        assay_code = assay.get('code')
        if assay_code not in SINGLE_CELL_ASSAY_CODES:
            return assay.get('identifier')

    @staticmethod
    def generate_sample_source_part(request, library):
        """ Note this is also derived from the library """
        analyte = get_item_or_none(request, library.get('analyte'))
        samples = analyte.get('samples')
        if len(samples) > 1:
            return None  # there is too much complexity
        else:
            sample = samples[0]
        sample = get_item_or_none(request, sample)
        sample_sources = sample.get('sample_sources')
        if len(sample_sources) > 1:
            return None  # there is too much complexity
        else:
            sample_source = sample_sources[0]
        sample_source = get_item_or_none(request, sample_source)
        return sample_source.get('submitted_id')

    @calculated_property(
        schema={
            "title": "File Merging Group",
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
    def file_merge_group(self, request):
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
        library = self.properties.get('libraries')
        if not library:
            return None
        library = get_item_or_none(request, library[0])
        assay_part = self.generate_assay_part(request, library)
        if not assay_part:  # we return none if this is a single cell assay to omit this prop
            return None

        sample_source_part = self.generate_sample_source_part(request, library)
        if not sample_source_part:
            return None

        # If we've reached this part, the library/assay is compatible
        sequencing = get_item_or_none(request, self.properties.get('sequencing'))
        sequencing_part = self.generate_sequencing_part(request, sequencing)
        if not sequencing_part:
            return None

        # When it was a unified tag we needed this but now we just rely on the
        # submission_center property, can be added back though - Will 24 April 2024
        # this is the last thing we do since we could have exited above and the submission
        # center will always be present
        # sc = get_item_or_none(request, self.properties.get('submission_centers')[0])
        # sc_part = sc.get('identifier')

        return {
            'sample_source': sample_source_part,
            'sequencing': sequencing_part,
            'assay': assay_part
        }
