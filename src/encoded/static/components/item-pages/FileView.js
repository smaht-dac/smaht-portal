'use strict';

import React from 'react';
import url from 'url';
import _ from 'underscore';
import queryString from 'query-string';
import { FileViewDataCards } from './components/file-overview/FileViewDataCards';
import { FileViewTabs } from './components/file-overview/FileViewTabs';
import DefaultItemView from './DefaultItemView';
import { SelectedItemsDownloadButton } from '../static-pages/components/benchmarking/BenchmarkingTable';
import { memoizedUrlParse } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

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

    const breadcrumbs = [
        { display_title: 'Home', href: '/' },
        { display_title: 'Data' },
        { display_title: 'Bechmarking Data' },
        { display_title: context?.dataset?.toUpperCase() || '' },
    ];

    return (
        <div className="file-view-title container-wide">
            <nav className="file-view-title-navigation">
                <ul className="breadcrumb-list">
                    {breadcrumbs.map(({ display_title, href }, i, arr) => {
                        return (
                            <li className="breadcrumb-list-item" key={i}>
                                <a
                                    className={
                                        'breadcrumb-list-item-link' +
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
            <h1 className="file-view-title-text">{context?.display_title}</h1>
        </div>
    );
};

// Header component containing high-level information for the file item
const FileViewHeader = (props) => {
    const { context = {}, session } = props;
    const { accession, status, description } = context;
    const selectedFile = new Map([[context['@id'], context]]);

    return (
        <div className="file-view-header">
            <div className="data-group data-row header">
                <h1 className="header-text">File Overview</h1>
                <SelectedItemsDownloadButton
                    id="download_tsv_multiselect"
                    className="btn btn-primary btn-sm mr-05 align-items-center download-file-button"
                    session={session}
                    selectedItems={selectedFile}
                    disabled={false}
                    analyticsAddItemsToCart>
                    <i className="icon icon-download fas mr-07" />
                    Download File
                </SelectedItemsDownloadButton>
            </div>
            <div className="data-group data-row">
                <div className="datum">
                    <span className="datum-title">File Accession </span>
                    <span className="vertical-divider">|</span>
                    <span>
                        <b className="accession">{accession}</b>
                    </span>
                </div>
                <div className="datum right-group">
                    <div className="status-group" data-status={status}>
                        <i className="icon icon-circle fas"></i>
                        <span className="status">
                            {status?.charAt(0)?.toUpperCase() +
                                status?.substring(1)}
                        </span>
                    </div>
                    <span className="vertical-divider">|</span>
                    <ViewJSONAction href={context['@id']}>
                        <a
                            className="view-json"
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
        </div>
    );
};

/** Top-level component for the File Overview Page */
const FileView = React.memo(function FileView(props) {
    const { context, session, href } = props;
    return (
        <div className="file-view">
            <FileViewTitle context={context} session={session} href={href} />
            <div className="file-view-content">
                <FileViewHeader context={context} session={session} />
                <FileViewDataCards context={context} />
                <FileViewTabs {...props} />
            </div>
        </div>
    );
});

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
