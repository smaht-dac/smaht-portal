'use strict';

import React, { useState, useEffect } from 'react';
import url from 'url';
import _ from 'underscore';
import queryString from 'query-string';
import { FileViewDataCards } from './components/file-overview/FileViewDataCards';
import { FileViewTabs } from './components/file-overview/FileViewTabs';
import DefaultItemView from './DefaultItemView';
import { memoizedUrlParse } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { SelectedItemsDownloadButton } from '../static-pages/components/SelectAllAboveTableComponent';
import { ShowHideInformationToggle } from './components/file-overview/ShowHideInformationToggle';
import { capitalizeSentence } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/value-transforms';

import { OverlayTrigger } from 'react-bootstrap';
import {
    renderLoginAccessPopover,
    renderProtectedAccessPopover,
} from './PublicDonorView';
import { useUserDownloadAccess } from '../util/hooks';
import { statusBadgeMap } from './components/file-overview/FileViewDataCards';

import { BROWSE_LINKS } from '../browse/BrowseView';

// Page containing the details of Items of type File
export default class FileOverview extends DefaultItemView {
    getTabViewContents() {
        const initTabs = [];
        initTabs.push(FileView.getTabObject(this.props));
        return initTabs.concat(this.getCommonTabs()); // Add remainder of common tabs (Details, Attribution)
    }
}

/**
 * Decomposes the current file item's [href] and provides an onClick function
 * to [children] for opening the file's raw JSON representation in a new page.
 * @param {string} href the href of the file item being viewed
 * @returns {JSX.Element}
 */
function ViewJSONAction({ href = '', children }) {
    const urlParts = _.clone(memoizedUrlParse(href));
    urlParts.search =
        '?' +
        queryString.stringify(_.extend({}, urlParts.query, { format: 'json' }));
    const viewUrl = url.format(urlParts);
    const onClick = (e) => {
        if (window && window.open) {
            e.preventDefault();
            window.open(
                viewUrl,
                'window',
                'toolbar=no, menubar=no, resizable=yes, status=no, top=10, width=400'
            );
        }
    };
    return React.cloneElement(children, { onClick });
}

// File Overview's header component containing breadcrumbs and filename
const FileViewTitle = (props) => {
    const { context } = props;

    // Default breadcrumbs for the File Overview page
    let breadcrumbs = [
        { display_title: 'Home', href: '/' },
        { display_title: 'Data' },
    ];

    // Determine the current breadcrumb based on the studies associated with the file
    const currentBreadcrumb = {
        display_title: null,
        href: null,
    };

    if (
        context?.sample_summary?.studies?.some(
            (study) => study.toLowerCase() === 'production'
        )
    ) {
        currentBreadcrumb.display_title = 'Browse by File';
        currentBreadcrumb.href = BROWSE_LINKS.file;
        breadcrumbs = [...breadcrumbs, currentBreadcrumb];
    } else if (
        context?.sample_summary?.studies?.some(
            (study) => study.toLowerCase() === 'benchmarking'
        )
    ) {
        currentBreadcrumb.display_title = 'Benchmarking Data';
        breadcrumbs = [...breadcrumbs, currentBreadcrumb];
    }

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
            <h1 className="view-title-text">{context?.display_title}</h1>
        </div>
    );
};

// Header component containing high-level information for the file item
const FileViewHeader = (props) => {
    const { context = {}, session, userDownloadAccess } = props;
    const {
        accession,
        status,
        description,
        notes_to_tsv,
        retraction_reason = '',
        release_tracker_description = '',
        release_tracker_title = '',
    } = context;
    const selectedFile = new Map([[context['@id'], context]]);

    // Accessions of files whose alert banners are rendered differently
    const accessionsOfInterest = ['SMAFIB6EQLZM'];

    // Prepare a message string for the retracted warning banner
    let retractedWarningMessage = '';
    if (!accessionsOfInterest.includes(accession) && status === 'retracted') {
        const title = release_tracker_title
            ? ' ' + `from ${release_tracker_title}`
            : '';
        const description =
            release_tracker_description ||
            `${context?.file_format?.display_title} file`;

        const retraction = retraction_reason ? (
            <>
                was retracted due to <b>{retraction_reason}</b>
            </>
        ) : (
            'was retracted'
        );

        const replacement = context?.replaced_by ? (
            <>
                The replacement is made {''}
                <a
                    href={context?.replaced_by?.['@id']}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="link-underline-hover">
                    available here
                </a>
                .
            </>
        ) : (
            ''
        );

        retractedWarningMessage = (
            <>
                This {description}
                {title} {retraction}. {replacement}
            </>
        );
    }

    const { statusTitle = capitalizeSentence(status), badge = null } =
        statusBadgeMap?.[status] || {};

    return (
        <div className="file-view-header">
            <div className="data-group data-row header">
                <h1 className="header-text">File Overview</h1>
                {session && userDownloadAccess?.[status] ? (
                    <SelectedItemsDownloadButton
                        id="download_tsv_multiselect"
                        className="btn btn-primary btn-sm me-05 align-items-center"
                        session={session}
                        selectedItems={selectedFile}
                        disabled={false}
                        analyticsAddItemsToCart>
                        <i className="icon icon-download fas me-07" />
                        Download File
                    </SelectedItemsDownloadButton>
                ) : (
                    <OverlayTrigger
                        trigger={['hover', 'focus']}
                        placement="top"
                        overlay={
                            status === 'open'
                                ? renderLoginAccessPopover()
                                : renderProtectedAccessPopover()
                        }>
                        <button
                            className="download-button btn btn-primary btn-sm me-05 align-items-center pe-auto "
                            disabled={true}>
                            <i className="icon icon-download fas me-03" />
                            Download File
                        </button>
                    </OverlayTrigger>
                )}
            </div>

            {!accessionsOfInterest.includes(accession) &&
            status === 'retracted' ? (
                <div className="callout warning mt-2 mb-1">
                    <p className="callout-text">
                        <span className="flag">Attention: </span>
                        {retractedWarningMessage}
                    </p>
                </div>
            ) : null}

            {accessionsOfInterest.includes(accession) ? (
                <div className="callout warning mt-2 mb-1">
                    <p className="callout-text">
                        <span className="flag">Attention: </span> The{' '}
                        <a
                            href="/SMAFI557D2E7"
                            target="_blank"
                            rel="noreferrer noopener"
                            className="link-underline-hover">
                            original BAM file
                        </a>{' '}
                        of COLO829-T standard ONT WGS data{' '}
                        <strong>
                            was retracted due to missing methylation tags
                        </strong>
                        . The replacement file with proper tags is made{' '}
                        <a
                            href="/SMAFIB6EQLZM"
                            target="_blank"
                            rel="noreferrer noopener"
                            className="link-underline-hover">
                            available here.
                        </a>
                    </p>
                </div>
            ) : null}

            <div className="data-group data-row">
                <div className="datum">
                    <span className="datum-title">File Accession </span>
                    <span className="vertical-divider">|</span>
                    <span>
                        <b className="accession">{accession}</b>
                    </span>
                </div>
                <div className="datum right-group">
                    <div className="status-group">
                        <div className={`file-status ${status}`}>
                            <i
                                className="status-indicator-dot me-07"
                                data-status={status}
                            />
                            {statusTitle ?? status}
                            {badge && (
                                <span className={`ms-1 badge ${status}`}>
                                    {badge}
                                </span>
                            )}
                        </div>
                    </div>
                    <span className="vertical-divider">|</span>
                    <ViewJSONAction href={context['@id']}>
                        <a
                            className="view-json link-underline-hover"
                            aria-label="Open JSON code in new tab"
                            tabIndex="0">
                            <i className="icon icon-file-code far"></i>
                            <span>View JSON</span>
                        </a>
                    </ViewJSONAction>
                </div>
            </div>
            <div className="data-group data-row">
                <div className="datum description">
                    <span className="datum-title">Description </span>
                    <span className="vertical-divider">|</span>
                    <span
                        className={
                            'datum-value' + (description ? '' : ' text-gray')
                        }>
                        {description || 'Coming Soon'}
                    </span>
                </div>
            </div>
            {notes_to_tsv && notes_to_tsv.length > 0 ? (
                <div className="data-group data-row">
                    <div className="datum description">
                        <span className="datum-title">Notes </span>
                        <span className="vertical-divider">|</span>
                        <ShowHideInformationToggle
                            id="show-hide-tsv-notes"
                            useToggle={notes_to_tsv.length > 1}>
                            <ul className="list-unstyled">
                                {notes_to_tsv.map((note, i) => (
                                    <li
                                        key={note}
                                        className={
                                            'datum-value-notes-to-tsv text-gray ' +
                                            (i > 0 ? 'mt-1' : '')
                                        }>
                                        {note.substring(0, 1).toUpperCase() +
                                            note.substring(1)}
                                    </li>
                                ))}
                            </ul>
                        </ShowHideInformationToggle>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

/** Top-level component for the File Overview Page */
const FileView = (props) => {
    const { context, session, href } = props;
    const { userDownloadAccess } = useUserDownloadAccess(session);

    return (
        <div className="file-view">
            <FileViewTitle context={context} session={session} href={href} />
            <div className="view-content">
                <FileViewHeader
                    context={context}
                    session={session}
                    userDownloadAccess={userDownloadAccess}
                />
                <FileViewDataCards context={context} />
                <FileViewTabs {...props} />
            </div>
        </div>
    );
};

/**
 * Tab object for the FileView component, provides necessary information
 * to parent class, DefaultItemView
 */
FileView.getTabObject = function (props) {
    return {
        tab: <span>File Overview</span>,
        key: 'file-overview',
        content: <FileView {...props} />,
    };
};
