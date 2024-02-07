from snovault.project.loadxl import SnovaultProjectLoadxl


class SMaHTProjectLoadxl(SnovaultProjectLoadxl):

    # N.B. snovault.loadxl expects to get this in snake-case (not camel-case) format.
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
            'tracking_item',
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
            'ontology_term',
            'protocol',
            'donor',
            'demographic',
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
            'cell_culture',
            'cell_culture_mixture',
            'preparation_kit',
            'treatment',
            'sample_preparation',
            'tissue_sample',
            'cell_culture_sample',
            'cell_sample',
            'analyte',
            'analyte_preparation',
            'library',
            'library_preparation',
            'assay',
            'sequencer',
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
