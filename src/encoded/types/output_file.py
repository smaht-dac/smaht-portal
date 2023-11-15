from snovault import collection, load_schema

from .file import File


@collection(
    name="output-files",
    properties={
        "title": "SMaHT Output Files",
        "description": "Listing of SMaHT Output Files",
    },
)
class OutputFile(File):
    item_type = "output_file"
    schema = load_schema("encoded:schemas/output_file.json")
    embedded_list = []

    # processed files don't want md5 as unique key
    def unique_keys(self, properties):
        keys = super(OutputFile, self).unique_keys(properties)
        if keys.get('alias'):
            keys['alias'] = [k for k in keys['alias'] if not k.startswith('md5:')]
        return keys
