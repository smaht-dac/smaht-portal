'use strict';

import React, { useEffect, useMemo, useState } from 'react';
import _ from 'underscore';
import DefaultItemView from './DefaultItemView';
import DataMatrix from '../viz/Matrix/DataMatrix';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { BROWSE_STATUS_FILTERS } from '../browse/BrowseView';
import AliquotVisualization from './components/tissue-overview/AliquotVisualization';

export default class TissueOverview extends DefaultItemView {
    getTabViewContents() {
        const initTabs = [];
        initTabs.push(TissueView.getTabObject(this.props));
        return initTabs.concat(this.getCommonTabs());
    }
}

const getDisplayText = (value) => {
    if (value === null || typeof value === 'undefined' || value === '') {
        return '-';
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return '-';
        return value.join(', ');
    }
    if (typeof value === 'number') {
        return String(value);
    }
    if (typeof value === 'object') {
        if (value.display_title) return value.display_title;
        if (value.title) return value.title;
        if (value['@id']) return value['@id'];
    }
    return String(value);
};

const TissueDatum = ({ title, value, unit = null, href = null }) => {
    const text = getDisplayText(value);
    const textToRender = unit && text !== '-' ? `${text} ${unit}` : text;

    return (
        <div className="datum">
            <span className="datum-title">{title}</span>
            <span className="datum-value">
                {href && text !== '-' ? <a href={href}>{textToRender}</a> : textToRender}
            </span>
        </div>
    );
};

const TissueSection = ({ title, children }) => (
    <div className="data-card">
        <div className="header">
            <span className="header-text">{title}</span>
        </div>
        <div className="body data-group">{children}</div>
    </div>
);

const sampleAliquotSlices = [
    { id: 'fixed-1', type: 'pink', widthCm: 0.5, description: 'Fixed edge aliquot for preservation workflow.' },
    { id: 'frozen-1', type: 'yellow', widthCm: 1, description: 'Frozen aliquot reserved for sequencing-ready extraction.' },
    { id: 'frozen-2', type: 'yellow', widthCm: 1, description: 'Frozen aliquot reserved for replicate processing.' },
    { id: 'fixed-2', type: 'pink', widthCm: 0.5, description: 'Fixed center aliquot for morphology review.' },
    { id: 'frozen-3', type: 'yellow', widthCm: 1, description: 'Frozen aliquot for downstream QC and validation.' },
    { id: 'frozen-4', type: 'yellow', widthCm: 1, description: 'Frozen aliquot held as backup material.' },
    { id: 'fixed-3', type: 'pink', widthCm: 0.5, description: 'Fixed edge aliquot for archive retention.' },
];

const TissueViewTitle = ({ context }) => {
    const breadcrumbs = [
        { display_title: 'Home', href: '/' },
        { display_title: 'Data' },
        { display_title: 'Tissues' },
        { display_title: context?.display_title || '' },
    ];

    return (
        <div className="view-title container-wide">
            <nav className="view-title-navigation">
                <ul className="breadcrumb-list">
                    {breadcrumbs.map(({ display_title, href }, i, arr) => (
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
                    ))}
                </ul>
            </nav>
            <h1 className="view-title-text">Tissue Overview</h1>
        </div>
    );
};

const TissueView = React.memo(function TissueView({ context = {}, session }) {
    const {
        display_title,
        accession,
        submitted_id,
        external_id,
        submission_centers,
        donor,
        uberon_id,
        anatomical_location,
        preservation_type,
        preservation_medium,
        sample_count,
        ischemic_time,
        ph,
        size,
        size_unit,
        volume,
        weight,
        pathology_notes,
        prosector_notes,
        tissue_type,
        study,
    } = context;

    const donorHref = donor && donor['@id'] ? donor['@id'] : null;
    const uberonHref = uberon_id && uberon_id['@id'] ? uberon_id['@id'] : null;
    const tissueMatrixFilterValue = useMemo(
        () => tissue_type || uberon_id?.display_title || null,
        [tissue_type, uberon_id]
    );
    const encodedDonorDisplayTitle = encodeURIComponent(
        donor?.display_title || ''
    );
    const encodedTissueFilter = tissueMatrixFilterValue
        ? `&sample_summary.tissues=${encodeURIComponent(tissueMatrixFilterValue)}`
        : '';
    const [isLoading, setIsLoading] = useState(true);
    const [matrixStats, setMatrixStats] = useState({ assays: 0, files: 0 });

    useEffect(() => {
        const queryParts = [
            'type=File',
            BROWSE_STATUS_FILTERS,
            'dataset!=No+value',
            donor?.display_title
                ? `donors.display_title=${encodeURIComponent(donor.display_title)}`
                : null,
            tissueMatrixFilterValue
                ? `sample_summary.tissues=${encodeURIComponent(tissueMatrixFilterValue)}`
                : null,
        ].filter(Boolean);

        setIsLoading(true);
        ajax.load(
            `/search/?${queryParts.join('&')}`,
            (resp) => {
                setMatrixStats({
                    assays:
                        resp?.facets?.find(
                            (facet) => facet.field === 'assays.display_title'
                        )?.original_terms?.length || 0,
                    files: resp?.total || 0,
                });
                setIsLoading(false);
            },
            'GET',
            () => {
                setMatrixStats({ assays: 0, files: 0 });
                setIsLoading(false);
            }
        );
    }, [donor?.display_title, tissueMatrixFilterValue]);

    return (
        <div className="tissue-view">
            <TissueViewTitle context={context} />
            <div className="view-content">
                <div className="view-header">
                    <div className="data-group data-row header">
                        <h1 className="header-text fw-semibold">
                            {display_title || 'Tissue'}
                        </h1>
                    </div>
                </div>

                <div className="data-cards-container">
                    <TissueSection title="Identifiers">
                        <TissueDatum title="Accession" value={accession} />
                        <TissueDatum title="Submitted ID" value={submitted_id} />
                        <TissueDatum title="External ID" value={external_id} />
                        <TissueDatum title="Status" value={context.status} />
                        <TissueDatum
                            title="Submitted By"
                            value={_.pluck(submission_centers || [], 'display_title')}
                        />
                    </TissueSection>

                    <TissueSection title="Biology">
                        <TissueDatum title="Donor" value={donor} href={donorHref} />
                        <TissueDatum title="Uberon ID" value={uberon_id} href={uberonHref} />
                        <TissueDatum title="Anatomical Location" value={anatomical_location} />
                        <TissueDatum title="Preservation Type" value={preservation_type} />
                        <TissueDatum title="Preservation Medium" value={preservation_medium} />
                    </TissueSection>

                    <TissueSection title="Measurements">
                        <TissueDatum title="Sample Count" value={sample_count} />
                        <TissueDatum title="Ischemic Time" value={ischemic_time} unit="hours" />
                        <TissueDatum title="pH" value={ph} />
                        <TissueDatum title="Size" value={size} unit={size_unit} />
                        <TissueDatum title="Volume" value={volume} unit="mL" />
                        <TissueDatum title="Weight" value={weight} unit="g" />
                    </TissueSection>

                    <TissueSection title="Notes">
                        <TissueDatum title="Pathology Notes" value={pathology_notes} />
                        <TissueDatum title="Prosector Notes" value={prosector_notes} />
                    </TissueSection>
                </div>

                <div className="tabs-container d-flex gap-4 flex-wrap">
                    <div className="tissue-statistics w-100 d-flex gap-3 mb-2">
                        <div className="donor-statistic tissues d-flex flex-column p-2 gap-2">
                            <div className="donor-statistic-label text-center">
                                <i className="icon icon-lungs fas"></i>Samples
                            </div>
                            <div className="donor-statistic-value text-center">
                                {!isLoading ? (
                                    <span>{getDisplayText(sample_count)}</span>
                                ) : (
                                    <i className="icon icon-circle-notch icon-spin fas" />
                                )}
                            </div>
                        </div>
                        <div className="donor-statistic assays d-flex flex-column p-2 gap-2">
                            <div className="donor-statistic-label text-center">
                                <i className="icon icon-dna fas"></i>Assays
                            </div>
                            <div className="donor-statistic-value text-center">
                                {!isLoading ? (
                                    <span>{matrixStats.assays}</span>
                                ) : (
                                    <i className="icon icon-circle-notch icon-spin fas" />
                                )}
                            </div>
                        </div>
                        <div className="donor-statistic files d-flex flex-column p-2 gap-2">
                            <div className="donor-statistic-label text-center">
                                <i className="icon icon-file fas"></i>Files
                            </div>
                            <div className="donor-statistic-value text-center">
                                {!isLoading ? (
                                    <span>{matrixStats.files}</span>
                                ) : (
                                    <i className="icon icon-circle-notch icon-spin fas" />
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="matrix-tab tab-card">
                        <div className="header">
                            <span className="title">Donor x Assay Type Data Matrix</span>
                        </div>
                        {!isLoading && matrixStats.assays > 0 && matrixStats.files > 0 ? (
                            <div className="body d-flex justify-content-center overflow-scroll">
                                <DataMatrix
                                    key="data-matrix-tissue"
                                    query={{
                                        url: `/data_matrix_aggregations/?type=File&${BROWSE_STATUS_FILTERS}&dataset!=No+value&donors.display_title=${encodedDonorDisplayTitle}${encodedTissueFilter}&analysis_details=No+value&analysis_details=Filtered&analysis_details=Phased&limit=all`,
                                        columnAggFields: [
                                            'assays.display_title',
                                            'sequencers.platform',
                                        ],
                                        rowAggFields: [
                                            'donors.display_title',
                                            'data_type',
                                            'analysis_details',
                                            'sample_summary.category',
                                        ],
                                    }}
                                    resultTransformedPostProcessFuncKey="analysisDerivedColumns"
                                    browseFilteringTransformFuncKey="analysisDerivedColumns"
                                    excludePrimaryColumnNoValue={false}
                                    headerFor={null}
                                    defaultOpen={true}
                                    idLabel="tissue"
                                    session={session}
                                    yAxisLabel="Donor"
                                    showUniqueDonorsAssayBand={false}
                                    baseBrowseFilesPath={study === 'Production' ? '/browse/' : '/search/'}
                                />
                            </div>
                        ) : (
                            <div className="body">
                                <div className="callout-card">
                                    <i className="icon icon-fw icon-2x icon-table-cells fas"></i>
                                    <h4>Donor x Assay Type Data Matrix</h4>
                                    <span>
                                        {isLoading
                                            ? 'Loading matrix data...'
                                            : 'No matrix data available for this tissue yet.'}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="aliquot-tab tab-card">
                        <div className="header">
                            <span className="title">Aliquot Visualization</span>
                        </div>
                        <div className="body aliquot-tab-body">
                            <AliquotVisualization
                                title="Sample solid-organ aliquot layout"
                                slices={sampleAliquotSlices}
                                dimensions={{
                                    heightCm: 1,
                                    depthCm: 1.5,
                                    widthLabel: '5.5 cm',
                                    heightLabel: '1 cm',
                                    depthLabel: '1.5 cm',
                                }}
                                showSliceLabels={false}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

TissueView.getTabObject = function (props) {
    return {
        tab: <span>Tissue Overview</span>,
        key: 'tissue-overview',
        content: <TissueView {...props} />,
    };
};
