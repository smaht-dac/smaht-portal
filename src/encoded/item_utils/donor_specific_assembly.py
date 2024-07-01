from typing import List

from .utils import RequestHandler, get_property_value_from_identifier
from .file import get_file_format
from .file_format import get_standard_file_extension

def get_file_format_id(request_handler: RequestHandler,identifier: str):
    """Return identifier of file_format for file."""
    return get_property_value_from_identifier(request_handler,identifier,get_file_format)


def is_fasta_file(request_handler: RequestHandler, identifier: str):
    """Checks if file_format has the fa file extension."""
    format_id = get_file_format_id(request_handler,identifier)
    return get_property_value_from_identifier(request_handler,format_id,get_standard_file_extension) in ["fa","fasta"]


def is_chain_file(request_handler: RequestHandler,identifier: str):
    """Checks if file_format has the chain.gz file extension."""
    format_id = get_file_format_id(request_handler,identifier)
    return get_property_value_from_identifier(request_handler,format_id,get_standard_file_extension) == "chain.gz"


def get_chain_files(request_handler: RequestHandler, files: List[str]=None):
    """Return files with chain.gz file extension."""
    chains=[]
    for file in files:
        if is_chain_file(request_handler,file):
            chains+=[file]
    return chains


def get_sequence_files(request_handler: RequestHandler, files: List[str]=None):
    """Return files with fa file extension."""
    seq_files=[]
    for file in files:
        if is_fasta_file(request_handler,file):
            seq_files+=[file]
    return seq_files