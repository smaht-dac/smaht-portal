from snovault import collection, load_schema, COLLECTIONS, CONNECTION

from .submitted_item import SubmittedItem
from ..schema_formats import is_accession


#### Must add validators for add/edit since 'identifier' path is now lookup_key, not unique_key

# def validate_unique_reference_genome_name(context, request):
#     """validator to ensure reference genome 'identifier' lookup_key is unique"""
#     data = request.json
#     # identifier is required; validate_item_content_post/put/patch will handle missing field
#     if "identifier" in data:
#         lookup_res = request.registry[CONNECTION].storage.get_by_json(
#             "identifier", data["identifier"], "reference_genome"
#         )
#         if lookup_res:
#             # check_only + POST happens on GUI edit; we cannot confirm if found
#             # item is the same item. Let the PATCH take care of validation
#             if request.method == "POST" and request.params.get("check_only", False):
#                 return
#             # editing an item will cause it to find itself. That's okay
#             if (
#                 hasattr(context, "uuid")
#                 and getattr(lookup_res, "uuid", None) == context.uuid
#             ):
#                 return
#             error_msg = (
#                 "Reference Genome %s already exists with name '%s'. This field must be unique"
#                 % (lookup_res.uuid, data["name"])
#             )
#             request.errors.add(
#                 "body", "Reference Genome: non-unique identifier", error_msg
#             )
#             return


def _build_reference_genome_embedded_list():
    """Embeds for search on general files."""
    return []


@collection(
    name="reference-genomes",
    unique_key="submitted_id",
    properties={
        "title": "Reference Genomes",
        "description": "Assembled genomes for sequencing alignment",
    },
)
class ReferenceGenome(SubmittedItem):
    item_type = "reference_genome"
    schema = load_schema("encoded:schemas/reference_genome.json")
    embedded_list = _build_reference_genome_embedded_list()

    def get(self, name, default=None):
        """Override method to allow more lookup keys for ReferenceGenome.

        Base method allows lookup by uuid, accession, and unique key, but other
        unique keys can also be used, such as identifier.
        """
        resource = super(SubmittedItem, self).get(name, None)
        if resource is not None:
            return resource
        if is_accession(name):
            resource = self.connection.get_by_unique_key("accession", name)
            if resource is not None:
                if not self._allow_contained(resource):
                    return default
                return resource
        if "GR" in name or "gr" in name:
            resource = self.connection.get_by_unique_key("identifier", name)
            if resource is not None:
                if not self._allow_contained(resource):
                    return default
                return resource
        if getattr(self, "lookup_key", None) is not None:
            # lookup key translates to query json by key / value and return if only one of the
            # item type was found... so for keys that are mostly unique, but do to whatever
            # reason (bad data mainly..) can be defined as unique keys
            item_type = self.type_info.item_type
            resource = self.connection.get_by_json(self.lookup_key, name, item_type)
            if resource is not None:
                if not self._allow_contained(resource):
                    return default
                return resource
        return default
