from snovault import collection, load_schema

from .submitted_file import SubmittedFile
from .acl import ALLOW_CONSORTIUM_CREATE_ACL


@collection(
    name="unaligned-reads",
    unique_key="submitted_id",
    properties={
        "title": "Unaligned Reads",
        "description": "Files containing unaligned sequencing reads",
    },
    acl=ALLOW_CONSORTIUM_CREATE_ACL)

class UnalignedReads(SubmittedFile):
    item_type = "unaligned_reads"
    schema = load_schema("encoded:schemas/unaligned_reads.json")
    embedded_list = SubmittedFile.embedded_list
