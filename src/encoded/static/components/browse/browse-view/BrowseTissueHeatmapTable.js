'use strict';

import React, { useEffect, useMemo, useState } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

// Autolysis Score and Target Tissue % are omitted until a PathologyReport ->
// TissueSample -> Tissue reverse link exists to source them from real data;
// see the "Coming soon" tabs below.
const HEATMAP_TABS = [
    { key: 'ischemic', label: 'Ischemic Time', comingSoon: false },
    { key: 'autolysis', label: 'Autolysis Score', comingSoon: true },
    { key: 'target', label: 'Target Tissue %', comingSoon: true },
];

// Exported for unit testing. Pivots raw Tissue search results into a
// donor (external_id) x tissue_type matrix of ischemic_time values, plus a
// tissue_type -> representative Tissue @id map (the first Tissue instance
// encountered for that type) used to link column headers to a Tissue
// Overview page, since /tissues/<uuid>/ is keyed on a single Tissue
// instance, not on tissue_type directly.
export const buildIschemicTimeMatrix = (tissueResults = []) => {
    const tissueTypes = [];
    const donors = [];
    const cellsByDonorAndTissue = {};
    const tissueTypeHrefs = {};

    tissueResults.forEach((t) => {
        const donorId = t?.donor?.external_id;
        const tissueType = t?.tissue_type;
        if (!donorId || !tissueType) return;
        if (!donors.includes(donorId)) donors.push(donorId);
        if (!tissueTypes.includes(tissueType)) tissueTypes.push(tissueType);
        if (!tissueTypeHrefs[tissueType] && t['@id']) tissueTypeHrefs[tissueType] = t['@id'];
        cellsByDonorAndTissue[`${donorId} ${tissueType}`] = t.ischemic_time ?? null;
    });

    donors.sort();
    tissueTypes.sort();

    const matrix = donors.map((donor) => {
        return {
            donor,
            cells: tissueTypes.map((tissueType) => cellsByDonorAndTissue[`${donor} ${tissueType}`] ?? null),
        };
    });

    return { tissueTypes, tissueTypeHrefs, matrix };
};

function formatCellValue(value) {
    if (value === null || typeof value === 'undefined') return 'n/a';
    return `${value}h`;
}

function getScoreClass(value) {
    if (value === null || typeof value === 'undefined') return 'na';
    if (value <= 6) return 'score-0';
    if (value <= 12) return 'score-1';
    if (value <= 18) return 'score-2';
    return 'score-3';
}

export const BrowseTissueHeatmapTable = () => {
    const [activeTab, setActiveTab] = useState(HEATMAP_TABS[0].key);
    const [loading, setLoading] = useState(true);
    const [tissueResults, setTissueResults] = useState([]);

    useEffect(() => {
        setLoading(true);
        ajax.load(
            '/search/?type=Tissue&limit=all',
            (resp) => {
                setTissueResults(resp?.['@graph'] || []);
                setLoading(false);
            },
            'GET',
            () => {
                setTissueResults([]);
                setLoading(false);
            }
        );
    }, []);

    const { tissueTypes, tissueTypeHrefs, matrix } = useMemo(
        () => buildIschemicTimeMatrix(tissueResults),
        [tissueResults]
    );

    const activeTabConfig = HEATMAP_TABS.find(({ key }) => key === activeTab);

    return (
        <div className="tissue-heatmap-card">
            <div className="tissue-heatmap-tabs">
                {HEATMAP_TABS.map(({ key, label, comingSoon }) => (
                    <button
                        key={key}
                        type="button"
                        disabled={comingSoon}
                        title={comingSoon ? 'Coming soon' : undefined}
                        className={
                            'tissue-heatmap-tab' +
                            (activeTab === key ? ' active' : '') +
                            (comingSoon ? ' coming-soon' : '')
                        }
                        onClick={() => !comingSoon && setActiveTab(key)}>
                        {label}
                        {comingSoon ? ' (Coming soon)' : ''}
                    </button>
                ))}
            </div>
            {activeTabConfig?.comingSoon ? (
                <div className="tissue-heatmap-coming-soon">
                    This view is not yet available.
                </div>
            ) : loading ? (
                <div className="tissue-heatmap-loading">
                    <i className="icon icon-circle-notch icon-spin fas" />
                </div>
            ) : (
                <div className="tissue-heatmap-table-wrap">
                    <table className="tissue-heatmap-table">
                        <thead>
                            <tr>
                                <th className="tissue-heatmap-order-header" />
                                <th className="tissue-heatmap-donor-header" />
                                {tissueTypes.map((tissueType) => (
                                    <th key={tissueType}>
                                        {tissueTypeHrefs[tissueType] ? (
                                            <a href={tissueTypeHrefs[tissueType]}>
                                                {tissueType}
                                            </a>
                                        ) : (
                                            tissueType
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {matrix.map(({ donor, cells }, rowIndex) => (
                                <tr key={donor}>
                                    {rowIndex === 0 ? (
                                        <td
                                            className="tissue-heatmap-order-label"
                                            rowSpan={matrix.length}>
                                            <span>Donor Distribution Order</span>
                                        </td>
                                    ) : null}
                                    <td className="tissue-heatmap-donor-id">
                                        {donor}
                                    </td>
                                    {cells.map((value, i) => (
                                        <td
                                            key={tissueTypes[i]}
                                            className={
                                                'tissue-heatmap-cell ' +
                                                getScoreClass(value)
                                            }>
                                            {formatCellValue(value)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
