'use strict';

import React, { useState, useEffect } from 'react';
import { useToggle } from '../util/hooks';
import DefaultItemView from './DefaultItemView';
import { BrowseSummaryStatController } from '../browse/browse-view/BrowseSummaryStatController';
import url from 'url';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { normalizeQueryValuesForStringify } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/search-filters';
import * as _ from 'underscore';
import { FileOverviewTableController } from './components/file-overview/FileOverviewTable';
import { BasicStaticSectionBody } from '@hms-dbmi-bgm/shared-portal-components/es/components/static-pages/BasicStaticSectionBody';
import { replaceString as placeholderReplacementFxn } from './../static-pages/placeholders';
import { RightArrowIcon } from '../util/icon';

function getStaticContentSection(staticContent, location) {
    if (!Array.isArray(staticContent)) return null;
    const entry = staticContent.find((s) => s.location === location);
    return entry?.content || null;
}

// Page containing the details of Items of type File
export default class PublicationOverview extends DefaultItemView {
    getTabViewContents() {
        const initTabs = [];
        initTabs.push(PublicationView.getTabObject(this.props));
        return initTabs.concat(this.getCommonTabs()); // Add remainder of common tabs (Details, Attribution)
    }
}

// Header component containing high-level information for the file item
const PublicationViewTitle = () => {
    // Default breadcrumbs for the File Overview page
    let breadcrumbs = [
        { display_title: 'Home', href: '/' },
        { display_title: 'Data' },
        { display_title: 'Browse by Publication' },
    ];
    return (
        <div className="view-title container-wide">
            <nav className="view-title-navigation">
                <ul className="breadcrumb-list">
                    {breadcrumbs.map(({ display_title, href }, i, arr) => {
                        return (
                            <li className="breadcrumb-list-item" key={i}>
                                <a
                                    className={
                                        'breadcrumb-list-item-link link-underline-hover' +
                                        (href ? '' : ' no-link')
                                    }
                                    href={href}>
                                    {display_title}
                                </a>
                                {i < arr.length - 1 ? (
                                    <i className="icon icon-fw icon-angle-right fas"></i>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            </nav>
            <h1 className="view-title-text">Publication Overview</h1>
        </div>
    );
};

/**
 * Function to retrive and display summary statistics related to the files used
 * in a publication, including number of files, donors, tissues, assays, and
 * total file size
 * @param {*} doi - DOI of the publication to retrieve stats for
 * @param {*} session - User session object
 * @returns
 */
const PublicationStatViewer = ({ doi, session }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    const searchUrl = doi
        ? `/search/?type=File&doi_list=${doi}&limit=all`
        : null;

    // only re-fetch data when [session] changes
    useEffect(() => {
        if (!loading) setLoading(true);
        if (error) setError(false);

        const callbackFxn = (resp) => {
            setLoading(false);
            setError(false);
            const data = {
                files: resp.total.files,
                donors: resp.total.donors,
                tissues: resp.total.tissues,
                assays: resp.total.assays,
                file_size: resp.total.file_size,
            };
            setData(data);
        };

        const fallbackFxn = () => {
            setLoading(false);
            setError(true);
        };

        const hrefParts = url.parse(searchUrl, true);
        let hrefQuery = normalizeQueryValuesForStringify(
            _.clone(hrefParts.query)
        );
        delete hrefQuery.limit;
        delete hrefQuery.field;

        const requestBody = {
            search_query_params: hrefQuery,
            fields_to_aggregate_for: ['sample_summary.tissues'],
        };

        ajax.load(
            '/bar_plot_aggregations/',
            callbackFxn,
            'POST',
            fallbackFxn,
            JSON.stringify(requestBody),
            {},
            null
        );
    }, [session]);

    const statsProps = { session, loading, error, data };
    return (
        <div className="browse-summary publication-stat-viewer d-flex flex-row mt-2 mb-3 flex-wrap">
            <BrowseSummaryStatController type="File" {...statsProps} />
            <BrowseSummaryStatController type="Donor" {...statsProps} />
            <BrowseSummaryStatController type="Tissue" {...statsProps} />
            <BrowseSummaryStatController type="Assay" {...statsProps} />
            <BrowseSummaryStatController type="File Size" {...statsProps} />
            <a className="" href={searchUrl}>
                <RightArrowIcon fill={'#70A3E2'} />
            </a>
        </div>
    );
};

const PublicationViewTabs = (props) => {
    const { context, session, href, schemas } = props;

    const refSetGenSection = getStaticContentSection(
        context.static_content,
        'reference-set-generation'
    );

    const fileSearchUrl = `/search/?type=File&doi_list=${context?.doi}&limit=all`;
    const tableProps = {
        embeddedTableHeaderText: 'Published Data from this Publication',
        associatedFilesSearchHref: fileSearchUrl,
        schemas,
        session,
        href,
        context,
    };
    return (
        <div className="tabs-container">
            <div className="tab-router">
                <nav className="dot-tab-nav">
                    <div className="dot-tab-nav-list">
                        <button type="button" className="active">
                            <div className="btn-title">
                                Key Supplementary Data
                            </div>
                        </button>
                    </div>
                </nav>
                <div className="tab-router-contents">
                    <div className="content">
                        <h2 className="header">Reference Set Generation</h2>
                        {refSetGenSection && (
                            <div className="description">
                                <BasicStaticSectionBody
                                    content={refSetGenSection.body}
                                    filetype={
                                        refSetGenSection.options?.filetype
                                    }
                                    placeholderReplacementFxn={
                                        placeholderReplacementFxn
                                    }
                                />
                            </div>
                        )}
                        <FileOverviewTableController {...tableProps} />
                    </div>
                </div>
            </div>
        </div>
    );
};

/** Top-level component for the Publication Overview Page */
const PublicationView = React.memo(function PublicationView(props) {
    const { context, session, href } = props;
    const [showFullAuthorList, toggleFullAuthorList] = useToggle(false);

    const keyFindingsSection = getStaticContentSection(
        context.static_content,
        'key-findings'
    );

    const pubYear = context?.date_published?.split('-')[0];
    const doiLink = context?.doi ? `https://doi.org/${context.doi}` : '';
    const doiCode = context?.doi ? context.doi.split('/').pop() : '';
    // shorten the authors list to 10 items and last item
    const shortenedAuthorsList = [...context?.authors.slice(0, 20)];
    const lastAuthor = context?.authors[context?.authors.length - 1];
    const citationString =
        shortenedAuthorsList
            .map((a) => a.last_name + ', ' + a.first_name)
            ?.join(', ') +
        ' ... ' +
        lastAuthor.last_name +
        ', ' +
        lastAuthor.first_name +
        ' (' +
        pubYear +
        '). ' +
        context?.title +
        '. ' +
        context?.journal +
        '. ' +
        doiCode;
    '.' + doiLink;

    const fullAuthorsList = context?.authors
        .map((a) => a.last_name + ', ' + a.first_name)
        ?.join(', ');

    return (
        <div className="publication-view">
            <PublicationViewTitle />
            <div className="view-content">
                <div className="publication-header">
                    {context?.key_image_thumbnail_link && (
                        <img
                            className="thumbnail"
                            src={
                                // context.key_image_thumbnail_link ||
                                'https://placehold.co/180x110'
                            }
                            alt={context.title || 'Publication key figure'}
                        />
                    )}
                    <div className="publication-header-text">
                        <h2 className="title">{context?.display_title}</h2>
                        <div className="details">
                            {context?.short_citation && (
                                <span className="author">
                                    {context.short_citation ||
                                        context.authors[0]}
                                </span>
                            )}
                            {context?.publication_groups?.length > 0 && (
                                <>
                                    <span>|</span>
                                    <span>
                                        {context.publication_groups.join(' · ')}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Publication Citation */}
                <div className="citation-container">
                    <div className="citation-body">
                        <div className="citation-text">
                            <h5>Publication Citation</h5>
                            <span className="citation">{citationString}</span>
                            <button
                                className="author-details-toggle"
                                onClick={toggleFullAuthorList}>
                                <span>
                                    {showFullAuthorList ? 'Hide' : 'Show'} Full
                                    Author List & Details{' '}
                                    <i
                                        className={`icon icon-fw icon-chevron-${
                                            showFullAuthorList ? 'up' : 'down'
                                        }`}></i>
                                </span>
                            </button>
                        </div>
                        <div className="citation-links">
                            <h5>External Links</h5>
                            {context?.journal_url && (
                                <a
                                    className="btn btn-primary"
                                    href={context.journal_url}
                                    target="_blank"
                                    rel="noopener noreferrer">
                                    Journal
                                    <i className="icon icon-external-link-alt fas"></i>
                                </a>
                            )}
                            {context?.repository_urls?.length > 0 && (
                                <a
                                    className="btn btn-primary"
                                    href={context.repository_urls[0]}
                                    target="_blank"
                                    rel="noopener noreferrer">
                                    Code Repository
                                    <i className="icon icon-external-link-alt fas"></i>
                                </a>
                            )}
                        </div>
                    </div>
                    {showFullAuthorList && (
                        <div className="citation-details">
                            <div className="details-container">
                                <div className="full-authors">
                                    <h5>Authors</h5>
                                    <div className="author-list">
                                        {fullAuthorsList}
                                    </div>
                                </div>
                                <div className="journal-details">
                                    <h5>Journal Details</h5>
                                    {context?.journal && (
                                        <span>
                                            Link:{' '}
                                            <a
                                                href={context.journal_url}
                                                target="_blank"
                                                rel="noopener noreferrer">
                                                {context.journal}
                                            </a>
                                        </span>
                                    )}
                                    {doiLink && (
                                        <span>
                                            DOI:{' '}
                                            <a
                                                href={doiLink}
                                                target="_blank"
                                                rel="noopener noreferrer">
                                                {doiLink}
                                            </a>
                                        </span>
                                    )}
                                    {context?.pubmed_id && (
                                        <span>
                                            PMID:{' '}
                                            <a
                                                href={`https://pubmed.ncbi.nlm.nih.gov/${context.pubmed_id}/`}
                                                target="_blank"
                                                rel="noopener noreferrer">
                                                {context?.pubmed_id}
                                            </a>
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Data cards */}
                <div className="data-cards-container">
                    <div className="data-card abstract">
                        <div className="header">
                            <span className="header-text">Abstract</span>
                        </div>
                        <div className="body">
                            <span>{context?.abstract}</span>
                        </div>
                    </div>
                    <div className="data-card findings">
                        <div className="header">
                            <span className="header-text">
                                Key / Novel Findings
                            </span>
                        </div>
                        {keyFindingsSection && (
                            <div className="body">
                                <BasicStaticSectionBody
                                    content={keyFindingsSection.body}
                                    filetype={
                                        keyFindingsSection.options?.filetype
                                    }
                                    placeholderReplacementFxn={
                                        placeholderReplacementFxn
                                    }
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Data Analyzed Section */}
                <h2 className="section-header fw-semibold">Data Analyzed</h2>
                <PublicationStatViewer doi={context?.doi} session={session} />
                <PublicationViewTabs {...props} />
            </div>
        </div>
    );
});

/**
 * Tab object for the FileView component, provides necessary information
 * to parent class, DefaultItemView
 */
PublicationView.getTabObject = function (props) {
    return {
        tab: <span>Publication Overview</span>,
        key: 'publication-overview',
        content: <PublicationView {...props} />,
    };
};
