from typing import Any, Dict

from snovault import upgrade_step


@upgrade_step("file_set", "1", "2")
def upgrade_file_set_1_2(value: Dict[str, Any], system: Dict[str, Any]) -> None:
    """Upgrade `libraries` list of linkTos to `library` string linkTo."""
    libraries = value.get("libraries")
    if libraries is not None:
        if libraries:
            value["library"] = libraries[0]
        del value["libraries"]
