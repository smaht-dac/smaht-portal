"""Semantic regression tests for the Splunk sidecar ``inputs.conf``.

``inputs.conf`` is a machine-consumed declarative artifact read by splunkd, which
is not runnable here, so we parse it into a semantic model (Splunk's conf files
are INI-shaped) and assert the fingerprinting invariant that matters for the app
worker logs.

The app worker stanza monitors ``/var/log/smaht/smaht*.log*`` -- a glob that also
matches the rotated backups ``smahtN.log.1..5``. Fingerprinting such a stanza on
the file path (``crcSalt = <SOURCE>``) makes a rotation ``smaht1.log ->
smaht1.log.1`` look like a brand-new file, so Splunk re-reads it from offset 0 and
re-indexes already-shipped bytes on every rotation. Distinguishing worker logs
that share a header must instead widen the CRC window (``initCrcLength``), which
keeps a rotated file recognizable by its unchanged content.
"""

import configparser
import os

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
INPUTS_CONF = os.path.join(HERE, "..", "inputs.conf")

APP_WORKER_STANZA = "monitor:///var/log/smaht/smaht*.log*"


def _load():
    parser = configparser.ConfigParser(strict=True)
    parser.optionxform = str  # Splunk keys are case-sensitive (initCrcLength, crcSalt)
    with open(INPUTS_CONF) as fh:
        parser.read_file(fh)
    return parser


@pytest.mark.unit
def test_rotated_glob_does_not_path_salt_its_fingerprint():
    parser = _load()
    assert APP_WORKER_STANZA in parser.sections()
    # The trailing `*` is what makes this glob also match rotated backups.
    assert APP_WORKER_STANZA.endswith("*")
    assert parser[APP_WORKER_STANZA].get("crcSalt") != "<SOURCE>", (
        "crcSalt=<SOURCE> keys the fishbucket on the full path; on rotation the "
        "renamed backup looks new and its already-shipped bytes are re-indexed."
    )


@pytest.mark.unit
def test_shared_header_distinguished_by_widened_crc_window():
    parser = _load()
    init_crc = parser[APP_WORKER_STANZA].get("initCrcLength")
    assert init_crc is not None, (
        "worker logs share a header; without a widened initCrcLength Splunk "
        "collides them on the default 256-byte CRC and skips all but one."
    )
    assert int(init_crc) > 256
