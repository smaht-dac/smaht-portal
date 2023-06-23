from snovault.project.loadxl import SnovaultProjectLoadxl


class SMaHTProjectLoadxl(SnovaultProjectLoadxl):

    def loadxl_order(self):
        """ Defines any hard orderings that must happen when reindexing types """
        return [
            'AccessKey',
            'User',
            'Consortium',
            'SubmissionCenter',
            'Workflow',
            'WorkflowRun',
            'WorkflowRunAwsem',
            'MetaWorkflow',
            'MetaWorkflowRun',
            'FileFormat',
            'FileSubmitted',
            'FileReference',
            'FileProcessed',
            'Image',
            'Document',
            'QualityMetricGeneric',
            'TrackingItem',
            'Software',
            'StaticSection',
            'Page',
            'FilterSet',
            'HiglassViewConfig',
            'IngestionSubmission'
        ]
