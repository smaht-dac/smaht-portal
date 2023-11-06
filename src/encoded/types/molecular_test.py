from snovault import collection, load_schema

from .base import Item as SMAHTItem


@collection(
    name="molecular_tests",
    unique_key="molecular_test:submitted_id",
    properties={
        "title": "Molecular Tests",
        "description": "Molecular tests performed on donors",
    })
class MolecularTest(SMAHTItem):
    item_type = "molecular_test"
    schema = load_schema("encoded:schemas/molecular_test.json")
    embedded_list = []
