from snovault.project.schema_views import SnovaultProjectSchemaViews


class SMaHTProjectSchemaViews(SnovaultProjectSchemaViews):

    def get_submittable_item_names(self):
        return []

    def get_prop_for_submittable_items(self):
        return 'submitted_id'

    def get_properties_for_exclusion(self):
        return ['accession', 'consortia', 'date_created', 'principals_allowed',
                'schema_version', 'status', 'submission_centers', 'submitted_by', 
                'uuid']

    def get_attributes_for_exclusion(self):
        return {'permission': ['restricted_fields'], 'calculatedProperty': [True]}
