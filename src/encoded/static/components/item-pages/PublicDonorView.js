'use strict';

import React, { useState, useEffect } from 'react';
import _ from 'underscore';
import { PublicDonorViewDataCards } from './components/donor-overview/PublicDonorViewDataCards';
import DefaultItemView from './DefaultItemView';
import { ShowHideInformationToggle } from './components/file-overview/ShowHideInformationToggle';
import { DonorMetadataDownloadButton } from '../browse/BrowseView';
import DataMatrix from '../static-pages/components/matrix/DataMatrix';
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

// Donor Manifest button with warning Popover
const PublicDonorDownloadButton = () => {
    return (
        <OverlayTrigger
            trigger="hover"
            placement="top"
            overlay={
                <Popover className="public-donor-download-popover">
                    <PopoverHeader as="h3">Data Access Needed</PopoverHeader>
                    <PopoverBody>
                        This data is protected. To download this data, you must
                        apply for dbGAP access.
                    </PopoverBody>
                </Popover>
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
                        <PublicDonorDownloadButton />
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
    const [isLoading, setIsLoading] = useState(true);
    const [statisticValues, setStatisticValues] = useState({
        tissues: context?.tissues?.length || '-',
        assays: null,
        files: null,
    });

    const { context, session, href } = props;

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
            {context?.study ?? ''} Donor: {''}
            {context?.display_title} -{' '}
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
                                    query={{
                                        url: `/data_matrix_aggregations?type=File&limit=all&status=released&donors.display_title=${context.display_title}`,
                                        columnAggFields: [
                                            'file_sets.libraries.assay.display_title',
                                            'sequencing.sequencer.platform',
                                        ],
                                        rowAggFields: [
                                            'donors.display_title',
                                            'sample_summary.tissues',
                                        ],
                                    }}
                                    valueChangeMap={{
                                        assay: {
                                            'scDip-C - Illumina': 'scDip-C',
                                            'CompDuplex-seq - Illumina':
                                                'CompDuplex-Seq',
                                            'Kinnex - PacBio': 'Kinnex',
                                            'Fiber-seq - Illumina': 'Fiber-Seq',
                                            'Fiber-seq - PacBio': 'Fiber-Seq',
                                            'Fiber-seq - ONT': 'Fiber-Seq',
                                            'RNA-seq - Illumina':
                                                'RNA-Seq - Illumina',
                                            'NanoSeq - Illumina': 'NanoSeq',
                                            'ATAC-seq - Illumina': 'ATAC-Seq',
                                            'varCUT&Tag - Illumina':
                                                'varCUT&Tag',
                                            'VISTA-seq - Illumina': 'VISTA-Seq',
                                            'scVISTA-seq - Illumina':
                                                'VISTA-Seq',
                                            'Microbulk VISTA-seq - Illumina':
                                                'VISTA-Seq',
                                            'CODEC - Illumina': 'CODEC',
                                            'Single-cell MALBAC WGS - ONT':
                                                'MALBAC-amplified WGS',
                                            'Single-cell MALBAC WGS - Illumina':
                                                'MALBAC-amplified WGS',
                                            'Single-cell PTA WGS - ONT':
                                                'PTA-amplified WGS',
                                            'Single-cell PTA WGS - Illumina':
                                                'PTA-amplified WGS',
                                            'TEnCATS - ONT': 'TEnCATS',
                                            'WGS - ONT': 'WGS - Standard ONT',
                                            'Ultra-Long WGS - ONT':
                                                'WGS - UltraLong ONT',
                                            'HiDEF-seq - Illumina': 'HiDEF-seq',
                                            'HiDEF-seq - PacBio': 'HiDEF-seq',
                                            'Hi-C - Illumina': 'Hi-C',
                                            'Hi-C - PacBio': 'Hi-C',
                                            'Hi-C - ONT': 'Hi-C',
                                        },
                                        tissue: {
                                            'endocrine pancreas':
                                                'Endocrine pancreas',
                                        },
                                    }}
                                    fieldChangeMap={{
                                        assay: 'file_sets.libraries.assay.display_title',
                                        donor: 'donors.display_title',
                                        tissue: 'sample_summary.tissues',
                                        platform:
                                            'sequencing.sequencer.platform',
                                        data_type: 'data_type',
                                        file_format:
                                            'file_format.display_title',
                                        data_category: 'data_category',
                                        software: 'software.display_title',
                                        study: 'sample_summary.studies',
                                    }}
                                    resultPostProcessFuncKey={null}
                                    groupingProperties={['donor', 'tissue']}
                                    columnGrouping="assay"
                                    headerFor={null}
                                    fallbackNameForBlankField="None"
                                    statePrioritizationForGroups={[]}
                                    headerPadding={200}
                                    titleMap={{}}
                                    columnSubGroupingOrder={[]}
                                    colorRangeBaseColor="#47adff"
                                    colorRangeSegments={5}
                                    colorRangeSegmentStep={20}
                                    summaryBackgroundColor="#9ea0ff"
                                    allowedFields={[
                                        'donors.display_title',
                                        'sequencing.sequencer.display_title',
                                        'file_sets.libraries.assay.display_title',
                                        'sample_summary.tissues',
                                        'data_type',
                                        'file_format.display_title',
                                        'data_category',
                                        'software.display_title',
                                        'sequencing.sequencer.platform',
                                        'sample_summary.studies',
                                        'dataset',
                                    ]}
                                    columnGroups={{
                                        'Bulk WGS': {
                                            values: [
                                                'WGS - Illumina',
                                                'WGS - PacBio',
                                                'Fiber-Seq',
                                                'WGS - Standard ONT',
                                                'WGS - UltraLong ONT',
                                            ],
                                            backgroundColor: '#e04141',
                                            textColor: '#ffffff',
                                            shortName: 'WGS',
                                        },
                                        'Single-cell WGS': {
                                            values: [
                                                'PTA-amplified WGS',
                                                'MALBAC-amplified WGS',
                                                'WGS DLP+',
                                            ],
                                            backgroundColor: '#aac536',
                                            textColor: '#ffffff',
                                            shortName: 'scWGS',
                                        },
                                        'RNA-seq': {
                                            values: [
                                                'RNA-Seq - Illumina',
                                                'Kinnex',
                                            ],
                                            backgroundColor: '#ad48ad',
                                            textColor: '#ffffff',
                                            shortName: 'RNA',
                                        },
                                        'Duplex-seq': {
                                            values: [
                                                'NanoSeq',
                                                'CODEC',
                                                'ppmSeq',
                                                'VISTA-Seq',
                                                'CompDuplex-Seq',
                                                'HiDEF-Seq',
                                            ],
                                            backgroundColor: '#2b4792',
                                            textColor: '#ffffff',
                                            shortName: 'Dupl',
                                        },
                                        'Targeted Seq': {
                                            values: [
                                                'HAT-Seq',
                                                'L1-ONT',
                                                'TEnCATS',
                                            ],
                                            backgroundColor: '#e1d567',
                                            textColor: '#ffffff',
                                            shortName: 'Tgtd',
                                        },
                                        'Single-cell RNA-Seq': {
                                            values: [
                                                'snRNA-Seq',
                                                'Slide-tags snRNA-Seq',
                                                'STORM-Seq',
                                                'Tranquil-Seq',
                                                '10X Genomics Xenium',
                                            ],
                                            backgroundColor: '#d0b284',
                                            textColor: '#ffffff',
                                            shortName: 'scRNA',
                                        },
                                        Other: {
                                            values: [
                                                'Hi-C',
                                                'scDip-C',
                                                'Strand-Seq',
                                                'ATAC-Seq',
                                                'NT-Seq',
                                                'varCUT&Tag',
                                                'GoT-ChA',
                                            ],
                                            backgroundColor: '#76cbbe',
                                            textColor: '#ffffff',
                                        },
                                    }}
                                    showColumnGroups={true}
                                    columnGroupsExtended={{
                                        'Core Assay': {
                                            values: [
                                                'Bulk WGS',
                                                'RNA-seq',
                                                'Duplex-seq',
                                            ],
                                            backgroundColor: '#a786c2',
                                            textColor: '#ffffff',
                                        },
                                        'Extended Assay': {
                                            values: [
                                                'Single-cell WGS',
                                                'Targeted Seq',
                                                'Single-cell RNA-Seq',
                                                'Other',
                                            ],
                                            backgroundColor: '#d2bde3',
                                            textColor: '#ffffff',
                                        },
                                    }}
                                    showColumnGroupsExtended={false}
                                    rowGroups={null}
                                    showRowGroups={false}
                                    autoPopulateRowGroupsProperty={null}
                                    rowGroupsExtended={{
                                        Ectoderm: {
                                            values: [
                                                'Brain',
                                                'Brain - Cerebellum',
                                                'Brain - Frontal lobe',
                                                'Brain - Hippocampus',
                                                'Brain - Temporal lobe',
                                                'Skin',
                                                'Skin - Abdomen (non-exposed)',
                                                'Skin - Calf (sun-exposed)',
                                            ],
                                            backgroundColor: '#367151',
                                            textColor: '#ffffff',
                                            shortName: 'Ecto',
                                        },
                                        Mesoderm: {
                                            values: [
                                                'Aorta',
                                                'Fibroblast',
                                                'Heart',
                                                'Muscle',
                                                'Adrenal Gland',
                                            ],
                                            backgroundColor: '#30975e',
                                            textColor: '#ffffff',
                                            shortName: 'Meso',
                                        },
                                        Endoderm: {
                                            values: [
                                                'Colon',
                                                'Colon - Ascending',
                                                'Colon - Descending',
                                                'Esophagus',
                                                'Liver',
                                                'Lung',
                                            ],
                                            backgroundColor: '#53b27e',
                                            textColor: '#ffffff',
                                            shortName: 'Endo',
                                        },
                                        'Germ cells': {
                                            values: ['Ovary', 'Testis'],
                                            backgroundColor: '#80c4a0',
                                            textColor: '#ffffff',
                                            shortName: 'Germ',
                                        },
                                        'Clinically accessible': {
                                            values: ['Blood', 'Buccal swab'],
                                            backgroundColor: '#70a588',
                                            textColor: '#ffffff',
                                            shortName: 'Clin',
                                        },
                                    }}
                                    showRowGroupsExtended={true}
                                    xAxisLabel="Assays"
                                    yAxisLabel="Donors"
                                    showAxisLabels={false}
                                    showColumnSummary={true}
                                    defaultOpen={true}
                                    compositeValueSeparator=" - "
                                    disableConfigurator={true}
                                    idLabel="donor"
                                    key="data-matrix-key"
                                    session={session}
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
