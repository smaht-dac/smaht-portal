'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import memoize from 'memoize-one';
import { compiler } from 'markdown-to-jsx';
import {
    MarkdownHeading,
    TableOfContents,
    NextPreviousPageSection,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/static-pages/TableOfContents';
import {
    console,
    object,
    isServerSide,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { StaticPageBase } from '@hms-dbmi-bgm/shared-portal-components/es/components/static-pages/StaticPageBase';
import { replaceString as replacePlaceholderString } from './placeholders';

/** NOT SHARED */

/**
 * Converts context.content into different format if necessary and returns copy of context with updated 'content'.
 * Currently only converts Markdown content (if a context.content[] item has 'filetype' === 'md'). Others may follow.
 *
 * @param {Object} context - Context provided from back-end, including all properties.
 */
export const parseSectionsContent = memoize(function (context) {
    const { content: contextContent = [] } = context;

    const markdownCompilerOptions = {
        // Override basic header elements with MarkdownHeading to allow it to be picked up by TableOfContents
        overrides: _.object(
            _.map(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], function (type) {
                // => { type : { component, props } }
                return [
                    type,
                    {
                        component: MarkdownHeading,
                        props: { type: type },
                    },
                ];
            })
        ),
    };

    const jsxCompilerOptions = {
        replace: (domNode) => {
            if (
                ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].indexOf(domNode.name) >= 0
            ) {
                const children = _.pluck(domNode.children, 'data');
                const title =
                    TableOfContents.textFromReactChildren(children) || '';
                if (title.replace('-', '').trim().length === 0) {
                    return domNode;
                }
                const props = object.attributesToProps(domNode.attribs);
                return (
                    <MarkdownHeading {...props} type={domNode.name}>
                        {children}
                    </MarkdownHeading>
                );
            } else if (domNode.type === 'tag' && domNode.name === 'pre') {
                const children = _.pluck(domNode.children, 'data');
                const className = domNode.attribs.class;
                return (
                    <div style={{ position: 'relative' }}>
                        <object.CopyWrapper
                            value={children}
                            className={(className || '') + " mt-2"}
                            wrapperElement="pre"
                            whitespace={false}>
                            {children}
                        </object.CopyWrapper>
                    </div>);
            }
        },
    };

    function parse(section) {
        if (
            Array.isArray(section['@type']) &&
            section['@type'].indexOf('StaticSection') > -1
        ) {
            // StaticSection Parsing
            if (
                section.filetype === 'md' &&
                typeof section.content === 'string' &&
                !section.content_as_html
            ) {
                section = _.extend({}, section, {
                    content: compiler(section.content, markdownCompilerOptions),
                });
            } else if (
                (section.filetype === 'html' ||
                    section.filetype === 'rst' ||
                    section.filetype === 'md') &&
                (typeof section.content_as_html === 'string' ||
                    typeof section.content === 'string')
            ) {
                const contentStr =
                    section.filetype === 'md'
                        ? section.content_as_html
                        : section.content_as_html || section.content;
                section = _.extend({}, section, {
                    content: object.htmlToJSX(contentStr, jsxCompilerOptions),
                });
            } // else: retain plaintext or HTML representation
        } else if (
            Array.isArray(section['@type']) &&
            section['@type'].indexOf('JupyterNotebook') > -1
        ) {
            // TODO
        }

        return section;
    }

    if (contextContent.length === 0) {
        throw new Error(
            'No content sections defined for this page, check "content" field.'
        );
    }

    return {
        ...context,
        content: contextContent
            .filter(function (section) {
                const { content, viewconfig, error } = section || {};
                return (content || viewconfig) && !error;
            })
            .map(parse),
    };
});

export const StaticEntryContent = React.memo(function StaticEntryContent(
    props
) {
    const { section, className } = props;
    const { content = null, content_as_html = null, options = {}, filetype = null } = section;
    let renderedContent;

    if (!content) return null;

    // Handle JSX
    if (typeof content === 'string' && filetype === 'jsx') {
        renderedContent = replacePlaceholderString(
            content.trim(),
            _.omit(props, 'className', 'section', 'content')
        );
    } else if (
        typeof content === 'string' &&
        filetype === 'txt' &&
        content.slice(0, 12) === 'placeholder:'
    ) {
        // Deprecated older method - to be removed once data.4dn uses filetype=jsx everywhere w/ placeholder
        renderedContent = replacePlaceholderString(
            content.slice(12).trim(),
            _.omit(props, 'className', 'section', 'content')
        );
    } else {
        renderedContent = content;
    }

    const cls =
        'section-content clearfix ' + (className ? ' ' + className : '');

    return <div className={cls}>{renderedContent}</div>;
});

const CustomWrapper = React.memo(function CustomWrapper({
    tableOfContents = false,
    tocListStyles = ['decimal', 'lower-alpha', 'lower-roman'],
    ...props
}) {
    const { children, title, context, windowWidth } = props;
    const toc =
        (context && context['table-of-contents']) ||
        (tableOfContents && typeof tableOfContents === 'object'
            ? tableOfContents
            : null);
    const pageTitle = title || (context && context.title) || null;
    const tocExists = toc && toc.enabled !== false;

    return (
        <div className="container" id="content">
            <div className="static-page row" key="wrapper">
                {tocExists ? (
                    <div
                        key="toc-wrapper"
                        className="col-12 col-xl-3 order-1 order-xl-3">
                        <TableOfContents
                            pageTitle={pageTitle}
                            fixedGridWidth={3}
                            maxHeaderDepth={toc['header-depth'] || 6}
                            defaultExpanded={true}
                            {..._.pick(
                                props,
                                'navigate',
                                'windowWidth',
                                'windowHeight',
                                'context',
                                'href',
                                'registerWindowOnScrollHandler',
                                'fixedPositionBreakpoint'
                            )}
                            // skipDepth={1} includeTop={toc['include-top-link']} listStyleTypes={['none'].concat((toc && toc['list-styles']) || this.props.tocListStyles)}
                        />
                    </div>
                ) : null}
                <div
                    key="main-column"
                    className={
                        'order-2 col-12 col-xl-' + (tocExists ? '9' : '12')
                    }>
                    {children}
                </div>
                {tocExists ? (
                    <div
                        key="footer-next-prev"
                        className="col-12 d-lg-none order-last">
                        <NextPreviousPageSection
                            context={context}
                            windowInnerWidth={windowWidth}
                        />
                    </div>
                ) : null}
            </div>
        </div>
    );
});

/**
 * This component shows an alert on mount if have been redirected from a different page, and
 * then renders out a list of StaticEntry components within a Wrapper in its render() method.
 * May be used by extending and then overriding the render() method.
 */
export default class StaticPage extends React.PureComponent {
    static Wrapper = CustomWrapper;

    render() {
        return (
            <StaticPageBase
                {...this.props}
                childComponent={StaticEntryContent}
                contentParseFxn={parseSectionsContent}
                fixedPositionBreakpoint={1500}
                CustomWrapper={CustomWrapper}
            />
        );
    }
}
