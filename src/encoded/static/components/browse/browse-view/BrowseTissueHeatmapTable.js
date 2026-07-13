'use strict';

import React, { useMemo, useState } from 'react';

// TODO: replace with real per-donor/per-tissue pathology report aggregations
// once that data is exposed on Tissue/PathologyReport search results.
const TISSUE_COLUMNS = [
    'Aorta',
    'Colon-Asc.',
    'Liver',
    'Skin-Ab',
    'Esophagus',
    'Colon-Desc.',
    'Skin-Calf',
    'Heart',
    'Lung',
    'Adrenal',
    'Ovary',
    'Testis',
    'Muscle',
];

const DONOR_ROWS = [
    'SMHT005',
    'SMHT008',
    'SMHT007',
    'SMHT004',
    'SMHT015',
    'SMHT001',
    'SMHT009',
    'SMHT022',
    'SMHT023',
    'SMHT012',
    'SMHT024',
    'SMHT020',
];

const HEATMAP_TABS = [
    { key: 'autolysis', label: 'Autolysis Score' },
    { key: 'ischemic', label: 'Ischemic Time' },
    { key: 'target', label: 'Target Tissue %' },
];

// Small deterministic hash so dummy cell values stay stable across re-renders
// instead of reshuffling on every render.
function seedValue(seedStr) {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
        hash = (hash << 5) - hash + seedStr.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function getDummyCellValue(tabKey, donor, tissue) {
    const seed = seedValue(`${tabKey}-${donor}-${tissue}`);
    if (seed % 100 < 15) return null; // ~15% of cells are "n/a"

    if (tabKey === 'autolysis') return seed % 4; // 0-3
    if (tabKey === 'ischemic') return (seed % 24) + 1; // 1-24 hours
    return (seed % 10) * 10; // target tissue %, 0-90
}

function formatCellValue(tabKey, value) {
    if (value === null) return 'n/a';
    if (tabKey === 'ischemic') return `${value}h`;
    if (tabKey === 'target') return `${value}%`;
    return String(value);
}

function getScoreClass(tabKey, value) {
    if (value === null) return 'na';
    if (tabKey === 'autolysis') {
        return ['score-0', 'score-1', 'score-2', 'score-3'][value] || 'score-0';
    }
    if (tabKey === 'ischemic') {
        if (value <= 6) return 'score-0';
        if (value <= 12) return 'score-1';
        if (value <= 18) return 'score-2';
        return 'score-3';
    }
    // target tissue %
    if (value >= 70) return 'score-0';
    if (value >= 40) return 'score-1';
    if (value >= 20) return 'score-2';
    return 'score-3';
}

export const BrowseTissueHeatmapTable = () => {
    const [activeTab, setActiveTab] = useState(HEATMAP_TABS[0].key);

    const matrix = useMemo(
        () =>
            DONOR_ROWS.map((donor) => {
                return {
                    donor,
                    cells: TISSUE_COLUMNS.map((tissue) =>
                        getDummyCellValue(activeTab, donor, tissue)
                    ),
                };
            }),
        [activeTab]
    );

    return (
        <div className="tissue-heatmap-card">
            <div className="tissue-heatmap-tabs">
                {HEATMAP_TABS.map(({ key, label }) => (
                    <button
                        key={key}
                        type="button"
                        className={
                            'tissue-heatmap-tab' +
                            (activeTab === key ? ' active' : '')
                        }
                        onClick={() => setActiveTab(key)}>
                        {label}
                    </button>
                ))}
            </div>
            <div className="tissue-heatmap-table-wrap">
                <table className="tissue-heatmap-table">
                    <thead>
                        <tr>
                            <th className="tissue-heatmap-order-header" />
                            <th className="tissue-heatmap-donor-header" />
                            {TISSUE_COLUMNS.map((tissue) => (
                                <th key={tissue}>{tissue}</th>
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
                                        key={TISSUE_COLUMNS[i]}
                                        className={
                                            'tissue-heatmap-cell ' +
                                            getScoreClass(activeTab, value)
                                        }>
                                        {formatCellValue(activeTab, value)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
