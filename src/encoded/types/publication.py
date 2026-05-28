from snovault import collection, load_schema, calculated_property

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import (
    Item,
)


def _name_to_initials(name):
    """Convert a name string to APA dot-separated initials (e.g. 'John Michael' -> 'J. M.')."""
    if not name:
        return ""
    tokens = name.replace(".", " ").split()
    initials = []
    for token in tokens:
        if not token:
            continue
        if len(token) == 1:
            initials.append(token.upper() + ".")
        elif len(token) == 2 and token.isupper():
            # Two run-together initials like "BE" or "JM"
            initials.append(token[0] + ".")
            initials.append(token[1] + ".")
        else:
            initials.append(token[0].upper() + ".")
    return " ".join(initials)


def _format_apa_author(author):
    """Format a single author dict as APA 'Last, F. M.' style."""
    last = author.get("last_name", "").strip()
    first = author.get("first_name", "").strip()
    if not last:
        return ""
    if not first:
        return last
    initials = _name_to_initials(first)
    return f"{last}, {initials}" if initials else last


def _format_apa_author_list(authors):
    """Format an author list per APA 7th edition rules."""
    formatted = [f for f in (_format_apa_author(a) for a in authors) if f]
    n = len(formatted)
    if n == 0:
        return ""
    if n == 1:
        return formatted[0]
    if n <= 20:
        return ", ".join(formatted[:-1]) + ", & " + formatted[-1]
    # 21+ authors: first 19, ellipsis, final author (no ampersand per APA 7th)
    return ", ".join(formatted[:19]) + ", ... " + formatted[-1]


@collection(
    name="publications",
    acl=ONLY_ADMIN_VIEW_ACL,
    unique_key="publication:accession",
    properties={
        "title": "SMaHT Publications",
        "description": "Listing of SMaHT Publications",
    },
)
class Publication(Item):
    item_type = "publication"
    schema = load_schema("encoded:schemas/publication.json")
    embedded_list = []

    @calculated_property(
        schema={
            "title": "Citation",
            "description": "APA-style citation for this publication.",
            "type": "string",
        }
    )
    def citation(
        self,
        authors=None,
        date_published=None,
        title=None,
        journal=None,
        doi=None,
    ):
        parts = []

        if authors:
            author_str = _format_apa_author_list(authors)
            if date_published:
                parts.append(f"{author_str} ({date_published[:4]}).")
            elif author_str:
                parts.append(f"{author_str}.")
        elif date_published:
            parts.append(f"({date_published[:4]}).")

        if title:
            parts.append(f"{title}.")

        if journal:
            parts.append(f"{journal}.")

        if doi:
            parts.append(f"https://doi.org/{doi}")

        return " ".join(parts) if parts else None

    @calculated_property(
        schema={
            "title": "Short Citation",
            "description": "Short string containing <= 2 authors & year published.",
            "type": "string",
        }
    )
    def short_citation(self, authors=None, date_published=None):
        minipub = ""
        if authors:
            first_author = authors[0]
            fa_last = first_author.get("last_name", "")
            if len(authors) == 1:
                minipub = fa_last
            elif len(authors) > 2:
                minipub = fa_last + " et al."
            elif len(authors) == 2:
                minipub = fa_last + " and " + authors[1].get("last_name", "")
        if date_published:
            minipub = minipub + " (" + date_published[0:4] + ")"
        return minipub
    
    
