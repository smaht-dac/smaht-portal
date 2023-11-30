import markdown
import re
from docutils.core import publish_parts

from typing import Any, Dict, Optional

from snovault import abstract_collection, Item as SnovaultItem, load_schema, calculated_property
from encoded_core.types.user_content import UserContent as CoreUserContent

from .base import Item as SMAHTItem


@abstract_collection(
    name='user-contents',
    properties={
        'title': 'User Content',
        'description': 'User content for the Portal',
    })
class UserContent(SMAHTItem, CoreUserContent):
    item_type = 'user_content'
    schema = load_schema("encoded:schemas/user_content.json")
    embedded_list = []

    def _update(self, properties: Dict[str, Any], sheets: Optional[Dict] = None) -> None:
        return SnovaultItem._update(self, properties, sheets=sheets)

    @calculated_property(schema={
        "title": "Content as HTML",
        "description": "Convert RST, HTML and MD content into HTML",
        "type": "string"
    })
    def content_as_html(self, request, body=None, file=None, options=None):
        content = self.content(request, body, file)
        if not content:
            return None

        file_type = self.filetype(request, body, file, options)
        convert_ext_links = request and request.domain and options and options.get('convert_ext_links', True)

        if file_type == 'rst':
            output = publish_parts(content, writer_name='html')
            if convert_ext_links:
                return convert_external_links(output["html_body"], request.domain)
            return output["html_body"]
        elif file_type == 'html':
            if convert_ext_links:
                return convert_external_links(content, request.domain)
        elif file_type == 'md':
            # remove new line character
            output = convert_markdown_to_html(content)
            # output = output.replace('\n', '')
            if output and convert_ext_links:
                return convert_external_links(output, request.domain)
            return output
        return None


def convert_markdown_to_html(markdown_text, custom_wrapper='div'):
    # convert markdown to html including tables
    html_output = markdown.markdown(markdown_text, extensions=['tables', 'fenced_code'])

    # check content has any header, if yes wrap it with custom tag
    header_pattern = re.compile(r'<h[1-6]>.*?<\/h[1-6]>', re.IGNORECASE)
    if header_pattern.search(html_output):
        html_output = f'<{custom_wrapper}>{html_output}</{custom_wrapper}>'

    return html_output


def convert_external_links(content, reference_domain):
    """
    Seeks hyperlinks within string content and adds 'target="_blank"' and 'rel="noopener noreferrer"' attributes for external links.
    """
    reference_domain_lower = reference_domain.casefold()
    matches = re.findall(r"(<a[^>]*href=[\"\']https?://(?P<domain>[\w\-\.]+)(?:\S*)[\"\'][^>]*>[^<]+</a>)", content,
                         re.DOTALL)

    for match in matches:
        match_domain_lower = match[1].casefold()
        # compares the found links with domain (we have a special condition to check staging/data indexing)
        # todo: replace hard-coded domain names with env. variables etc.
        if (reference_domain_lower != match_domain_lower) and not (
                reference_domain_lower == 'staging.4dnucleome.org' and match_domain_lower == 'data.4dnucleome.org'):
            external_link = re.sub(r'<a(?P<in_a>[^>]+)>(?P<in_link>[^<]+)</a>',
                                   r'<a\g<in_a> target="_blank" rel="noopener noreferrer">\g<in_link></a>', match[0])
            content = content.replace(match[0], external_link)

    return content
