'use strict';

import React, { useState, useEffect } from 'react';
import _ from 'underscore';
import { ProtectedDonorViewDataCards } from './components/donor-overview/ProtectedDonorViewDataCards';
import DefaultItemView from './DefaultItemView';
import { ShowHideInformationToggle } from './components/file-overview/ShowHideInformationToggle';
import { DonorMetadataDownloadButton } from '../browse/BrowseView';
import DataMatrix from '../static-pages/components/matrix/DataMatrix';

// Page containing the details of Items of type File
export default class DonorOverview extends DefaultItemView {
    getTabViewContents() {
        const initTabs = [];
        initTabs.push(ProtectedDonorView.getTabObject(this.props));
        return initTabs.concat(this.getCommonTabs()); // Add remainder of common tabs (Details, Attribution)
    }
}

// Donor Overview's header component containing breadcrumbs and filename
const ProtectedDonorViewTitle = (props) => {
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
const ProtectedDonorViewHeader = (props) => {
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
                        <div className="d-flex gap-2 flex-wrap">
                            <DonorMetadataDownloadButton session={session} />
                            <div data-tip="Donor Manifest Download is coming soon">
                                <button
                                    className="btn btn-primary btn-sm me-05 align-items-center download-button px-3"
                                    disabled>
                                    <i className="icon icon-user fas me-1" />
                                    Download Donor Manifest
                                </button>
                            </div>
                        </div>
                    </div>
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
const ProtectedDonorView = React.memo(function ProtectedDonorView(props) {
    const { context, session, href, schemas } = props;

    // Pull out the medical history and exposure history schemas
    const medicalHistorySchemaProperties =
        schemas?.['MedicalHistory']?.properties;
    const exposureHistorySchemaProperties = schemas?.['Exposure']?.properties;

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
            <ProtectedDonorViewTitle
                context={context}
                session={session}
                href={href}
                title={titleString}
            />
            <div className="view-content">
                <ProtectedDonorViewHeader
                    context={context}
                    session={session}
                    title={titleString}
                />
                <ProtectedDonorViewDataCards
                    context={context}
                    medicalHistorySchemaProperties={
                        medicalHistorySchemaProperties
                    }
                    exposureHistorySchemaProperties={
                        exposureHistorySchemaProperties
                    }
                />
                <div className="tabs-container d-flex gap-4 flex-wrap">
                    <div className="matrix-tab tab-card">
                        <div className="header">
                            <span className="title">
                                Assay x Tissue Data Matrix
                            </span>
                        </div>
                        <div className="body d-flex justify-content-center overflow-scroll p-5">
                            {/* <DataMatrix
                                query={{
                                    url: `/data_matrix_aggregations?type=Tissue&status=released&sample_summary.studies=Production&limit=all&donors.display_title=${context.display_title}`,
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
                                        'Fiber-seq - PacBio': 'Fiber-Seq',
                                        'RNA-seq - Illumina':
                                            'RNA-Seq - Illumina',
                                        'NanoSeq - Illumina': 'NanoSeq',
                                        'ATAC-seq - Illumina': 'ATAC-Seq',
                                        'varCUT&Tag - Illumina': 'varCUT&Tag',
                                        'VISTA-seq - Illumina': 'VISTA-Seq',
                                        'scVISTA-seq - Illumina': 'VISTA-Seq',
                                        'Microbulk VISTA-seq - Illumina':
                                            'VISTA-Seq',
                                        'CODEC - Illumina': 'CODEC',
                                        'Single-cell MALBAC WGS - ONT':
                                            'MALBAC-amplified WGS',
                                        'Single-cell MALBAC WGS - Illumina':
                                            'MALBAC-amplified WGS',
                                        'TEnCATS - ONT': 'TEnCATS',
                                        'WGS - ONT': 'WGS - Standard ONT',
                                        'Ultra-Long WGS - ONT':
                                            'WGS - UltraLong ONT',
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
                                    platform: 'sequencing.sequencer.platform',
                                    data_type: 'data_type',
                                    file_format: 'file_format.display_title',
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
                                defaultOpen={false}
                                compositeValueSeparator=" - "
                                disableConfigurator={false}
                                key="data-matrix-key"
                                session={session}
                            /> */}
                        </div>
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
                            <div className="callout">
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
ProtectedDonorView.getTabObject = function (props) {
    return {
        tab: <span>Protected Donor Overview</span>,
        key: 'donor-overview',
        content: <ProtectedDonorView {...props} />,
    };
};
