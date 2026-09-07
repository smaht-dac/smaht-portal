"""Use Debian's dedicated security mirror without changing suites or trust settings."""

import re
from pathlib import Path


SECURITY_MIRROR = re.compile(r'https?://deb\.debian\.org/debian-security(?=[/\s]|$)')


def configure_apt_security(apt_directory=Path('/etc/apt')):
    """Support both legacy sources.list and deb822 .sources configurations."""
    apt_directory = Path(apt_directory)
    sources = [apt_directory / 'sources.list']
    for pattern in ('*.list', '*.sources'):
        sources.extend(sorted((apt_directory / 'sources.list.d').glob(pattern)))
    changed = []
    for source in sources:
        if not source.is_file():
            continue
        original = source.read_text()
        updated = ''.join(
            line if line.lstrip().startswith('#') else SECURITY_MIRROR.sub(
                'https://security.debian.org/debian-security', line)
            for line in original.splitlines(keepends=True)
        )
        if updated != original:
            source.write_text(updated)
            changed.append(source)
    return changed


if __name__ == '__main__':
    configure_apt_security()
