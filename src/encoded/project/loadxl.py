from snovault.project.loadxl import SnovaultProjectLoadxl


class SMaHTProjectLoadxl(SnovaultProjectLoadxl):

    order = [
            'access_key',
            'user',
            'consortium',
            'submission_center',
            'file_format',
            'quality_metric',
            'output_file',
            'reference_file',
            'reference_genome',
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
            'ingestion_submission',
            'donor',
            'medical_history',
            'diagnosis',
            'exposure',
            'therapeutic',
            'molecular_test',
            'death_circumstances',
            'tissue_collection',
            'tissue',
            'histology',
            'cell_line',
            'protocol',
            'preparation_kit',
            'treatment',
            'tissue_sample',
            'cell_sample',
            'sample_mixture',
            'sample_preparation',
            'analyte',
            'analyte_preparation',
            'library',
            'library_preparation',
            'sequencing',
            'file_set',
            'unaligned_reads',
            'aligned_reads',
            'variant_calls',
    ]

    def loadxl_order(self):
        """ Defines any hard orderings that must happen when reindexing types """
        return self.order


ITEM_INDEX_ORDER = SMaHTProjectLoadxl.order
