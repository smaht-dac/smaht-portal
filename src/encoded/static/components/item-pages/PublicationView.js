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
import { object } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { OverlayTrigger, Popover } from 'react-bootstrap';
import { capitalizeSentence } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/value-transforms';
import {
    formatAuthorName,
    formatAuthorsList,
    formatShortCitationAuthors,
    getPublicationYear,
} from '../util/Schemas';
import { renderLoginAccessPopover } from './PublicDonorView';
import { BROWSE_LINKS } from '../browse/BrowseView';

/**
 * Finds the `static_content` entry for a given `location`, returning its
 * `content` (a StaticSection object) or null if absent or not viewable.
 */
function getStaticContentSection(staticContent, location) {
    if (!Array.isArray(staticContent)) return null;
    const entry = staticContent.find((s) => s.location === location);
    const content = entry?.content;
    if (!content || content.error) return null; // No view permission(s)
    return content;
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
        {
            display_title: 'Browse by Publication',
            href: BROWSE_LINKS['publication'],
        },
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
 * total file size. Donor and Tissue counts are hidden for Benchmarking
 * publications - the underlying data doesn't yet reliably resolve donors or
 * tissues for cell-line-based samples, so those stats are omitted there
 * until that's fixed, rather than shown as inaccurate.
 * @param {*} doi - DOI of the publication to retrieve stats for
 * @param {*} session - User session object
 * @param {*} isBenchmarking - Whether this publication belongs to the
 *     Benchmarking publication group
 * @returns
 */
const PublicationStatViewer = ({ doi, session, isBenchmarking }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    const searchUrl = doi
        ? `/search/?type=File&type!=ExternalOutputFile&doi_list=${doi}`
        : null;

    // re-fetch data when [doi, session] changes
    useEffect(() => {
        if (!searchUrl) {
            setLoading(false);
            return;
        }
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
    }, [doi, session]);

    const statsProps = { session, loading, error, data };

    const filesStatTooltip = (
        <OverlayTrigger
            trigger={['hover', 'focus']}
            placement="top"
            overlay={
                <Popover
                    className="files-access-popover"
                    id="popover-files-access-notice">
                    <Popover.Header>File Access Notice</Popover.Header>
                    <Popover.Body>
                        This publication analyzed data from protected files.
                        <br />
                        <br />
                        {!session &&
                            'Please log in to see complete file list. '}
                        Downloading protected files requires dbGAP approval.
                    </Popover.Body>
                </Popover>
            }>
            <i className="icon icon-info-circle fas ms-1" />
        </OverlayTrigger>
    );

    return (
        <div className="browse-summary publication-stat-viewer mt-2 mb-3">
            <BrowseSummaryStatController
                type="File"
                subtitle="Files Analyzed"
                subtitleAddon={filesStatTooltip}
                {...statsProps}
            />
            {!isBenchmarking && (
                <BrowseSummaryStatController type="Donor" {...statsProps} />
            )}
            {!isBenchmarking && (
                <BrowseSummaryStatController
                    type="Tissue"
                    subtitle="Cell Lines/Tissues"
                    {...statsProps}
                />
            )}
            <BrowseSummaryStatController type="Assay" {...statsProps} />
            <BrowseSummaryStatController type="File Size" {...statsProps} />
            <OverlayTrigger
                trigger={['hover', 'focus']}
                placement="top"
                overlay={!session ? renderLoginAccessPopover() : <></>}>
                <a className="" href={searchUrl}>
                    <span>Browse Data</span>
                    <RightArrowIcon fill={'#70A3E2'} />
                </a>
            </OverlayTrigger>
        </div>
    );
};

const PublicationViewTabs = (props) => {
    const { context, session, href, schemas } = props;

    const refSetGenSection = getStaticContentSection(
        context.static_content,
        'reference-set-generation'
    );

    const fileSearchUrl = `/search/?type=ExternalOutputFile&doi_list=${context?.doi}&limit=all`;

    const customColumns = {
        '@type': {},
        filename: {
            widthMap: { lg: 380, md: 380, sm: 300 },
            colTitle: 'File Name',
            render: function (result) {
                const { '@id': atId, display_title, filename } = result || {};

                return (
                    <span className="value">
                        <a
                            href={atId}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="link-underline-hover">
                            {filename || display_title}
                        </a>
                    </span>
                );
            },
        },
        description: {
            widthMap: { lg: 400, md: 400, sm: 300 },
            colTitle: 'Description',
            colAlignment: 'text-start',
            render: function (result, parentProps) {
                const value = result?.description;
                return (
                    <OverlayTrigger
                        trigger={['hover', 'focus']}
                        placement="top"
                        overlay={
                            <Popover
                                id="popover-description"
                                className="description-definitions-popover">
                                <Popover.Body>{value}</Popover.Body>
                            </Popover>
                        }>
                        <span className="value">{value}</span>
                    </OverlayTrigger>
                );
            },
        },
        data_category: {
            widthMap: { lg: 200, md: 200, sm: 150 },
            colTitle: 'Data Category',
            colAlignment: 'text-start',
            render: function (result, parentProps) {
                const value = result?.data_category?.join(', ');
                return <span className="value">{value}</span>;
            },
        },
        data_type: {
            widthMap: { lg: 130, md: 130, sm: 130 },
            colTitle: 'Data Type',
            colAlignment: 'text-start',
            render: function (result, parentProps) {
                const value = result?.data_type?.join(', ');
                return <span className="value">{value}</span>;
            },
        },
        file_size: {
            colAlignment: 'text-start',
        },
    };

    const customHideColumns = [];

    const tableProps = {
        embeddedTableHeaderText: 'Analysis results published with this paper',
        associatedFilesSearchHref: fileSearchUrl,
        schemas,
        session,
        href,
        context,
        customColumns,
        customHideColumns,
    };

    const shouldShowTable = !context?.tags?.includes('suppress_data_banner');

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
                        {refSetGenSection ? (
                            <>
                                <h2 className="header">
                                    {refSetGenSection?.title ??
                                        'Reference Set Generation'}
                                </h2>
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
                                {shouldShowTable && (
                                    <FileOverviewTableController
                                        {...tableProps}
                                    />
                                )}
                            </>
                        ) : (
                            <div className="no-results">
                                <div className="no-results-content">
                                    <i className="icon icon-file fas"></i>
                                    <h3 className="header">
                                        No Supplementary Data Provided
                                    </h3>
                                    <span className="subheader">
                                        This type of paper does not provide
                                        supplementary data to the SMaHT Data
                                        Portal
                                    </span>
                                </div>
                            </div>
                        )}
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

    const pubYear = getPublicationYear(context?.date_published);
    const doiLink = context?.doi ? `https://doi.org/${context.doi}` : '';
    const doiCode = context?.doi ? context.doi.split('/').pop() : '';
    const authorsList = context?.authors || [];
    const lastAuthor = authorsList[authorsList.length - 1];
    const isAuthorsListTruncated = authorsList.length > 20;
    // shorten the authors list to 20 items when there are more than 20 authors;
    // the last author is appended separately below, so only truncate here to
    // avoid including it twice
    const shortenedAuthorsList = isAuthorsListTruncated
        ? authorsList.slice(0, 20)
        : authorsList;
    const citationString =
        context?.citation ??
        (lastAuthor
            ? formatAuthorsList(shortenedAuthorsList) +
              (isAuthorsListTruncated
                  ? ' ... ' + formatAuthorName(lastAuthor)
                  : '') +
              (pubYear ? ' (' + pubYear + ').' : '.') +
              (context?.title ? ' ' + context.title + '.' : '') +
              (context?.journal ? ' ' + context.journal + '.' : '') +
              (doiCode ? ' ' + doiCode : '')
            : '');

    const fullAuthorsList = formatAuthorsList(authorsList);

    return (
        <div className="publication-view">
            <PublicationViewTitle />
            <div className="view-content">
                <div className="publication-header">
                    {context?.key_image_thumbnail_link ? (
                        <img
                            className="thumbnail"
                            src={context.key_image_thumbnail_link}
                            alt={context.title || 'Publication key figure'}
                        />
                    ) : (
                        <div className="thumbnail thumbnail-placeholder">
                            <i className="icon icon-fw icon-newspaper fas" />
                        </div>
                    )}
                    <div className="publication-header-text">
                        <h2 className="title">{context?.display_title}</h2>
                        <div className="details">
                            {(authorsList.length > 0 ||
                                context?.short_citation) && (
                                <span className="author">
                                    {formatShortCitationAuthors(
                                        authorsList,
                                        context?.short_citation,
                                        pubYear
                                    )}
                                </span>
                            )}
                            {context?.scope && (
                                <div className="scope">
                                    <span>
                                        {context?.working_group_name ?? ''}{' '}
                                        {capitalizeSentence(context.scope)}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Publication Citation */}
                <div className="citation-container">
                    <div className="citation-body">
                        <div className="citation-text">
                            <div className="citation-title">
                                <i className="icon icon-fw icon-quote-left fas"></i>
                                <h5>Publication Citation</h5>
                                <object.CopyWrapper
                                    value={citationString}
                                    wrapperElement="span">
                                    Copy
                                </object.CopyWrapper>
                            </div>
                            <span className="citation">
                                {citationString}
                                {context?.accession === 'SMAPBTYIDADU' && (
                                    <span>. Accepted at Cell Genomics.</span>
                                )}
                                {context?.accession === 'SMAPB7B2PUV5' && (
                                    <span>. Accepted in Cell.</span>
                                )}
                            </span>
                            <button
                                type="button"
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
                            {context?.code_repositories?.length > 0 ? (
                                <a
                                    className="btn btn-primary"
                                    href={context.code_repositories[0]}
                                    target="_blank"
                                    rel="noopener noreferrer">
                                    Code Repository
                                    <i className="icon icon-external-link-alt fas"></i>
                                </a>
                            ) : (
                                <OverlayTrigger
                                    trigger={['hover', 'focus']}
                                    placement="top"
                                    overlay={
                                        <Popover id="popover-code-repository-disabled">
                                            <Popover.Body>
                                                There is no linked repository to
                                                this publication.
                                            </Popover.Body>
                                        </Popover>
                                    }>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        disabled>
                                        Code Repository
                                        <i className="icon icon-external-link-alt fas"></i>
                                    </button>
                                </OverlayTrigger>
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
                                            {context?.journal_url ? (
                                                <a
                                                    href={context.journal_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer">
                                                    {context.journal}
                                                </a>
                                            ) : (
                                                context.journal
                                            )}
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
                    {keyFindingsSection && (
                        <div className="data-card findings">
                            <div className="header">
                                <span className="header-text">
                                    Key / Novel Findings
                                </span>
                            </div>
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
                        </div>
                    )}
                </div>

                {/* Data Analyzed Section */}
                <h2 className="section-header fw-semibold">
                    SMaHT Data Analyzed
                </h2>
                <PublicationStatViewer
                    doi={context?.doi}
                    session={session}
                    isBenchmarking={context?.publication_groups?.includes(
                        'Benchmarking'
                    )}
                />
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
