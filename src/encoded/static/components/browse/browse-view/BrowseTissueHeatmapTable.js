'use strict';

import React, { useEffect, useMemo, useState } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import {
    DotRouter,
    DotRouterTab,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/DotRouter';

// Ascending order of Tissue.pathology_summary.target_tissue_percentage bands,
// mirrored from item_utils/pathology_report.py::TARGET_TISSUE_PERCENTAGE_ORDER.
const TARGET_TISSUE_PERCENTAGE_ORDER = ['0', '[0-10]', '[11-25]', '[26-49]', '[50-100]'];

// Exported for unit testing. Pivots raw Tissue search results into a
// donor (external_id) x tissue_type matrix of values (as picked by
// `getValue`), plus a tissue_type -> representative Tissue @id map (the
// first Tissue instance encountered for that type) used to link column
// headers to a Tissue Overview page, since /tissues/<uuid>/ is keyed on a
// single Tissue instance, not on tissue_type directly.
//
// When a donor has multiple Tissue records for the same tissue_type, the
// one with a populated pathology_summary is preferred over an arbitrary
// "last encountered" pick, matching the selection rule used by
// TissueView.js's dedupeTissuesByDonor.
export const buildTissueMetricMatrix = (tissueResults = [], getValue) => {
    const tissueTypes = [];
    const donors = [];
    const cellsByDonorAndTissue = {};
    const tissueByDonorAndTissue = {};
    const tissueTypeHrefs = {};

    tissueResults.forEach((t) => {
        const donorId = t?.donor?.external_id;
        const tissueType = t?.tissue_type;
        if (!donorId || !tissueType) return;
        if (!donors.includes(donorId)) donors.push(donorId);
        if (!tissueTypes.includes(tissueType)) tissueTypes.push(tissueType);
        if (!tissueTypeHrefs[tissueType] && t['@id']) tissueTypeHrefs[tissueType] = t['@id'];

        const key = `${donorId} ${tissueType}`;
        const existing = tissueByDonorAndTissue[key];
        if (!existing || (!existing.pathology_summary && t.pathology_summary)) {
            tissueByDonorAndTissue[key] = t;
            cellsByDonorAndTissue[key] = getValue(t) ?? null;
        }
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

const getIschemicTimeValue = (t) => t?.ischemic_time ?? null;
const getAutolysisScoreValue = (t) => t?.pathology_summary?.autolysis_score ?? null;
const getTargetTissuePercentageValue = (t) => t?.pathology_summary?.target_tissue_percentage ?? null;

function formatIschemicTime(value) {
    if (value === null || typeof value === 'undefined') return 'n/a';
    return `${value}h`;
}

function getIschemicTimeScoreClass(value) {
    if (value === null || typeof value === 'undefined') return 'na';
    if (value <= 6) return 'score-0';
    if (value <= 12) return 'score-1';
    if (value <= 18) return 'score-2';
    return 'score-3';
}

function formatAutolysisScore(value) {
    if (value === null || typeof value === 'undefined') return 'n/a';
    return String(value);
}

function getAutolysisScoreClass(value) {
    if (value === null || typeof value === 'undefined') return 'na';
    return `score-${Math.min(value, 3)}`;
}

function formatTargetTissuePercentage(value) {
    if (value === null || typeof value === 'undefined') return 'n/a';
    return value === '0' ? '0%' : value;
}

// `tissue_type` is stored/sorted as "<protocol code> - <name>" (e.g.
// "3AK - Brain, Frontal Lobe") so the code stays part of the value used for
// column identity/lookup, but showing that code in the header is meaningless
// to someone browsing by tissue -- strip it for display only.
function formatTissueTypeLabel(tissueType) {
    if (!tissueType) return tissueType;
    return tissueType.replace(/^\S+\s-\s*/, '');
}

function getTargetTissuePercentageScoreClass(value) {
    if (value === null || typeof value === 'undefined') return 'na';
    const index = TARGET_TISSUE_PERCENTAGE_ORDER.indexOf(value);
    if (index === -1) return 'na';
    // Higher target-tissue presence is "better", so invert the band index
    // (highest band -> score-0) to match the Ischemic Time convention.
    return `score-${TARGET_TISSUE_PERCENTAGE_ORDER.length - 1 - index}`;
}

const MetricHeatmapTable = ({ tissueTypes, tissueTypeHrefs, matrix, formatValue, getScoreClass }) => (
    <div className="tissue-heatmap-table-wrap">
        <table className="tissue-heatmap-table">
            <thead>
                <tr>
                    <th className="tissue-heatmap-order-header" />
                    <th className="tissue-heatmap-donor-header" />
                    {tissueTypes.map((tissueType) => (
                        <th key={tissueType} title={tissueType}>
                            {tissueTypeHrefs[tissueType] ? (
                                <a href={tissueTypeHrefs[tissueType]}>
                                    {formatTissueTypeLabel(tissueType)}
                                </a>
                            ) : (
                                formatTissueTypeLabel(tissueType)
                            )}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {matrix.map(({ donor, cells }, rowIndex) => (
                    <tr key={donor}>
                        {rowIndex === 0 ? (
                            <td className="tissue-heatmap-order-label" rowSpan={matrix.length}>
                                <span>Donor Distribution Order</span>
                            </td>
                        ) : null}
                        <td className="tissue-heatmap-donor-id">{donor}</td>
                        {cells.map((value, i) => (
                            <td
                                key={tissueTypes[i]}
                                className={'tissue-heatmap-cell ' + getScoreClass(value)}>
                                {formatValue(value)}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

export const BrowseTissueHeatmapTable = (props) => {
    const { href } = props;
    const [loading, setLoading] = useState(true);
    const [tissueResults, setTissueResults] = useState([]);

    useEffect(() => {
        setLoading(true);
        ajax.load(
            // Matches Browse by Donor/Browse by File's donor population
            // (Production study, has_released_files tag) so this table
            // doesn't list donors that don't have released files yet (e.g.
            // benchmarking-only donors) -- see donor.study/donor.tags in
            // types/tissue.py's embedded_list.
            '/search/?type=Tissue&donor.study=Production&donor.tags=has_released_files&limit=all',
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

    const ischemicTime = useMemo(
        () => buildTissueMetricMatrix(tissueResults, getIschemicTimeValue),
        [tissueResults]
    );
    const autolysisScore = useMemo(
        () => buildTissueMetricMatrix(tissueResults, getAutolysisScoreValue),
        [tissueResults]
    );
    const targetTissuePercentage = useMemo(
        () => buildTissueMetricMatrix(tissueResults, getTargetTissuePercentageValue),
        [tissueResults]
    );

    return (
        <div className="tissue-heatmap-card">
            <DotRouter
                href={href}
                navClassName="tissue-heatmap-tabs"
                contentsClassName=""
                isActive={true}
                prependDotPath="tissue-heatmap">
                <DotRouterTab
                    dotPath=".ischemic-time"
                    tabTitle="Ischemic Time"
                    arrowTabs={false}
                    cache={true}
                    default>
                    {loading ? (
                        <div className="tissue-heatmap-loading">
                            <i className="icon icon-circle-notch icon-spin fas" />
                        </div>
                    ) : (
                        <MetricHeatmapTable
                            {...ischemicTime}
                            formatValue={formatIschemicTime}
                            getScoreClass={getIschemicTimeScoreClass}
                        />
                    )}
                </DotRouterTab>
                <DotRouterTab
                    dotPath=".autolysis-score"
                    tabTitle="Autolysis Score"
                    arrowTabs={false}
                    cache={true}>
                    {loading ? (
                        <div className="tissue-heatmap-loading">
                            <i className="icon icon-circle-notch icon-spin fas" />
                        </div>
                    ) : (
                        <MetricHeatmapTable
                            {...autolysisScore}
                            formatValue={formatAutolysisScore}
                            getScoreClass={getAutolysisScoreClass}
                        />
                    )}
                </DotRouterTab>
                <DotRouterTab
                    dotPath=".target-tissue"
                    tabTitle="Target Tissue %"
                    arrowTabs={false}
                    cache={true}>
                    {loading ? (
                        <div className="tissue-heatmap-loading">
                            <i className="icon icon-circle-notch icon-spin fas" />
                        </div>
                    ) : (
                        <MetricHeatmapTable
                            {...targetTissuePercentage}
                            formatValue={formatTargetTissuePercentage}
                            getScoreClass={getTargetTissuePercentageScoreClass}
                        />
                    )}
                </DotRouterTab>
            </DotRouter>
        </div>
    );
};
