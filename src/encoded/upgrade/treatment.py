from typing import Any, Dict

from snovault import upgrade_step


@upgrade_step("treatment", "1", "2")
def upgrade_treatment_1_2(
    value: Dict[str, Any], system: Dict[str, Any]
) -> Dict[str, Any]:
    """Change `agent` to `agents` list."""
    agent = value.get("agent")
    if agent:
        value["agents"] = [agent]
        del value["agent"]