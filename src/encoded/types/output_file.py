from typing import Any, Dict, List, Optional, Union

from pyramid.request import Request
from snovault import calculated_property, collection, load_schema

from .acl import ONLY_ADMIN_VIEW_ACL
from .file import CalcPropConstants, File


@collection(
    name="output-files",
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        "title": "SMaHT Output Files",
        "description": "Listing of SMaHT Output Files",
    },
)
class OutputFile(File):
    item_type = "output_file"
    schema = load_schema("encoded:schemas/output_file.json")
    embedded_list = File.embedded_list

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
        return self._get_data_generation_summary(request, self.properties)

    @calculated_property(schema=CalcPropConstants.SAMPLE_SUMMARY_SCHEMA)
    def sample_summary(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[Dict[str, Any], None]:
        """Get sample summary for display on file overview page."""
        return self._get_sample_summary(request, self.properties)

    # processed files don't want md5 as unique key
    def unique_keys(self, properties):
        keys = super(OutputFile, self).unique_keys(properties)
        if keys.get('alias'):
            keys['alias'] = [k for k in keys['alias'] if not k.startswith('md5:')]
        return keys

    @classmethod
    def get_bucket(cls, registry):
        """ Output files live in the wfoutput bucket """
        return registry.settings['file_wfout_bucket']
