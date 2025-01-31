from boto3 import client as boto_client
from datetime import datetime
import functools
from pyramid.exceptions import HTTPForbidden
from pyramid.request import Request
from pyramid.response import Response
from pyramid.view import view_config
from typing import Any, Dict, List, Optional, Union

from encoded_core.types.file import (
    HREF_SCHEMA,
    UNMAPPED_OBJECT_SCHEMA,
    UPLOAD_KEY_SCHEMA,
    File as CoreFile,
)
from encoded_core.file_views import (
    validate_file_filename,
    validate_extra_file_format,
    drs as CoreDRS,
    download as CoreDownload,
    post_upload as CorePostUpload,
    get_upload as CoreGetUpload,
    download_cli as CoreDownloadCli,
)
from snovault import (
    calculated_property,
    display_title_schema,
    load_schema,
    abstract_collection,
)
from snovault.elasticsearch import ELASTIC_SEARCH
from snovault.schema_utils import schema_validator
from snovault.search.search_utils import make_search_subreq
from snovault.util import debug_log, get_item_or_none
from snovault.validators import (
    validate_item_content_post,
    validate_item_content_put,
    validate_item_content_patch,
    validate_item_content_in_place,
    no_validate_item_content_post,
    no_validate_item_content_put,
    no_validate_item_content_patch
)
from snovault.server_defaults import add_last_modified

from . import acl
from .base import (
    Item,
    collection_add,
    item_edit,
    validate_user_submission_consistency
)
from ..item_utils import (
    analyte as analyte_utils,
    file as file_utils,
    item as item_utils,
    sample as sample_utils,
    software as software_utils,
    tissue as tissue_utils,
    sequencing as sequencing_utils
)
from ..item_utils.utils import (
    get_property_value_from_identifier,
    get_property_values_from_identifiers,
    get_unique_values,
    RequestHandler,
)


class CalcPropConstants:

    LIBRARIES_SCHEMA = {
        "title": "Libraries",
        "description": "Libraries associated with the file",
        "type": "array",
        "uniqueItems": True,
        "items": {
            "type": "string",
            "linkTo": "Library",
        },
    }
    SEQUENCINGS_SCHEMA = {
        "title": "Sequencing",
        "description": "Sequencing associated with the file",
        "type": "array",
        "uniqueItems": True,
        "items": {
            "type": "string",
            "linkTo": "Sequencing",
        },
    }
    ASSAYS_SCHEMA = {
        "title": "Assays",
        "description": "Assays associated with the file",
        "type": "array",
        "uniqueItems": True,
        "items": {
            "type": "string",
            "linkTo": "Assay",
        },
    }
    ANALYTES_SCHEMA = {
        "title": "Analytes",
        "description": "Analytes associated with the file",
        "type": "array",
        "uniqueItems": True,
        "items": {
            "type": "string",
            "linkTo": "Analyte",
        },
    }
    SAMPLES_SCHEMA = {
        "title": "Samples",
        "description": "Samples associated with the file",
        "type": "array",
        "uniqueItems": True,
        "items": {
            "type": "string",
            "linkTo": "Sample",
        },
    }
    SAMPLE_SOURCES_SCHEMA = {
        "title": "Sample Sources",
        "description": (
            "Sample sources (e.g. cell lines or tissues) associated with the file"
        ),
        "type": "array",
        "uniqueItems": True,
        "items": {
            "type": "string",
            "linkTo": "Tissue",
        },
    }
    DONORS_SCHEMA = {
        "title": "Donors",
        "description": "Donors associated with the file",
        "type": "array",
        "uniqueItems": True,
        "items": {
            "type": "string",
            "linkTo": "Donor",
        },
    }
    FILE_SUMMARY_ANNOTATED_NAME = "annotated_name"
    FILE_SUMMARY_ACCESS_STATUS = "access_status"
    FILE_SUMMARY_UUID = "uuid"
    FILE_SUMMARY_FILE_FORMAT = "file_format"
    FILE_SUMMARY_FILE_SIZE = "file_size"
    FILE_SUMMARY_MD5SUM = "md5sum"
    FILE_SUMMARY_CONSORTIA = "consortia"
    FILE_SUMMARY_SCHEMA = {
        "title": "File Summary",
        "type": "object",
        "properties": {
            FILE_SUMMARY_ANNOTATED_NAME: {
                "title": "Annotated Name",
                "type": "string",
            },
            FILE_SUMMARY_ACCESS_STATUS : {
                "title": "Access",
                "type": "string",
            },
            FILE_SUMMARY_UUID: {
                "title": "UUID",
                "type": "string",
            },
            FILE_SUMMARY_FILE_FORMAT: {
                "title": "Data Format",
                "type": "string",
            },
            FILE_SUMMARY_FILE_SIZE: {
                "title": "Size",
                "type": "string",
            },
            FILE_SUMMARY_MD5SUM: {
                "title": "MD5 Checksum",
                "type": "string",
            },
            FILE_SUMMARY_CONSORTIA: {
                "title": "Consortium",
                "type": "array",
                "items": {
                    "type": "string",
                },
            },
        },
    }
    DATA_GENERATION_DATA_CATEGORY = "data_category"
    DATA_GENERATION_DATA_TYPE = "data_type"
    DATA_GENERATION_SEQUENCING_CENTER = "sequencing_center"
    DATA_GENERATION_SUBMISSION_CENTERS = "submission_centers"
    DATA_GENERATION_ASSAYS = "assays"
    DATA_GENERATION_SEQUENCING_PLATFORMS = "sequencing_platforms"
    DATA_GENERATION_TARGET_COVERAGE = "target_group_coverage"
    DATA_GENERATION_TARGET_READ_COUNT = "target_read_count"
    DATA_GENERATION_SCHEMA = {
        "title": "Data Generation Summary",
        "description": "Summary of data generation",
        "type": "object",
        "properties": {
            DATA_GENERATION_DATA_CATEGORY: {
                "title": "Data Category",
                "type": "array",
                "items": {
                    "type": "string",
                },
            },
            DATA_GENERATION_DATA_TYPE: {
                "title": "Data Type",
                "type": "array",
                "items": {
                    "type": "string",
                },
            },
            DATA_GENERATION_SEQUENCING_CENTER: {
                "title": "Sequencing Centers",
                "type": "string",
            },
            DATA_GENERATION_SUBMISSION_CENTERS: {
                "title": "Generated By",
                "type": "array",
                "items": {
                    "type": "string",
                },
            },
            DATA_GENERATION_ASSAYS: {
                "title": "Experimental Assay",
                "type": "array",
                "items": {
                    "type": "string",
                },
            },
            DATA_GENERATION_SEQUENCING_PLATFORMS: {
                "title": "Sequencing Platform",
                "type": "array",
                "items": {
                    "type": "string",
                },
            },
            DATA_GENERATION_TARGET_COVERAGE: {
                "title": "Target Group Coverage",
                "type": "array",
                "items": {
                    "type": "string"
                }
            },
            DATA_GENERATION_TARGET_READ_COUNT: {
                "title": "Target Read Count",
                "type": "array",
                "items": {
                    "type": "string"
                }
            }
        },
    }
    RELEASE_TRACKER_DESCRIPTION = {
        "title": "Release Tracker Description",
        "type": "string",
    }
    SAMPLE_SUMMARY_DONOR_IDS = "donor_ids"
    SAMPLE_SUMMARY_TISSUES = "tissues"
    SAMPLE_SUMMARY_SAMPLE_NAMES = "sample_names"
    SAMPLE_SUMMARY_SAMPLE_DESCRIPTIONS = "sample_descriptions"
    SAMPLE_SUMMARY_ANALYTES = "analytes"
    SAMPLE_SUMMARY_STUDIES = "studies"
    SAMPLE_SUMMARY_SCHEMA = {
        "title": "Sample Summary",
        "type": "object",
        "properties": {
            SAMPLE_SUMMARY_DONOR_IDS: {
                "title": "Donor ID",
                "type": "array",
                "items": {
                    "type": "string",
                },
            },
            SAMPLE_SUMMARY_TISSUES: {
                "title": "Tissue",
                "type": "array",
                "items": {
                    "type": "string",
                },
            },
            SAMPLE_SUMMARY_SAMPLE_NAMES: {
                "title": "Sample ID",
                "type": "array",
                "items": {
                    "type": "string",
                },
            },
            SAMPLE_SUMMARY_SAMPLE_DESCRIPTIONS: {
                "title": "Description",
                "type": "array",
                "items": {
                    "type": "string",
                },
            },
            SAMPLE_SUMMARY_ANALYTES: {
                "title": "Analyte",
                "type": "array",
                "items": {
                    "type": "string",
                },
            },
            SAMPLE_SUMMARY_STUDIES: {
                "title": "Study",
                "type": "array",
                "items": {
                    "type": "string",
                },
            },
        },
    }
    ANALYSIS_SUMMARY_SOFTWARE = "software"
    ANALYSIS_SUMMARY_REFERENCE_GENOME = "reference_genome"
    ANALYSIS_SUMMARY_SCHEMA = {
        "title": "Analysis Summary",
        "type": "object",
        "properties": {
            ANALYSIS_SUMMARY_SOFTWARE: {
                "title": "Software",
                "type": "array",
                "items": {
                    "type": "string",
                },
            },
            ANALYSIS_SUMMARY_REFERENCE_GENOME: {
                "title": "Reference Genome",
                "type": "string",
            },
        },
    }



def show_upload_credentials(
    request: Optional[Request] = None,
    context: Optional[str] = None,
    status: Optional[str] = None,
) -> bool:
    if request is None or status not in File.SHOW_UPLOAD_CREDENTIALS_STATUSES:
        return False
    return request.has_permission("edit", context)


def _build_file_embedded_list() -> List[str]:
    """Embeds for search on files."""
    return [
        # Facets + Data generation summary + Link calcprops
        "file_sets.libraries.assay",
        "file_sets.sequencing.sequencer",
        "file_sets.sequencing.target_coverage",
        "file_sets.sequencing.target_read_count",

        # Sample summary + Link calcprops
        "file_sets.libraries.analytes.molecule",
        "file_sets.libraries.analytes.samples.sample_sources.code",
        "file_sets.libraries.analytes.samples.sample_sources.uberon_id"
        "file_sets.libraries.analytes.samples.sample_sources.description",
        "file_sets.libraries.analytes.samples.sample_sources.donor",
        "file_sets.libraries.analytes.samples.sample_sources.cell_line.code",
        "file_sets.libraries.analytes.samples.sample_sources.components.cell_culture.cell_line.code",
        "file_sets.samples.sample_sources.code",
        "file_sets.samples.sample_sources.description",
        "file_sets.samples.sample_sources.donor",

        "quality_metrics.overall_quality_status",
        # For manifest
        "sequencing.sequencer.display_title",

        # Include file groups tags
        "file_sets.file_group.*",

        # Analysis summary
        "software.code",
        "software.title",
        "software.version",

        # For browse search columns
        "donors.display_title",
        "sample_summary.tissues",

        # For facets
        "donors.age",
        "donors.sex"
    ]


@abstract_collection(
    name="files",
    unique_key="submitted_id",  # To permit lookup on submission
    properties={
        "title": "Files",
        "description": "Listing of Files",
    },
)
class File(Item, CoreFile):
    OPEN = 'Open'
    PROTECTED = 'Protected'
    item_type = "file"
    schema = load_schema("encoded:schemas/file.json")
    embedded_list = _build_file_embedded_list()
    rev = {
        "meta_workflow_run_inputs": ("MetaWorkflowRun", "input.files.file"),
        "meta_workflow_run_outputs": ("MetaWorkflowRun", "workflow_runs.output.file"),
    }
    STATUS_TO_CHECK_REVISIONS = [
        'uploading',
        'uploaded',
        'in review',
        'released',
        'restricted',
        'public'
    ]

    Item.SUBMISSION_CENTER_STATUS_ACL.update({
        'uploaded': acl.ALLOW_SUBMISSION_CENTER_MEMBER_EDIT_ACL,
        'uploading': acl.ALLOW_SUBMISSION_CENTER_MEMBER_EDIT_ACL,
        'upload failed': acl.ALLOW_SUBMISSION_CENTER_MEMBER_EDIT_ACL,
        'to be uploaded by workflow': acl.ALLOW_SUBMISSION_CENTER_MEMBER_EDIT_ACL,
        'archived': acl.ALLOW_SUBMISSION_CENTER_MEMBER_VIEW_ACL,
        'retracted': acl.ALLOW_SUBMISSION_CENTER_MEMBER_VIEW_ACL,
    })
    # These are all view only in case we find ourselves in this situation
    Item.CONSORTIUM_STATUS_ACL.update({
        'uploaded': acl.ALLOW_CONSORTIUM_MEMBER_VIEW_ACL,
        'uploading': acl.ALLOW_CONSORTIUM_MEMBER_VIEW_ACL,
        'upload failed': acl.ALLOW_CONSORTIUM_MEMBER_VIEW_ACL,
        'to be uploaded by workflow': acl.ALLOW_CONSORTIUM_MEMBER_VIEW_ACL,
        'archived': acl.ALLOW_CONSORTIUM_MEMBER_VIEW_ACL
    })

    SHOW_UPLOAD_CREDENTIALS_STATUSES = ("in review", "uploading")

    class Collection(Item.Collection):
        pass

    def _update(
        self, properties: Dict[str, Any], sheets: Optional[Dict] = None
    ) -> None:
        add_last_modified(properties)
        return CoreFile._update(self, properties, sheets=sheets)

    @classmethod
    def get_bucket(cls, registry):
        """ Files by default live in the upload bucket, unless they are output files """
        return registry.settings['file_upload_bucket']

    @calculated_property(schema=display_title_schema)
    def display_title(
        self,
        request: Request,
        annotated_filename: Optional[str] = None,
        accession: Optional[str] = None,
        file_format: Optional[str] = None,
    ) -> str:
        if annotated_filename:
            return annotated_filename
        return CoreFile.display_title(self, request, file_format, accession=accession)

    @calculated_property(schema=HREF_SCHEMA)
    def href(
        self,
        request: Request,
        file_format: Optional[str] = None,
        accession: Optional[str] = None,
    ) -> str:
        return CoreFile.href(self, request, file_format, accession=accession)

    @calculated_property(
            schema={
                "title": "Notes to tsv file",
                "description": "Notes that go into the metadata.tsv file",
                "type": "string"
        }
    )
    def tsv_notes(self, request: Request, notes_to_tsv: Union[str, None] = None):
        if notes_to_tsv is None:
            return ''
        else:
            notes_to_tsv_string = ','.join(notes_to_tsv)
        return notes_to_tsv_string

    @calculated_property(
        condition=show_upload_credentials, schema=UNMAPPED_OBJECT_SCHEMA
    )
    def upload_credentials(self) -> Union[str, None]:
        return CoreFile.upload_credentials(self)

    @calculated_property(schema=UPLOAD_KEY_SCHEMA)
    def upload_key(self, request: Request) -> str:
        return CoreFile.upload_key(self, request)

    @calculated_property(schema={
        "title": "File Access Status",
        "description": "Access status for the file contents",
        "type": "string",
        "enum": [
            "Open",
            "Protected"
        ]
    })
    def file_access_status(self, status: str = 'in review') -> Optional[str]:
        if status in ['public', 'released']:
            return self.OPEN
        elif status == 'restricted':
            return self.PROTECTED
        return None

    @calculated_property(
        schema={
            "title": "File Status Tracking",
            "type": "object",
            "properties": {
                "uploading": {
                    "type": "string",
                    "format": "date-time"
                },
                "uploaded": {
                    "type": "string",
                    "format": "date-time"
                },
                "in review": {
                    "type": "string",
                    "format": "date-time"
                },
                "released": {
                    "type": "string",
                    "format": "date-time"
                },
                "released_date": {
                    "type": "string",
                    "format": "date",
                },
                "public": {
                    "type": "string",
                    "format": "date-time"
                },
                "restricted": {
                    "type": "string",
                    "format": "date-time"
                }
            }
        }
    )
    def file_status_tracking(self, request: Request) -> Optional[dict]:
        """ Uses the revision history to generate an object indicating dates the status
            of the file changed - from this we can determine several things:
                1. When metadata for this file was submitted (status = uploading or in review)
                2. When the file was uploaded (status = uploaded)
                3. When the file was released to consortia (status = released)
                4. When the file was made public (status = released)
                5. If protected data, when it was made released (status = restricted)

            To make this reasonably efficient, we assume the following ordering:
                Uploading --> uploaded --> all others
            This way if status = uploading or uploaded, we don't need to request revision history
        """
        # this is a very rare case you can't really trigger under normal conditions
        # only seen in unit tests that force validation errors (test_real_validation_error)
        if 'status' not in self.properties:
            return None

        # ignore reference files
        if self.type_info.name == 'ReferenceFile':
            return None

        # Proceed otherwise
        current_status = self.properties['status']
        if current_status in ['uploading', 'in review']:
            return {
                current_status: self.properties['date_created']
            }
        else:  # we need the revision history
            result = {}
            revision_history = request.embed(f'/{self.uuid}/@@revision-history', as_user='IMPORT')
            for revision in revision_history['revisions']:
                status = revision.get('status')
                if status and status not in result and status in self.STATUS_TO_CHECK_REVISIONS:
                    if status in ['uploading', 'in review']:  # these are initial statuses
                        result[status] = revision['date_created']
                    else:
                        last_modified = revision.get('last_modified')
                        if last_modified:
                            result[status] = last_modified['date_modified']
            if "released" in result:
                result["released_date"] = self.get_date_from_datetime(
                    result["released"]
                )
            return result

    @staticmethod
    def get_date_from_datetime(datetime_str: str) -> str:
        return datetime.fromisoformat(datetime_str).date().isoformat()

    @calculated_property(
        schema={
            "title": "Input to MetaWorkflowRun",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "MetaWorkflowRun",
            },
        }
    )
    def meta_workflow_run_inputs(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "meta_workflow_run_inputs")
        if result:
            return result
        return

    @calculated_property(
        schema={
            "title": "Output of MetaWorkflowRun",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "MetaWorkflowRun",
            },
        }
    )
    def meta_workflow_run_outputs(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "meta_workflow_run_outputs")
        if result:
            return result
        return

    @calculated_property(schema=CalcPropConstants.LIBRARIES_SCHEMA)
    def libraries(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """Get Libraries associated with the file."""
        return self._get_libraries(request, file_sets=file_sets)

    @calculated_property(schema=CalcPropConstants.SEQUENCINGS_SCHEMA)
    def sequencing(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """Get Sequencing items associated with the file."""
        return self._get_sequencing(request, file_sets=file_sets)

    @calculated_property(schema=CalcPropConstants.ASSAYS_SCHEMA)
    def assays(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """Get Assays associated with the file."""
        return self._get_assays(request, file_sets=file_sets)

    @calculated_property(schema=CalcPropConstants.ANALYTES_SCHEMA)
    def analytes(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """Get Analytes associated with the file."""
        return self._get_analytes(request, file_sets=file_sets)

    @calculated_property(schema=CalcPropConstants.SAMPLES_SCHEMA)
    def samples(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """Get Samples associated with the file."""
        return self._get_samples(request, file_sets=file_sets)

    @calculated_property(schema=CalcPropConstants.SAMPLE_SOURCES_SCHEMA)
    def sample_sources(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """Get SampleSources associated with the file."""
        return self._get_sample_sources(request, file_sets=file_sets)

    @calculated_property(schema=CalcPropConstants.DONORS_SCHEMA)
    def donors(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """Get Donors associated with the file."""
        return self._get_donors(request, file_sets=file_sets)

    @calculated_property(schema=CalcPropConstants.FILE_SUMMARY_SCHEMA)
    def file_summary(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[Dict[str, Any], None]:
        """Get file summary for display on file overview page."""
        return self._get_file_summary(request, file_sets=file_sets)

    @calculated_property(schema=CalcPropConstants.DATA_GENERATION_SCHEMA)
    def data_generation_summary(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[Dict[str, Any], None]:
        """Get data generation summary for display on file overview page."""
        return self._get_data_generation_summary(request, file_sets=file_sets)

    @calculated_property(schema=CalcPropConstants.SAMPLE_SUMMARY_SCHEMA)
    def sample_summary(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[Dict[str, Any], None]:
        """Get sample summary for display on file overview page."""
        return self._get_sample_summary(request, file_sets=file_sets)

    @calculated_property(schema=CalcPropConstants.ANALYSIS_SUMMARY_SCHEMA)
    def analysis_summary(
        self,
        request: Request,
        software: Optional[List[str]] = None,
        reference_genome: Optional[str] = None,
    ) -> Union[Dict[str, Any], None]:
        """Get analysis summary for display on file overview page."""
        return self._get_analysis_summary(
            request,
            software=software,
            reference_genome=reference_genome,
        )

    @calculated_property(schema=CalcPropConstants.RELEASE_TRACKER_DESCRIPTION)
    def release_tracker_description(
        self,
        request: Request,
        file_sets: Optional[List[str]] = None
    ) -> Union[str, None]:
        """Get file release tracker description for display on home page."""
        result = None
        if file_sets:
            request_handler = RequestHandler(request=request)
            result = self._get_release_tracker_description(
                request_handler,
                file_properties=self.properties
            )
        return result     

    def _get_libraries(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> List[str]:
        """Get the libraries associated with the file."""
        result = None
        if file_sets:
            request_handler = RequestHandler(request=request)
            result = file_utils.get_libraries(self.properties, request_handler)
        return result or None

    def _get_sequencing(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> List[str]:
        """Get the sequencing associated with the file."""
        result = None
        if file_sets:
            request_handler = RequestHandler(request=request)
            result = file_utils.get_sequencings(self.properties, request_handler)
        return result or None

    def _get_assays(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> List[str]:
        """Get the assays associated with the file."""
        result = None
        if file_sets:
            request_handler = RequestHandler(request=request)
            result = file_utils.get_assays(self.properties, request_handler)
        return result or None

    def _get_analytes(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> List[str]:
        """Get the analytes associated with the file."""
        result = None
        if file_sets:
            request_handler = RequestHandler(request=request)
            result = file_utils.get_analytes(self.properties, request_handler)
        return result or None

    def _get_samples(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> List[str]:
        """Get the samples associated with the file."""
        result = None
        if file_sets:
            request_handler = RequestHandler(request=request)
            result = file_utils.get_samples(self.properties, request_handler)
        return result or None

    def _get_sample_sources(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> List[str]:
        """Get the sample sources associated with the file."""
        result = None
        if file_sets:
            request_handler = RequestHandler(request=request)
            result = file_utils.get_sample_sources(self.properties, request_handler)
        return result or None

    def _get_donors(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> List[str]:
        """Get the donors associated with the file."""
        result = None
        if file_sets:
            request_handler = RequestHandler(request=request)
            result = file_utils.get_donors(self.properties, request_handler)
        return result or None

    def _get_file_summary(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[Dict[str, Any], None]:
        """Get file summary for display on file overview page."""
        request_handler = RequestHandler(request=request)
        result = self._get_file_summary_fields(
            request_handler, self.properties, self.uuid
        )
        return result or None

    def _get_file_summary_fields(
        self,
        request_handler: RequestHandler,
        file_properties: Dict[str, Any],
        uuid: str,
    ) -> Dict[str, Any]:
        """Get file summary properties for display on file overview page."""
        constants = CalcPropConstants
        to_include = {
            constants.FILE_SUMMARY_ANNOTATED_NAME: file_utils.get_annotated_filename(
                file_properties
            ),
            constants.FILE_SUMMARY_ACCESS_STATUS: file_utils.get_access_status(
                file_properties
            ),
            constants.FILE_SUMMARY_FILE_FORMAT: get_property_value_from_identifier(
                request_handler,
                file_utils.get_file_format(file_properties),
                item_utils.get_display_title,
            ),
            constants.FILE_SUMMARY_FILE_SIZE: file_utils.get_file_size(file_properties),
            constants.FILE_SUMMARY_MD5SUM: file_utils.get_md5sum(file_properties),
            constants.FILE_SUMMARY_CONSORTIA: get_property_values_from_identifiers(
                request_handler,
                item_utils.get_consortia(file_properties),
                item_utils.get_display_title,
            ),
            constants.FILE_SUMMARY_UUID: uuid,
        }
        return {
            key: value for key, value in to_include.items() if value
        }

    def _get_data_generation_summary(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[Dict[str, Any], None]:
        """Get data generation summary for display on file overview page."""
        request_handler = RequestHandler(request=request)
        result = self._get_data_generation_summary_fields(
            request_handler, self.properties
        )
        return result or None

    def _get_data_generation_summary_fields(
        self, request_handler: RequestHandler, file_properties: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Get data generation summary for display on file overview page."""
        constants = CalcPropConstants
        to_include = {
            constants.DATA_GENERATION_DATA_CATEGORY: file_utils.get_data_category(
                file_properties
            ),
            constants.DATA_GENERATION_DATA_TYPE: file_utils.get_data_type(
                file_properties
            ),
            constants.DATA_GENERATION_SEQUENCING_CENTER: (
                get_property_value_from_identifier(
                    request_handler,
                    file_utils.get_sequencing_center(file_properties),
                    item_utils.get_display_title,
                )
            ),
            constants.DATA_GENERATION_SUBMISSION_CENTERS: (
                get_property_values_from_identifiers(
                    request_handler,
                    item_utils.get_submission_centers(file_properties),
                    item_utils.get_display_title,
                )
            ),
            constants.DATA_GENERATION_ASSAYS: get_property_values_from_identifiers(
                request_handler,
                file_utils.get_assays(file_properties, request_handler),
                item_utils.get_display_title,
            ),
            constants.DATA_GENERATION_SEQUENCING_PLATFORMS: (
                get_property_values_from_identifiers(
                    request_handler,
                    file_utils.get_sequencers(file_properties, request_handler),
                    item_utils.get_display_title,
                )
            ),
            constants.DATA_GENERATION_TARGET_COVERAGE: (
                self._get_group_coverage(request_handler, file_properties)
            ),
            constants.DATA_GENERATION_TARGET_READ_COUNT: (
                get_property_values_from_identifiers(
                    request_handler,
                    file_utils.get_sequencings(file_properties, request_handler),
                    sequencing_utils.get_target_read_count
                )
            )
        }
        return {
            key: value for key, value in to_include.items() if value
        }
    
    def _get_group_coverage(
        self, request_handler: Request, file_properties: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """"Get group coverage for display on file overview page.
        
        Use override_group_coverage if present, otherwise grab target_coverage from sequencing."""
        if (override_group_coverage := file_utils.get_override_group_coverage(file_properties)):
            return [override_group_coverage]
        return get_property_values_from_identifiers(
            request_handler,
            file_utils.get_sequencings(file_properties, request_handler),
            sequencing_utils.get_target_coverage
        )

    def _get_sample_summary(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[Dict[str, Any], None]:
        """Get sample summary for display on file overview page."""
        result = None
        if file_sets:
            request_handler = RequestHandler(request=request)
            result = self._get_sample_summary_fields(
                request_handler, self.properties
            )
        return result or None

    def _get_sample_summary_fields(
        self, request_handler: RequestHandler, file_properties: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Get sample summary for display on file overview page."""
        constants = CalcPropConstants
        to_include = {
            constants.SAMPLE_SUMMARY_DONOR_IDS: get_property_values_from_identifiers(
                request_handler,
                file_utils.get_donors(file_properties, request_handler),
                item_utils.get_external_id,
            ),
            constants.SAMPLE_SUMMARY_TISSUES: get_property_values_from_identifiers(
                request_handler,
                file_utils.get_tissues(file_properties, request_handler),
                tissue_utils.get_location,
            ),
            constants.SAMPLE_SUMMARY_SAMPLE_NAMES: get_property_values_from_identifiers(
                request_handler,
                file_utils.get_samples(file_properties, request_handler),
                functools.partial(
                    sample_utils.get_sample_names, request_handler=request_handler
                ),
            ),
            constants.SAMPLE_SUMMARY_SAMPLE_DESCRIPTIONS:
                get_property_values_from_identifiers(
                    request_handler,
                    file_utils.get_samples(file_properties, request_handler),
                    functools.partial(
                        sample_utils.get_sample_descriptions,
                        request_handler=request_handler,
                    ),
                ),
            constants.SAMPLE_SUMMARY_STUDIES: get_property_values_from_identifiers(
                request_handler,
                file_utils.get_samples(file_properties, request_handler),
                functools.partial(
                    sample_utils.get_studies, request_handler=request_handler
                ),
            ),
            constants.SAMPLE_SUMMARY_ANALYTES: get_property_values_from_identifiers(
                request_handler,
                file_utils.get_analytes(file_properties, request_handler),
                analyte_utils.get_molecule,
            ),
        }
        return {key: value for key, value in to_include.items() if value}

    def _get_analysis_summary(
        self,
        request: Request,
        software: Optional[List[str]] = None,
        reference_genome: Optional[str] = None,
    ) -> Union[Dict[str, Any], None]:
        """Get analysis summary for display on file overview page."""
        result = None
        if software or reference_genome:
            request_handler = RequestHandler(request=request)
            result = self._get_analysis_summary_fields(
                request_handler, self.properties
            )
        return result or None

    def _get_analysis_summary_fields(
        self, request_handler: RequestHandler, file_properties: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Get analysis summary for display on file overview page."""
        constants = CalcPropConstants
        to_include = {
            constants.ANALYSIS_SUMMARY_SOFTWARE: get_property_values_from_identifiers(
                request_handler,
                file_utils.get_software(file_properties),
                software_utils.get_title_with_version,
            ),
            constants.ANALYSIS_SUMMARY_REFERENCE_GENOME: (
                get_property_value_from_identifier(
                    request_handler,
                    file_utils.get_reference_genome(file_properties),
                    item_utils.get_display_title,
                )
            ),
        }
        return {key: value for key, value in to_include.items() if value}
    
    def _get_release_tracker_description(
            self,
            request_handler: RequestHandler,
            file_properties: Dict[str, Any],
        ) -> Union[str, None]:
        """Get release tracker description for display on the home page."""
        assay_title= get_unique_values(
            request_handler.get_items(file_utils.get_assays(file_properties, request_handler)),
            item_utils.get_display_title,
            )
        sequencer_title = get_unique_values(
            request_handler.get_items(
            file_utils.get_sequencers(file_properties, request_handler)),
            item_utils.get_display_title,
            )
        file_format_title = get_property_value_from_identifier(
                request_handler,
                file_utils.get_file_format(file_properties),
                item_utils.get_display_title,
            )
        if len(assay_title) > 1 or len(sequencer_title) > 1:
            # More than one unique assay or sequencer
            return ""
        elif len(assay_title) == 0 or len(sequencer_title) == 0:
            # No assay or sequencer
            return ""
        to_include = [
            assay_title[0],
            sequencer_title[0],
            file_format_title
        ]
        return " ".join(to_include)


@view_config(name='drs', context=File, request_method='GET',
             permission='view', subpath_segments=[0, 1])
def drs(context, request):
    return CoreDRS(context, request)


@view_config(name='upload', context=File, request_method='GET',
             permission='edit')
@debug_log
def get_upload(context, request):
    return CoreGetUpload(context, request)


@view_config(name='upload', context=File, request_method='POST',
             permission='edit', validators=[schema_validator({"type": "object"})])
@debug_log
def post_upload(context, request):
    return CorePostUpload(context, request)


@view_config(name='download_cli', context=File, permission='view', request_method=['GET'])
@debug_log
def download_cli(context, request):
    """ Creates download credentials for files intended for use with awscli/rclone """
    # 2024-11-05/dmichaels - limit to dbgap users like download
    # Noticeed this endpoint lacked appropriate checking for dbgap
    # group users which should be exactly like the download endpoint.
    if context.properties.get('status') == 'restricted' and not validate_user_has_protected_access(request):
        raise HTTPForbidden('This is a restricted file not available for download_cli without dbGAP approval. '
                            'Please check with DAC/your PI about your status.')
    return CoreDownloadCli(context, request)


def validate_user_has_protected_access(request):
    """ Validates that the user who executed the request context either is
        an admin or has the dbgap group
    """
    principals = request.effective_principals
    if 'group.admin' in principals or 'group.dbgap' in principals:
        return True
    return False


@view_config(name='download', context=File, request_method='GET',
             permission='view', subpath_segments=[0, 1])
def download(context, request):
    if context.properties.get('status') == 'restricted' and not validate_user_has_protected_access(request):
        raise HTTPForbidden('This is a restricted file not available for download without dbGAP approval. '
                            'Please check with DAC/your PI about your status.')
    return CoreDownload(context, request)


# This /files/upload_file_size endpoint was added specifically (2024-08-22) for smaht-submitr to
# determine if a file to upload has already been uploaded, and to get its size as a side-effect,
# to report to the submitter; if the file does not exist then HTTP 404 is returned, otherwise
# HTTP 200 is returned and also its (byte) size, in the "size" element of the returned JSON.
@view_config(name='upload_file_size', context=File, permission='view', request_method=['GET'])
@debug_log
def upload_file_size(context, request):
    if upload_key := context.upload_key(request):
        if not (upload_bucket := request.GET.get("upload_bucket")):
            upload_bucket = request.registry.settings.get("file_upload_bucket")
        if upload_bucket:
            s3 = boto_client("s3")
            try:
                response = s3.head_object(Bucket=upload_bucket, Key=upload_key)
                if isinstance(file_size := response.get("ContentLength", None), int):
                    return {
                        "bucket": upload_bucket,
                        "key": upload_key,
                        "size": file_size
                    }
            except Exception:
                pass
    return Response(status=404)


def validate_processed_file_unique_md5_with_bypass(context, request):
    """ validator to check md5 on output files, unless you tell it not to
        This validator is duplicated from encoded-core because of processed file rename
    """
    # skip validator if not file output
    if context.type_info.item_type != 'output_file':
        return
    data = request.json
    if 'md5sum' not in data or not data['md5sum']:
        return
    if 'force_md5' in request.query_string:
        return
    # we can of course patch / put to ourselves the same md5 we previously had
    if context.properties.get('md5sum') == data['md5sum']:
        return

    if ELASTIC_SEARCH in request.registry:
        search = make_search_subreq(request, '/search/?type=File&md5sum=%s' % data['md5sum'])
        search_resp = request.invoke_subrequest(search, True)
        if search_resp.status_int < 400:
            # already got this md5
            found = search_resp.json['@graph'][0]['accession']
            request.errors.add('body', 'File: non-unique md5sum', 'md5sum %s already exists for accession %s' %
                               (data['md5sum'], found))
    else:  # find it in the database
        conn = request.registry['connection']
        res = conn.get_by_json('md5sum', data['md5sum'], 'output_file')
        if res is not None:
            # md5 already exists
            found = res.properties['accession']
            request.errors.add('body', 'File: non-unique md5sum', 'md5sum %s already exists for accession %s' %
                               (data['md5sum'], found))


def validate_processed_file_produced_from_field(context, request):
    """validator to make sure that the values in the
    produced_from field are valid file identifiers"""
    # skip validator if not file processed
    if context.type_info.item_type != 'output_file':
        return
    data = request.json
    if 'produced_from' not in data:
        return
    files_ok = True
    files2chk = data['produced_from']
    for i, f in enumerate(files2chk):
        try:
            fid = get_item_or_none(request, f, 'files').get('uuid')
        except AttributeError:
            files_ok = False
            request.errors.add('body', 'File: invalid produced_from id', "'%s' not found" % f)
            # bad_files.append(f)
        else:
            if not fid:
                files_ok = False
                request.errors.add('body', 'File: invalid produced_from id', "'%s' not found" % f)

    if files_ok:
        request.validated.update({})


def validate_file_format_validity_for_file_type(context, request):
    """Check if the specified file format (e.g. fastq) is allowed for the file type (e.g. FileFastq).
    """
    data = request.json
    if 'file_format' in data:
        file_format_item = get_item_or_none(request, data['file_format'], 'file-formats')
        if not file_format_item:
            # item level validation will take care of generating the error
            return
        file_format_name = file_format_item['identifier']
        allowed_types = file_format_item.get('valid_item_types', [])
        file_type = context.type_info.name
        if file_type not in allowed_types:
            msg = 'File format {} is not allowed for {}'.format(file_format_name, file_type)
            request.errors.add('body', 'File: invalid format', msg)
        else:
            request.validated.update({})


FILE_ADD_VALIDATORS = [
    validate_item_content_post,
    validate_file_filename,
    validate_extra_file_format,
    validate_file_format_validity_for_file_type,
    validate_processed_file_unique_md5_with_bypass,
    validate_processed_file_produced_from_field,
    validate_user_submission_consistency
]
FILE_ADD_UNVALIDATED_VALIDATORS = [no_validate_item_content_post]


@view_config(
    context=File.Collection,
    permission='add',
    request_method='POST',
    validators=FILE_ADD_VALIDATORS,
)
@view_config(context=File.Collection, permission='add_unvalidated', request_method='POST',
             validators=FILE_ADD_UNVALIDATED_VALIDATORS,
             request_param=['validate=false'])
@debug_log
def file_add(context, request, render=None):
    return collection_add(context, request, render)


COMMON_FILE_EDIT_VALIDATORS = [
     validate_file_filename,
     validate_extra_file_format,
     validate_file_format_validity_for_file_type,
     validate_processed_file_unique_md5_with_bypass,
     validate_processed_file_produced_from_field,
     validate_user_submission_consistency,
]
FILE_EDIT_PUT_VALIDATORS = [validate_item_content_put] + COMMON_FILE_EDIT_VALIDATORS
FILE_EDIT_PATCH_VALIDATORS = [validate_item_content_patch] + COMMON_FILE_EDIT_VALIDATORS
FILE_EDIT_UNVALIDATED_PUT_VALIDATORS = [
    no_validate_item_content_put, validate_user_submission_consistency
]
FILE_EDIT_UNVALIDATED_PATCH_VALIDATORS = [no_validate_item_content_patch]
FILE_INDEX_GET_VALIDATORS = [
    validate_item_content_in_place
] + COMMON_FILE_EDIT_VALIDATORS


@view_config(
    context=File,
    permission='edit',
    request_method='PUT',
    validators=FILE_EDIT_PUT_VALIDATORS,
)
@view_config(
    context=File,
    permission='edit',
    request_method='PATCH',
    validators=FILE_EDIT_PATCH_VALIDATORS,
)
@view_config(
    context=File,
    permission='edit_unvalidated',
    request_method='PUT',
    validators=FILE_EDIT_UNVALIDATED_PUT_VALIDATORS,
    request_param=['validate=false'],
)
@view_config(
    context=File,
    permission='edit_unvalidated',
    request_method='PATCH',
    validators=FILE_EDIT_UNVALIDATED_PATCH_VALIDATORS,
    request_param=['validate=false'],
)
@view_config(
    context=File,
    permission='index',
    request_method='GET',
    validators=FILE_INDEX_GET_VALIDATORS,
    request_param=['check_only=true'],
)
@debug_log
def file_edit(context, request, render=None):
    return item_edit(context, request, render)
