from snovault.project.loadxl import SnovaultProjectLoadxl


class SMaHTProjectLoadxl(SnovaultProjectLoadxl):

    order = [
            'AccessKey',
            'User',
            'Consortium',
            'SubmissionCenter',
            'FileFormat',
            'QualityMetric',
            'OutputFile',
            'ReferenceFile',
            'Software',
            'Workflow',
            'WorkflowRun',
            'MetaWorkflow',
            'MetaWorkflowRun',
            'Image',
            'Document',
            'StaticSection',
            'Page',
            'FilterSet',
            'HiglassViewConfig',
            'IngestionSubmission'
    ]

    def loadxl_order(self):
        """ Defines any hard orderings that must happen when reindexing types """
        return self.order


ITEM_INDEX_ORDER = SMaHTProjectLoadxl.order
