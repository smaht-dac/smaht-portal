from snovault.project.loadxl import SnovaultProjectLoadxl


class SMaHTProjectLoadxl(SnovaultProjectLoadxl):

    order = [
            'access_key',
            'user',
            'consortium',
            'submissionCenter',
            'file_format',
            'quality_metric',
            'output_file',
            'reference_file',
            'software',
            'workflow',
            'workflow_run',
            'meta_workflow',
            'meta_workflow_run',
            'image',
            'document',
            'static_section',
            'page',
            'filter_set',
            'higlass_view_config',
            'ingestion_submission'
    ]

    def loadxl_order(self):
        """ Defines any hard orderings that must happen when reindexing types """
        return self.order


ITEM_INDEX_ORDER = SMaHTProjectLoadxl.order
