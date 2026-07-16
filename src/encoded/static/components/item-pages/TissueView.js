'use strict';

import React, { useEffect, useMemo, useState } from 'react';
import DefaultItemView from './DefaultItemView';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { BROWSE_STATUS_FILTERS } from '../browse/BrowseView';
import AliquotVisualization from './components/tissue-overview/AliquotVisualization';
import { useUserDownloadAccess } from '../util/hooks';

export default class TissueOverview extends DefaultItemView {
    getTabViewContents() {
        const initTabs = [];
        initTabs.push(TissueView.getTabObject(this.props));
        return initTabs.concat(this.getCommonTabs());
    }
}

// Links to the ProtectedDonor page when the viewing user has protected/dbGaP
// access and the donor's protected_donor is visible to them (embedded
// server-side, permission-filtered); otherwise falls back to the public
// Donor page. Mirrors BrowseView.js's donors column render logic.
const getDonorHref = (donor, userDownloadAccess) => {
    const protectedHref = donor?.protected_donor?.['@id'];
    if (userDownloadAccess?.['protected'] && protectedHref) return protectedHref;
    return donor?.['@id'] || null;
};

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

const formatYesNo = (value) => {
    if (value === null || typeof value === 'undefined') return '-';
    return value ? 'Yes' : 'No';
};

// Exported for unit testing.
export const dedupeTissuesByDonor = (tissueResults = []) => {
    const byDonorUuid = new Map();
    tissueResults.forEach((tissueItem) => {
        const d = tissueItem?.donor;
        if (d?.uuid && !byDonorUuid.has(d.uuid)) {
            byDonorUuid.set(d.uuid, { donor: d, tissue: tissueItem });
        }
    });
    return Array.from(byDonorUuid.values());
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

const TissueView = React.memo(function TissueView({ context = {}, session }) {
    const { display_title, donor, uberon_id, tissue_type, study } = context;
    const { userDownloadAccess } = useUserDownloadAccess(session);

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
    const [donors, setDonors] = useState([]);
    const [donorsLoading, setDonorsLoading] = useState(true);

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

    // All donors that share this Tissue's resolved tissue_type, not just this Tissue's own donor.
    useEffect(() => {
        if (!tissueMatrixFilterValue) {
            setDonors([]);
            setDonorsLoading(false);
            return;
        }
        setDonorsLoading(true);
        ajax.load(
            `/search/?type=Tissue&tissue_type=${encodeURIComponent(tissueMatrixFilterValue)}&limit=all`,
            (resp) => {
                setDonors(dedupeTissuesByDonor(resp?.['@graph']));
                setDonorsLoading(false);
            },
            'GET',
            () => {
                setDonors([]);
                setDonorsLoading(false);
            }
        );
    }, [tissueMatrixFilterValue]);

    const donorCount = donors.length;

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
                                        {!donorsLoading ? (
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
                    {/*
                        Lists every donor whose Tissue shares this Tissue's resolved tissue_type
                        (not just this Tissue's own donor). Autolysis Score, Non-Target Tissue
                        Presence, and Unexpected/Pathologic Finding come from each donor's own
                        Tissue.pathology_summary (Tissue -> TissueSample -> PathologyReport
                        rev-link chain); "-" means no pathology report covers that tissue sample.
                    */}
                    <div className="body">
                        <table className="tissue-donor-table table">
                            <thead>
                                <tr>
                                    <th>Donor ID</th>
                                    <th>Sex</th>
                                    <th>Age</th>
                                    <th>Status</th>
                                    <th>Autolysis Score</th>
                                    <th>Non-Target Tissue Presence</th>
                                    <th>Unexpected/Pathologic Finding</th>
                                    <th>Histology Viewer</th>
                                </tr>
                            </thead>
                            <tbody>
                                {donorsLoading ? (
                                    <tr>
                                        <td colSpan={8}>
                                            <i className="icon icon-circle-notch icon-spin fas" />
                                        </td>
                                    </tr>
                                ) : donors.length > 0 ? (
                                    donors.map(({ donor: d, tissue: t }) => {
                                        const donorHref = getDonorHref(d, userDownloadAccess);
                                        const pathologySummary = t?.pathology_summary || {};
                                        const histologyImages = pathologySummary.histology_images || [];
                                        return (
                                            <tr key={d.uuid}>
                                                <td>
                                                    {donorHref ? (
                                                        <a href={donorHref}>{getDisplayText(d)}</a>
                                                    ) : (
                                                        getDisplayText(d)
                                                    )}
                                                </td>
                                                <td>{getDisplayText(d.sex)}</td>
                                                <td>{getDisplayText(d.age)}</td>
                                                <td>{getDisplayText(d.status)}</td>
                                                <td>{getDisplayText(pathologySummary.autolysis_score)}</td>
                                                <td>{formatYesNo(pathologySummary.non_target_tissue_present)}</td>
                                                <td>{formatYesNo(pathologySummary.pathologic_finding_present)}</td>
                                                <td>
                                                    {histologyImages.length > 0 ? (
                                                        <a href={histologyImages[0]}>
                                                            View{histologyImages.length > 1 ? ` (${histologyImages.length})` : ''}
                                                        </a>
                                                    ) : (
                                                        '-'
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={8}>No donor data available for this tissue type.</td>
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
