'use strict';

import React, { useState, useEffect } from 'react';
import _ from 'underscore';
import { PublicDonorViewDataCards } from './components/donor-overview/PublicDonorViewDataCards';
import DefaultItemView from './DefaultItemView';
import { ShowHideInformationToggle } from './components/file-overview/ShowHideInformationToggle';
import { DonorMetadataDownloadButton } from '../browse/BrowseView';
import DataMatrix from '../viz/Matrix/DataMatrix';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import {
    OverlayTrigger,
    Popover,
    PopoverHeader,
    PopoverBody,
} from 'react-bootstrap';

// Page containing the details of Items of type File
export default class PublicDonorOverview extends DefaultItemView {
    getTabViewContents() {
        const initTabs = [];
        initTabs.push(PublicDonorView.getTabObject(this.props));
        return initTabs.concat(this.getCommonTabs()); // Add remainder of common tabs (Details, Attribution)
    }
}

// Donor Overview's header component containing breadcrumbs and filename
const PublicDonorViewTitle = (props) => {
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

export const renderLoginAccessPopover = () => {
    return (
        <Popover className="popover download-popover login">
            <PopoverHeader as="h3">
                Open Data - Log in to Download
            </PopoverHeader>
            <PopoverBody>
                Login/Create a SMaHT portal account to download open data.
            </PopoverBody>
        </Popover>
    );
};
export const renderProtectedAccessPopover = () => {
    return (
        <Popover className={'popover download-popover protected'}>
            <PopoverHeader as="h3">
                Protected Data - Access Needed
            </PopoverHeader>
            <PopoverBody>
                This data is protected. To download this data, you must apply to
                for access to SMaHT protected data on dbGaP.
            </PopoverBody>
        </Popover>
    );
};

// Donor Manifest button with warning Popover
const PublicDonorDownloadButton = ({ session }) => {
    return (
        <OverlayTrigger
            trigger={['hover', 'focus']}
            placement="top"
            overlay={
                session ? (
                    <Popover className={'popover download-popover coming-soon'}>
                        <PopoverHeader as="h3">
                            Donor Manifest Coming Soon
                        </PopoverHeader>
                        <PopoverBody>
                            Check back with future portal releases for the
                            ability to download the donor manifest.
                        </PopoverBody>
                    </Popover>
                ) : (
                    renderProtectedAccessPopover()
                )
            }>
            <div className="d-flex gap-2 flex-wrap mt-1 mt-xl-0">
                <div className="col-md-auto col-12">
                    <button
                        className="col-md-auto col-12 btn btn-primary btn-sm me-05 align-items-center download-button px-3"
                        disabled>
                        <i className="icon icon-user fas me-1" />
                        Download Donor Manifest
                    </button>
                </div>
            </div>
        </OverlayTrigger>
    );
};

// Header component containing high-level information for the file item
const PublicDonorViewHeader = (props) => {
    const { context = {}, session, title = null } = props;
    const { notes_to_tsv } = context;

    return (
        <div className="view-header">
            <div className="d-flex flex-row align-items-center">
                <div className="d-none d-md-flex">
                    <img src="/static/img/misc-icons/donor_profile.svg" />
                </div>
                <div className="d-flex flex-column flex-grow-1 ms-md-2">
                    <div className="data-group data-row header">
                        {title}
                        <PublicDonorDownloadButton session={session} />
                    </div>
                    <div className="callout d-inline px-3 py-2 mt-1">
                        <i className="icon icon-file-shield fas"></i>{' '}
                        <span>
                            <b>Donor Privacy:</b> Only select info from the
                            donor manifest will be shown on the data portal,
                            download the manifest for complete donor metadata
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
const PublicDonorView = React.memo(function PublicDonorView(props) {
    const { context, session, href } = props;

    const [isLoading, setIsLoading] = useState(true);
    const [statisticValues, setStatisticValues] = useState({
        tissues: context?.tissues?.length || '-',
        assays: null,
        files: null,
    });

    // Load the files from the search URL and calculate statistics
    useEffect(() => {
        // load value from searchUrl if not provided
        setIsLoading(true);
        ajax.load(
            `/search/?type=File&status=released&donors.display_title=${context?.display_title}`,
            (resp) => {
                setStatisticValues({
                    tissues: resp?.facets?.find(
                        (facet) => facet.field === 'sample_summary.tissues'
                    )?.original_terms?.length,
                    assays: resp?.facets?.find(
                        (facet) =>
                            facet.field ===
                            'file_sets.libraries.assay.display_title'
                    )?.original_terms?.length,
                    files: resp?.total,
                });
                setIsLoading(false);
            },
            'GET',
            (error) => {
                console.error('Error loading file search:', error);
                if (error?.total === 0) {
                    // If no files found, set assays and files to 0
                    setStatisticValues({
                        ...statisticValues,
                        assays: 0,
                        files: 0,
                    });
                    setIsLoading(false);
                }
            }
        );
    }, []);

    // Format a title string
    const titleString = (
        <h1 className="header-text fw-semibold">
            {context?.study ?? ''} Donor: {context?.display_title} -{' '}
            {`${context?.sex ?? ''}${
                context?.age ? ', ' + context?.age + ' yrs old' : ''
            }`}
        </h1>
    );

    return (
        <div className="donor-view">
            <PublicDonorViewTitle
                context={context}
                session={session}
                href={href}
                title={titleString}
            />
            <div className="view-content">
                <PublicDonorViewHeader
                    context={context}
                    session={session}
                    title={titleString}
                />
                <PublicDonorViewDataCards
                    context={context}
                    statisticValues={statisticValues}
                    isLoading={isLoading}
                />
                <div className="tabs-container d-flex gap-4 flex-wrap">
                    <div className="matrix-tab tab-card">
                        <div className="header">
                            <span className="title">
                                Assay x Tissue Data Matrix
                            </span>
                        </div>
                        {statisticValues.assays > 0 &&
                        statisticValues.tissues > 0 ? (
                            <div className="body d-flex justify-content-center overflow-scroll">
                                <DataMatrix
                                    key="data-matrix-donor"
                                    query={{
                                        url: `/data_matrix_aggregations/?type=File&status=released&status=public&status=restricted&status=public-restricted&donors.display_title=${context.display_title}&limit=all`,
                                        columnAggFields: [
                                            'file_sets.libraries.assay.display_title',
                                            'sequencing.sequencer.platform',
                                        ],
                                        rowAggFields: [
                                            'donors.display_title',
                                            'sample_summary.tissues',
                                        ],
                                    }}
                                    headerFor={null}
                                    defaultOpen={true}
                                    idLabel="donor"
                                    session={session}
                                    yAxisLabel="Tissue" // Only one donor, so y-axis is Tissue
                                />
                            </div>
                        ) : (
                            <div className="body">
                                <div className="callout-card">
                                    <i className="icon icon-fw icon-2x icon-table-cells fas"></i>
                                    <h4>Assay x Tissue Data Matrix</h4>
                                    <span>
                                        Check back for updates on Assay x Tissue
                                        Data Matrix development with future
                                        portal releases
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="histology-tab tab-card">
                        <div className="header">
                            <span className="title">
                                Tissue Histology Viewer
                            </span>
                        </div>
                        <div className="body">
                            <img
                                className="placeholder"
                                src="/static/img/Tissue Histology Blur.png"></img>
                            <div className="callout-card">
                                <i className="icon icon-lungs fas"></i>
                                <h4>Tissue Histology Browser</h4>
                                <span>
                                    Check back for updates on Tissue Histology
                                    Browser development with future portal
                                    releases
                                </span>
                            </div>
                        </div>
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
PublicDonorView.getTabObject = function (props) {
    return {
        tab: <span>Donor Overview</span>,
        key: 'donor-overview',
        content: <PublicDonorView {...props} />,
    };
};
