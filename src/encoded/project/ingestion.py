import json
from dcicutils.progress_constants import PROGRESS_INGESTER
from snovault.project.ingestion import SnovaultProjectIngestion


class SMaHTProjectIngestion(SnovaultProjectIngestion):
    # Nothing here now. Did have ingestion_submission_schema_file but obsolete
    # with snovault load_schema changes to favor app-specific schema files.

    def note_submit_for_ingestion(self, submission_uuid: str, context):
        # Importing this at the top results in the dreaded errors about app_project not being initialized.
        from encoded.ingestion.ingestion_status_cache import IngestionStatusCache
        ingestion_status = IngestionStatusCache.connection(submission_uuid, context)
        ingestion_status.update({PROGRESS_INGESTER.QUEUED: PROGRESS_INGESTER.NOW()})

    def note_post_ingestion(self, message: dict, context):
        # Example message:
        # {
        #     "MessageId": "f6a54ed2-7452-4478-9558-ffe8984cf004",
        #     "ReceiptHandle": "AQEBnFA5wm6wXi-etcetera",
        #     "MD5OfBody": "717efffebb503df7a3905ffc4d614aa6",
        #     "Body": "{\"ingestion_type\": \"metadata_bundle\", \"uuid\": \"654ac255-0791-4c84-8e71-7be608899cef\",
        #               \"timestamp\": \"2024-03-31T09:49:23.209312\"}"
        # }
        from encoded.ingestion.ingestion_status_cache import IngestionStatusCache
        try:
            message = json.loads(message["Body"])
            submission_uuid = message["uuid"]
            ingestion_status = IngestionStatusCache.connection(submission_uuid, context)
            ingestion_status.update({PROGRESS_INGESTER.QUEUE_CLEANUP: PROGRESS_INGESTER.NOW()})
        except Exception:
            pass
