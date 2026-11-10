"""Optional deployment artifact: python -m encoded.schema_explorer output.json."""
import json
from pathlib import Path
import sys

from . import build_snapshot


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python -m encoded.schema_explorer output.json')
    Path(sys.argv[1]).write_text(json.dumps(build_snapshot(), separators=(',', ':')))
