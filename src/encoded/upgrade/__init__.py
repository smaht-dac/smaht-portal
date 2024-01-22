from encoded_core.upgrade import includeme as core_includeme
from pyramid.config import Configurator


def includeme(config: Configurator) -> None:
    """Include upgrade configuration.

    Scan to ensure upgrade steps found, and include encoded-core
    configuration.
    """
    config.scan()
    core_includeme(config)
