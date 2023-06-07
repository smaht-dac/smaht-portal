from snovault.project.loadxl import SnovaultProjectLoadxl


class SMaHTProjectLoadxl(SnovaultProjectLoadxl):

    def loadxl_order(self):
        """ Defines any hard orderings that must happen when reindexing types """
        return [
            'user',
            'consortium',
            'submission_center'
        ]
