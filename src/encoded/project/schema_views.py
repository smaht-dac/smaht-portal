from snovault.project.schema_views import SnovaultProjectSchemaViews

class SMaHTProjectSchemaViews(SnovaultProjectSchemaViews):

    def get_submittable_schema_names(self):
        return []
    
    def get_prop_for_submittable_items(self):
        return 'submitted_id'
    
    def get_properties_for_exclusion(self):
        return ['last_modified', 'date_created', 'submitted_by', 'uuid', 'schema_version']
    
    def get_properties_for_inclusion(self):
        return []
    
    def get_attributes_for_exclusion(self):
        return {'permission':['restricted_fields']}
    
    def get_attributes_for_inclusion(self):
        return {}