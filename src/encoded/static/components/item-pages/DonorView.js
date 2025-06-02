'use strict';

import React, { useState, useEffect } from 'react';
import url from 'url';
import _ from 'underscore';
import queryString from 'query-string';
import { DonorViewDataCards } from './components/donor-overview/DonorViewDataCards';
import { FileViewTabs } from './components/file-overview/FileViewTabs';
import DefaultItemView from './DefaultItemView';
import { memoizedUrlParse } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { SelectedItemsDownloadButton } from '../static-pages/components/SelectAllAboveTableComponent';
import { ShowHideInformationToggle } from './components/file-overview/ShowHideInformationToggle';

// Page containing the details of Items of type File
export default class DonorOverview extends DefaultItemView {
    getTabViewContents() {
        const initTabs = [];
        initTabs.push(DonorView.getTabObject(this.props));
        return initTabs.concat(this.getCommonTabs()); // Add remainder of common tabs (Details, Attribution)
    }
}

// Donor Overview's header component containing breadcrumbs and filename
const DonorViewTitle = (props) => {
    const { context } = props;

    const breadcrumbs = [
        { display_title: 'Home', href: '/' },
        { display_title: 'Data' },
        { display_title: 'Browse by Donor' },
        { display_title: context?.dataset?.toUpperCase() || '' },
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
            <h1 className="view-title-text">Donor Overview</h1>
        </div>
    );
};

// Header component containing high-level information for the file item
const DonorViewHeader = (props) => {
    const { context = {}, session, title = null } = props;
    const { accession, status, description, notes_to_tsv } = context;
    const selectedFile = new Map([[context['@id'], context]]);

    return (
        <div className="view-header">
            <div className="d-flex flex-row align-items-center">
                <div className="d-none d-md-flex">
                    <img src="/static/img/misc-icons/donor_profile.svg" />
                </div>
                <div className="d-flex flex-column flex-grow-1 ms-2">
                    <div className="data-group data-row header">
                        {title}
                        <SelectedItemsDownloadButton
                            id="download_tsv_multiselect"
                            className="btn btn-primary btn-sm me-05 align-items-center download-button px-3"
                            session={session}
                            selectedItems={selectedFile}
                            disabled={false}
                            analyticsAddItemsToCart>
                            <i className="icon icon-user fas me-1" />
                            Download Donor Manifest
                        </SelectedItemsDownloadButton>
                    </div>

                    {/* <div className="data-group data-row">
                        <div className="datum">
                            <span className="datum-title">File Accession </span>
                            <span className="vertical-divider">|</span>
                            <span>
                                <b className="accession">{accession}</b>
                            </span>
                        </div>
                        <div className="datum right-group">
                            <div className="status-group">
                                <i
                                    className="status-indicator-dot"
                                    data-status={status}></i>
                                <span className="status">
                                    {capitalizeSentence(status)}
                                </span>
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
                    </div> */}
                    <div className="callout d-inline px-3 py-2 my-3">
                        <i className="icon icon-file-shield fas"></i>{' '}
                        <span>
                            <b>Donor Privacy:</b> Only select info from the
                            donor manifest will be shown on the data portal,
                            download the manifest for complete donor metatadata
                        </span>
                    </div>
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

/** Top-level component for the Donor Overview Page */
const DonorView = React.memo(function DonorView(props) {
    const { context, session, href } = props;

    const titleString = (
        <h1 className="header-text fw-semibold">
            {context?.study ?? ''} Donor: {''}
            {context?.display_title} -{' '}
            {`${context?.sex ?? ''}${
                context?.age ? ', ' + context?.age + ' yrs old' : ''
            }`}
        </h1>
    );

    return (
        <div className="donor-view">
            <DonorViewTitle
                context={context}
                session={session}
                href={href}
                title={titleString}
            />
            <div className="view-content">
                <DonorViewHeader
                    context={context}
                    session={session}
                    title={titleString}
                />
                <DonorViewDataCards context={context} />
                <div className="tabs-container d-flex gap-4">
                    <div className="matrix-tab tab-card">
                        <div className="header">
                            <span className="title">
                                Assay x Tissue Data Matrix
                            </span>
                        </div>
                        <div className="body"></div>
                    </div>
                    <div className="histology-tab tab-card">
                        <div className="header">
                            <span className="title">
                                Tissue Histology Viewer
                            </span>
                        </div>
                        <div className="body"></div>
                    </div>
                </div>
            </div>
        </div>
    );
});

/**
 * Tab object for the FileView component, provides necessary information
 * to parent class, DefaultItemView
 */
DonorView.getTabObject = function (props) {
    return {
        tab: <span>Donor Overview</span>,
        key: 'donor-overview',
        content: <DonorView {...props} />,
    };
};
