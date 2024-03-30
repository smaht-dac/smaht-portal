from dcicutils.progress_constants import PROGRESS_INGESTER
from snovault.project.ingestion import SnovaultProjectIngestion


class SMaHTProjectIngestion(SnovaultProjectIngestion):
    # Nothing here now. Did have ingestion_submission_schema_file but obsolete
    # with snovault load_schema changes to favor app-specific schema files.

    def note_submit_for_ingestion(self, submission_uuid: str, context):
        # Importing this at the top results in the dreaded errors about app_project not being initialized.
        from encoded.ingestion.ingestion_status_cache import IngestionStatusCache
        ingestion_status = IngestionStatusCache.connection(submission_uuid, context)
        # TODO: Put this string in dciciutils.progress_constants
        ingestion_status.update({"ingester_queued": PROGRESS_INGESTER.NOW())})
