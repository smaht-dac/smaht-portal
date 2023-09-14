from encoded_core.types.file import File as CoreFile
from snovault import abstract_collection, load_schema

from .base import Item as SMAHTItem


@abstract_collection(
    name='files',
    unique_key='accession',
    properties={
        'title': 'Files',
        'description': 'Listing of Files',
    })
class File(SMAHTItem, CoreFile):
    item_type = 'file'
    schema = load_schema("encoded:schemas/file.json")
