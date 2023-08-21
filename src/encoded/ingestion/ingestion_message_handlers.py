import structlog
from snovault.ingestion.ingestion_listener import IngestionListener
from snovault.ingestion.ingestion_message import IngestionMessage
from snovault.ingestion.ingestion_message_handler_decorator import ingestion_message_handler


log = structlog.getLogger(__name__)


def includeme(config):
    pass


@ingestion_message_handler(ingestion_type="metadata_bundle")
def ingestion_message_handler_metadata_bundle(message: IngestionMessage, listener: IngestionListener) -> bool:
    import pdb ; pdb.set_trace()
    xyzzy = 123
    return True
