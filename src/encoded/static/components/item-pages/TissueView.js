'use strict';

import React, { useEffect, useMemo, useState } from 'react';
import DefaultItemView from './DefaultItemView';
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
    const isComingSoon = text === 'Protected';

    return (
        <div className="datum">
            <span className="datum-title">{title}</span>
            <span className={'datum-value' + (isComingSoon ? ' coming-soon' : '')}>
                {href && text !== '-' ? <a href={href}>{textToRender}</a> : textToRender}
            </span>
        </div>
    );
};

const sampleAliquotSlices = [
    { id: 'fixed-1', type: 'pink', widthCm: 0.5, description: 'Fixed edge aliquot for preservation workflow.' },
    { id: 'frozen-1', type: 'yellow', widthCm: 1, description: 'Frozen aliquot reserved for sequencing-ready extraction.' },
    { id: 'frozen-2', type: 'yellow', widthCm: 1, description: 'Frozen aliquot reserved for replicate processing.' },
    { id: 'frozen-3', type: 'yellow', widthCm: 1, description: 'Frozen aliquot for downstream QC and validation.' },
    { id: 'fixed-2', type: 'pink', widthCm: 0.5, description: 'Fixed center aliquot for morphology review.' },
    { id: 'frozen-4', type: 'yellow', widthCm: 1, description: 'Frozen aliquot held as backup material.' },
    { id: 'frozen-5', type: 'yellow', widthCm: 1, description: 'Frozen aliquot reserved for replicate processing.' },
    { id: 'frozen-6', type: 'yellow', widthCm: 1, description: 'Frozen aliquot for downstream QC and validation.' },
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

const TissueView = React.memo(function TissueView({ context = {} }) {
    const { display_title, donor, uberon_id, tissue_type, study } = context;

    const donorHref = donor && donor['@id'] ? donor['@id'] : null;
    const uberonHref = uberon_id && uberon_id['@id'] ? uberon_id['@id'] : null;
    const targetTissueValue = uberon_id || tissue_type || null;
    const targetTissueHref = uberon_id ? uberonHref : null;
    const tissueProtocolCode = tissue_type ? tissue_type.split(' - ')[0].trim() : null;
    const tissueMatrixFilterValue = useMemo(
        () => tissue_type || uberon_id?.display_title || null,
        [tissue_type, uberon_id]
    );
    const [isLoading, setIsLoading] = useState(true);
    const [fileCount, setFileCount] = useState(0);

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
                setFileCount(resp?.total || 0);
                setIsLoading(false);
            },
            'GET',
            () => {
                setFileCount(0);
                setIsLoading(false);
            }
        );
    }, [donor?.display_title, tissueMatrixFilterValue]);

    const donorCount = donor ? 1 : 0;

    return (
        <div className="tissue-view">
            <TissueViewTitle context={context} />
            <div className="view-content">
                <div className="tissue-summary-header">
                    <div className="tissue-summary-header-icon">
                        <i className="icon icon-lungs fas"></i>
                    </div>
                    <div className="tissue-summary-header-content">
                        <h1 className="header-text fw-semibold">
                            {study ? `${study} Tissue: ` : 'Tissue: '}
                            {getDisplayText(targetTissueValue) !== '-'
                                ? getDisplayText(targetTissueValue)
                                : display_title}
                        </h1>
                        <div className="tissue-summary-header-notes">
                            <span className="notes-label">Notes</span>
                            <span className="notes-value">
                                Extended Clinical Data about this donor is available through the donor manifest
                            </span>
                        </div>
                    </div>
                </div>

                <div className="tissue-summary-row">
                    <div className="tissue-summary-card">
                        <div className="header">
                            <span className="header-text">Tissue Summary</span>
                        </div>
                        <div className="body">
                            <div className="tissue-summary-subheader">Tissue Overview</div>
                            <div className="tissue-summary-fields">
                                <div className="tissue-summary-grid">
                                    <TissueDatum
                                        title="Target Tissue"
                                        value={targetTissueValue}
                                        href={targetTissueHref}
                                    />
                                    <TissueDatum title="Non-Tissue Presence" value="Protected" />
                                    <TissueDatum title="Sex" value={donor?.sex} />
                                    <TissueDatum title="Total Coverage" value="Protected" />
                                </div>
                            </div>
                            <div className="tissue-summary-stats d-flex gap-3">
                                <div className="donor-statistic donors d-flex flex-column p-2 gap-2">
                                    <div className="donor-statistic-label text-center">
                                        <i className="icon icon-lungs fas"></i>Donors
                                    </div>
                                    <div className="donor-statistic-value text-center">
                                        {!isLoading ? (
                                            <span>{donorCount}</span>
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
                                            <span>{fileCount}</span>
                                        ) : (
                                            <i className="icon icon-circle-notch icon-spin fas" />
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="tissue-aliquot-card">
                        <AliquotVisualization
                            title="Sample solid-organ aliquot layout"
                            slices={sampleAliquotSlices}
                            dimensions={{
                                heightCm: 1,
                                depthCm: 1.5,
                                widthLabel: '7.5 cm',
                                heightLabel: '1 cm',
                                depthLabel: '1.5 cm',
                            }}
                            idPrefix={tissueProtocolCode}
                            showSliceLabels={false}
                        />
                    </div>
                </div>

                <div className="tissue-donor-table-card">
                    <div className="header">
                        <span className="header-text">Donor Details</span>
                    </div>
                    {/* Donor table is currently a placeholder. In a real implementation, this would be replaced with embedded search table. */}
                    <div className="body">
                        <table className="tissue-donor-table table">
                            <thead>
                                <tr>
                                    <th>Donor ID</th>
                                    <th>Autolysis Score</th>
                                    <th>Non-Target Tissue Presence</th>
                                    <th>Unexpected/Pathologic Finding</th>
                                    <th>Histology Viewer</th>
                                </tr>
                            </thead>
                            <tbody>
                                {donor ? (
                                    <tr>
                                        <td>
                                            {donorHref ? (
                                                <a href={donorHref}>{getDisplayText(donor)}</a>
                                            ) : (
                                                getDisplayText(donor)
                                            )}
                                        </td>
                                        <td>n/a</td>
                                        <td>n/a</td>
                                        <td>n/a</td>
                                        <td>n/a</td>
                                    </tr>
                                ) : (
                                    <tr>
                                        <td colSpan={5}>No donor data available for this tissue.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
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
