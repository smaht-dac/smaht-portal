from snovault import collection, load_schema

from .acl import ONLY_ADMIN_VIEW_ACL
from .file import File

def _build_output_file_embedded_list():
    """Embeds for search on output files."""
    return File.embedded_list + [
        "reference_genome.display_title",
    ]

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
    embedded_list = _build_output_file_embedded_list()

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
