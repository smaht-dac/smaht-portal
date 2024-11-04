import markdown
import re
from docutils.core import publish_parts
from bs4 import BeautifulSoup

from typing import Any, Dict, Optional

from snovault import abstract_collection, Item as SnovaultItem, load_schema, calculated_property
from snovault.server_defaults import add_last_modified
from encoded_core.types.user_content import UserContent as CoreUserContent

from .base import Item


@abstract_collection(
    name='user-contents',
    properties={
        'title': 'User Content',
        'description': 'User content for the Portal',
    })
class UserContent(Item, CoreUserContent):
    item_type = 'user_content'
    schema = load_schema("encoded:schemas/user_content.json")
    embedded_list = []

    def _update(self, properties: Dict[str, Any], sheets: Optional[Dict] = None) -> None:
        add_last_modified(properties)
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
            # html header: range <h1> to <h6>
            initial_header_level = options.get('initial_header_level', 2) if options is not None else 4
            settings_overrides = {
                'doctitle_xform': False,
                'initial_header_level': initial_header_level
            }
            parts = publish_parts(content, writer_name='html', settings_overrides=settings_overrides)
            
            output = post_process_rst_html(parts["html_body"])
            if convert_ext_links:
                return convert_external_links(output, request.domain)
            return output
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
                reference_domain_lower == 'staging.smaht.org' and match_domain_lower == 'data.smaht.org'):
            external_link = re.sub(r'<a(?P<in_a>[^>]+)>(?P<in_link>[^<]+)</a>',
                                   r'<a\g<in_a> target="_blank" rel="noopener noreferrer">\g<in_link></a>', match[0])
            content = content.replace(match[0], external_link)

    return content


def post_process_rst_html(raw_html):
    # Parse the HTML content with BeautifulSoup
    soup = BeautifulSoup(raw_html, 'html.parser')

    # rename default wrapper class
    document_div = soup.find('div', class_='document')
    if document_div:
        document_div['class'] = ['rst-container']

    # Find all div elements with class="section" and unwrap them
    section_divs = soup.find_all('div', class_='section')
    for section_div in section_divs:
        section_div.unwrap()

    # Find all <tt> tags and convert to <code>
    tt_tags = soup.find_all('tt')
    for tt_tag in tt_tags:
        code_tag = soup.new_tag('code')
        if tt_tag.string:
            code_tag.string = tt_tag.string
        tt_tag.replace_with(code_tag)

    output = str(soup)
    
    # Find all <pre> tags with their attributes and content
    pre_matches = re.findall(r'<pre.*?>(.*?)</pre>', output, re.DOTALL)

    # Replace '\n' outside of <pre> tags with an empty string
    output = re.sub(r'(<pre.*?>.*?</pre>)|(\n)', lambda match: match.group(1) or '', output, flags=re.DOTALL)

    # Restore the original content within <pre> tags
    for pre_match in pre_matches:
        output = output.replace(f'<pre>{pre_match}</pre>', f'<pre>{pre_match}</pre>')

    return output
