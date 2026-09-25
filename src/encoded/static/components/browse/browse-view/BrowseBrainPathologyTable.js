'use strict';

import React, { useMemo, useState } from 'react';
import { FixedScoreLegend, buildRangeScoreClassifier } from './BrowseTissueHeatmapTable';
import { Schemas } from '../../util';

// Per explicit request -- every column header across these 3 tabs' tables
// gets an info icon whose tooltip is the underlying BrainPathologyReport
// schema property's own `description`, so a reader can see what a column
// actually means without leaving the table. `null` (no icon at all) if the
// schema doesn't have that property yet, or hasn't loaded (Schemas.get()
// is populated app-wide by app.js's loadSchemas by the time this renders,
// but stays defensive rather than assuming that timing).
function ColumnHeaderInfo({ field }) {
    const description = field
        ? Schemas.Field.getSchemaProperty(field, Schemas.get(), 'BrainPathologyReport')?.description
        : null;
    if (!description) return null;
    return (
        <i
            className="icon icon-fw icon-info-circle fas tissue-heatmap-column-header-info"
            data-tip={description}
        />
    );
}

// Mirrors item_utils/pathology_report.py::BRAIN_FINDING_CATEGORIES' own
// fixed display order/labels -- kept as a flat list of labels here since the
// frontend only ever needs the category name, not the backend's own
// present/description field-name pair (already resolved server-side into
// Tissue.pathology_summary.brain_findings, see types/tissue.py).
export const BRAIN_FINDING_CATEGORIES = [
    'Developmental',
    'Infectious',
    'Inflammatory',
    'Neoplastic',
    'TBI',
    'Vascular',
    'Neurodegenerative',
    'Metabolic',
    'Other',
    // Not a neuropathologic finding per se (a specimen/staining quality
    // flag, not a disease process) but reported via the exact same
    // present/description shape as every category above, and curators are
    // used to seeing it alongside them in the source spreadsheet -- see
    // item_utils/pathology_report.py::BRAIN_FINDING_CATEGORIES' own
    // matching comment.
    'Artifacts',
];

// BRAIN_FINDING_CATEGORIES' own plain labels ("TBI") don't match the
// schema's actual property names (schemas/brain_pathology_report.json's own
// "<category>_neuropathology_present"/"<category>_present" fields) --
// this is only ever used to look up each column's own info-icon
// description (ColumnHeaderInfo above), never for display.
const BRAIN_FINDING_SCHEMA_FIELDS = {
    Developmental: 'developmental_neuropathology_present',
    Infectious: 'infectious_neuropathology_present',
    Inflammatory: 'inflammatory_neuropathology_present',
    Neoplastic: 'neoplastic_neuropathology_present',
    TBI: 'tbi_neuropathology_present',
    Vascular: 'vascular_neuropathology_present',
    Neurodegenerative: 'neurodegenerative_neuropathology_present',
    Metabolic: 'metabolic_neuropathology_present',
    Other: 'other_pathology_present',
    Artifacts: 'artifacts_present',
};

// Mirrors item_utils/pathology_report.py::BRAIN_STAGING_FIELDS' own fixed
// display order/labels, plus `order` for the 3 ordinal (enum-string) fields
// (item_utils/pathology_report.py::BRAIN_STAGING_ORDINAL_ORDERS) -- every
// other field is a plain integer score, banded per-column the same way
// Ischemic Time bands its own values (buildRangeScoreClassifier), just
// scoped to one column's own values instead of the whole table's.
export const BRAIN_STAGING_FIELDS = [
    { key: 'abc_score_A', label: 'ABC-A' },
    { key: 'abc_score_B', label: 'ABC-B' },
    { key: 'abc_score_C', label: 'ABC-C' },
    { key: 'cerad_score', label: 'CERAD' },
    { key: 'ad_neuropathologic_change_level', label: 'AD Change', order: ['None', 'Low', 'Intermediate', 'High'] },
    { key: 'braak_pd', label: 'Braak PD' },
    { key: 'small_vessel_disease', label: 'SVD', order: ['None', 'Mild', 'Moderate', 'Severe'] },
    { key: 'braak_and_braak_ad', label: 'Braak & Braak AD', order: ['0', 'I', 'II', 'III', 'IV', 'V', 'VI'] },
    { key: 'thal', label: 'Thal' },
    { key: 'caa_vonsattel', label: 'CAA VonSattel' },
    { key: 'mckeith', label: 'McKeith' },
    { key: 'vonsattel_hd', label: 'VonSattel HD' },
];

// Pivots raw Tissue search results into one merged brain_findings map per
// donor (external_id -> Map(category -> {present, description})). A donor's
// brain pathology data can live on more than one of their Tissue records
// (the generic "Brain" tissue_type plus up to 5 region-specific ones --
// same BRAIN_REGION_INTERNAL_CODES BrowseTissueHeatmapTable.js's other tabs
// distribute a single whole-brain value across, see its own comment on
// distributeGenericBrainValue), but in practice only the record whose
// TissueSample the BrainPathologyReport actually links carries a non-null
// pathology_summary.brain_findings -- merging by donor (present OR'd,
// description first-non-empty, same convention
// item_utils/pathology_report.py::get_merged_brain_findings uses
// server-side across multiple reports) sidesteps having to know or care
// which one that is. Exported for unit testing.
export function buildDonorBrainFindings(tissueResults = []) {
    const byDonor = {};
    tissueResults.forEach((t) => {
        const donorId = t?.donor?.external_id;
        const findings = t?.pathology_summary?.brain_findings;
        if (!donorId || !findings) return;
        const byCategory = byDonor[donorId] || (byDonor[donorId] = new Map());
        findings.forEach((entry) => {
            const category = entry?.category;
            if (!category) return;
            const existing = byCategory.get(category);
            if (!existing) {
                byCategory.set(category, { present: !!entry.present, description: entry.description || null });
            } else {
                if (entry.present) existing.present = true;
                if (!existing.description && entry.description) existing.description = entry.description;
            }
        });
    });
    return byDonor;
}

// Same per-donor merge as buildDonorBrainFindings above, for
// pathology_summary.brain_staging instead -- a plain field -> value map, so
// merging 2 records for the same donor just keeps whichever value comes
// first (server-side aggregation across a donor's OWN pathology reports has
// already taken the max per field, see
// item_utils/pathology_report.py::get_max_brain_staging_scores; a 2nd
// non-null value for the same field on a different Tissue record of the
// same donor isn't expected in practice). Exported for unit testing.
export function buildDonorBrainStaging(tissueResults = []) {
    const byDonor = {};
    tissueResults.forEach((t) => {
        const donorId = t?.donor?.external_id;
        const staging = t?.pathology_summary?.brain_staging;
        if (!donorId || !staging) return;
        const existing = byDonor[donorId] || (byDonor[donorId] = {});
        Object.entries(staging).forEach(([field, value]) => {
            if (value === null || typeof value === 'undefined') return;
            if (existing[field] === undefined) existing[field] = value;
        });
    });
    return byDonor;
}

// Absent/Present read as the light/dark ends of the same shared score-0..4
// scale every other tab on this page uses (incl. any HeatmapColorPicker
// override, see BrowseTissueHeatmapTable.js) rather than inventing a new,
// one-off color pair just for this boolean -- score-0 for the "nothing to
// see" case, score-3 (not the darkest score-4) so a Present cell still
// reads as a clear flag without looking as severe as Autolysis Score's own
// top band.
function getBrainFindingScoreClass(value) {
    if (value === null || typeof value === 'undefined') return 'na';
    return value ? 'score-3' : 'score-0';
}

function formatBrainFinding(value) {
    if (value === null || typeof value === 'undefined') return 'n/a';
    return value ? 'Present' : 'Absent';
}

const BRAIN_FINDING_LEGEND_ENTRIES = [
    { className: 'score-0', label: 'Absent' },
    { className: 'score-3', label: 'Present' },
];

function BrainPathologyEmptyState() {
    return (
        <div className="tissue-heatmap-loading">
            No brain pathology report data found for the current population.
        </div>
    );
}

// Neuropathology Findings tab -- one column per finding category
// (BRAIN_FINDING_CATEGORIES), one row per donor with any brain pathology
// report data. Deliberately its own small table (not MetricHeatmapTable,
// which is built around a tissue_type column axis -- hrefs, germ-layer
// column grouping, brain-region merging/subtype padding, none of which
// apply here) reusing just the shared tissue-heatmap-card/-table/-cell CSS
// and FixedScoreLegend, so it still reads as the same visual family as the
// other 4 tabs.
export function BrainFindingsTable({ tissueResults = [] }) {
    const donorFindings = useMemo(() => buildDonorBrainFindings(tissueResults), [tissueResults]);
    const donors = useMemo(() => Object.keys(donorFindings).sort(), [donorFindings]);
    // Same click-a-swatch-to-dim-non-matching-cells filter FixedScoreLegend
    // already supports for the other tabs (see BrowseTissueHeatmapTable.js's
    // activeScoreClass/onScoreClassClick wiring) -- reimplemented locally
    // here since this table isn't a MetricHeatmapTable instance.
    const [activeClass, setActiveClass] = useState(null);
    const handleEntryClick = (className) =>
        setActiveClass((prev) => (prev === className ? null : className));

    if (donors.length === 0) return <BrainPathologyEmptyState />;

    return (
        <div className="tissue-heatmap-metric">
            <div className="tissue-heatmap-metric-heading">
                <div className="tissue-heatmap-metric-heading-row">
                    <div className="tissue-heatmap-metric-title-group">
                        <h2 className="tissue-heatmap-metric-title">
                            Neuropathology Findings
                            <i
                                className="icon icon-fw icon-info-circle fas tissue-heatmap-metric-title-info"
                                data-tip="Presence of each neuropathology finding category, aggregated across a donor's brain pathology report(s). Hover a Present cell for its reported description."
                            />
                        </h2>
                    </div>
                    <FixedScoreLegend
                        entries={BRAIN_FINDING_LEGEND_ENTRIES}
                        activeClassName={activeClass}
                        // eslint-disable-next-line react/jsx-no-bind
                        onEntryClick={handleEntryClick}
                    />
                </div>
            </div>
            <div className="tissue-heatmap-table-wrap">
                <table className="tissue-heatmap-table tissue-heatmap-metric-table">
                    <thead>
                        <tr>
                            <th className="tissue-heatmap-metric-donor-header">Donor ID</th>
                            {BRAIN_FINDING_CATEGORIES.map((category) => (
                                <th key={category} title={category}>
                                    {category}
                                    <ColumnHeaderInfo field={BRAIN_FINDING_SCHEMA_FIELDS[category]} />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {donors.map((donorId) => {
                            const byCategory = donorFindings[donorId];
                            return (
                                <tr key={donorId}>
                                    <td className="tissue-heatmap-metric-donor-id">{donorId}</td>
                                    {BRAIN_FINDING_CATEGORIES.map((category) => {
                                        const entry = byCategory.get(category) || null;
                                        const value = entry ? entry.present : null;
                                        const scoreClass = getBrainFindingScoreClass(value);
                                        const isDimmed = activeClass && scoreClass !== activeClass;
                                        const hasDescription = !!(entry?.present && entry.description);
                                        return (
                                            <td
                                                key={category}
                                                className={
                                                    `tissue-heatmap-cell ${scoreClass}` +
                                                    (value === null ? ' is-empty' : '') +
                                                    (isDimmed ? ' is-band-dimmed' : '')
                                                }
                                                data-tip={hasDescription ? entry.description : undefined}>
                                                {formatBrainFinding(value)}
                                                {/* A Present cell's own free-text description is only
                                                    reachable via hover (data-tip above) -- this dot is
                                                    the visual cue that there's more to see there,
                                                    without it a description-bearing cell looks
                                                    identical to a plain "Present" with nothing behind
                                                    it. */}
                                                {hasDescription ? (
                                                    <span
                                                        className="tissue-heatmap-finding-description-dot"
                                                        aria-hidden="true"
                                                    />
                                                ) : null}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// Neurodegenerative Staging tab -- one column per staging/severity score
// (BRAIN_STAGING_FIELDS), one row per donor. Each score has its own scale
// (an integer 0-100 CERAD count alongside a 4-level ordinal AD Neuropathologic
// Change, say), so unlike every other tab on this page there's no single
// table-wide banding that would be meaningful -- each column instead gets
// its OWN classifier, banded off just that column's own values (numeric
// fields via buildRangeScoreClassifier, same quantile-banding Ischemic Time
// uses table-wide, just scoped to 1 column; the 3 ordinal fields via their
// own fixed enum position instead, evenly mapped onto the same 5-band
// score-0..4 scale).
export function BrainStagingTable({ tissueResults = [] }) {
    const donorStaging = useMemo(() => buildDonorBrainStaging(tissueResults), [tissueResults]);
    const donors = useMemo(() => Object.keys(donorStaging).sort(), [donorStaging]);

    const classifiers = useMemo(() => {
        const result = {};
        BRAIN_STAGING_FIELDS.forEach((field) => {
            if (field.order) {
                const { order } = field;
                result[field.key] = (value) => {
                    const index = order.indexOf(value);
                    if (index === -1) return 'na';
                    return `score-${Math.round((index / (order.length - 1)) * 4)}`;
                };
            } else {
                const columnValues = donors
                    .map((donorId) => donorStaging[donorId][field.key])
                    .filter((value) => typeof value === 'number' && Number.isFinite(value));
                const { classify } = buildRangeScoreClassifier(columnValues, 5);
                result[field.key] = classify;
            }
        });
        return result;
    }, [donors, donorStaging]);

    if (donors.length === 0) return <BrainPathologyEmptyState />;

    return (
        <div className="tissue-heatmap-metric">
            <div className="tissue-heatmap-metric-heading">
                <div className="tissue-heatmap-metric-heading-row">
                    <div className="tissue-heatmap-metric-title-group">
                        <h2 className="tissue-heatmap-metric-title">
                            Neurodegenerative Staging
                            <i
                                className="icon icon-fw icon-info-circle fas tissue-heatmap-metric-title-info"
                                data-tip="Neurodegenerative disease staging/severity scores from brain pathology reports. Each score has its own scale, so every column is colored relative to just its own values."
                            />
                        </h2>
                    </div>
                </div>
            </div>
            <div className="tissue-heatmap-table-wrap">
                <table className="tissue-heatmap-table tissue-heatmap-metric-table">
                    <thead>
                        <tr>
                            <th className="tissue-heatmap-metric-donor-header">Donor ID</th>
                            {BRAIN_STAGING_FIELDS.map((field) => (
                                <th key={field.key} title={field.label}>
                                    {field.label}
                                    <ColumnHeaderInfo field={field.key} />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {donors.map((donorId) => {
                            const staging = donorStaging[donorId];
                            return (
                                <tr key={donorId}>
                                    <td className="tissue-heatmap-metric-donor-id">{donorId}</td>
                                    {BRAIN_STAGING_FIELDS.map((field) => {
                                        const value = staging[field.key];
                                        const hasValue = value !== null && typeof value !== 'undefined';
                                        const scoreClass = hasValue ? classifiers[field.key](value) : 'na';
                                        return (
                                            <td
                                                key={field.key}
                                                className={
                                                    `tissue-heatmap-cell ${scoreClass}` +
                                                    (!hasValue ? ' is-empty' : '')
                                                }>
                                                {hasValue ? value : 'n/a'}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}


// Pivots raw Tissue search results into one deduped list of
// pathology_summary.brain_diagnosis entries per donor -- a donor's brain
// pathology data can live on more than one of their Tissue records (same
// reasoning as buildDonorBrainFindings above), so the same underlying
// report's own outcome/diagnosis/notes can otherwise show up more than once
// per donor; deduped here by exact content (JSON.stringify) since these are
// plain, order-independent field triples with no natural merge the way a
// present/description pair or a numeric score has. Exported for unit
// testing.
export function buildDonorBrainDiagnosis(tissueResults = []) {
    const byDonor = {};
    tissueResults.forEach((t) => {
        const donorId = t?.donor?.external_id;
        const entries = t?.pathology_summary?.brain_diagnosis;
        if (!donorId || !entries) return;
        const seen = byDonor[donorId] || (byDonor[donorId] = new Map());
        entries.forEach((entry) => {
            const key = JSON.stringify(entry);
            if (!seen.has(key)) seen.set(key, entry);
        });
    });
    const result = {};
    Object.entries(byDonor).forEach(([donorId, seen]) => {
        result[donorId] = Array.from(seen.values());
    });
    return result;
}

// Diagnosis Summary tab -- one row per donor, showing the free-text review
// outcome/final diagnosis/notes from their brain pathology report(s)
// (Tissue.pathology_summary.brain_diagnosis). Unlike the other 2 tabs, this
// is prose, not a short banded value, so it deliberately does NOT reuse
// tissue-heatmap-table/tissue-heatmap-donor-id (its own
// tissue-heatmap-diagnosis-table/-donor classes instead) -- that shared
// table is styled (and its donor column positioned sticky) on the
// assumption of short, centered, nowrap heatmap values plus a leading
// order-label column this table has neither of; reusing it here left long
// diagnosis text overflowing its cell with nowrap+visible-overflow and
// visually overlapping the next column instead of wrapping.
export function BrainDiagnosisTable({ tissueResults = [] }) {
    const donorDiagnosis = useMemo(() => buildDonorBrainDiagnosis(tissueResults), [tissueResults]);
    const donors = useMemo(() => Object.keys(donorDiagnosis).sort(), [donorDiagnosis]);

    if (donors.length === 0) return <BrainPathologyEmptyState />;

    return (
        <div className="tissue-heatmap-metric">
            <div className="tissue-heatmap-metric-heading">
                <div className="tissue-heatmap-metric-heading-row">
                    <div className="tissue-heatmap-metric-title-group">
                        <h2 className="tissue-heatmap-metric-title">
                            Diagnosis Summary
                            <i
                                className="icon icon-fw icon-info-circle fas tissue-heatmap-metric-title-info"
                                data-tip="Review outcome and free-text final diagnosis/notes from each donor's brain pathology report(s)."
                            />
                        </h2>
                    </div>
                </div>
            </div>
            <div className="tissue-heatmap-table-wrap">
                <table className="tissue-heatmap-diagnosis-table">
                    <thead>
                        <tr>
                            <th>Donor ID</th>
                            <th>
                                Outcome
                                <ColumnHeaderInfo field="outcome" />
                            </th>
                            <th>
                                Final Neuropathological Diagnosis
                                <ColumnHeaderInfo field="final_neuropathological_diagnosis" />
                            </th>
                            <th>
                                Additional Notes
                                <ColumnHeaderInfo field="additional_notes" />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {donors.map((donorId) => {
                            const entries = donorDiagnosis[donorId];
                            return entries.map((entry, entryIndex) => (
                                // A 2nd+ distinct report for the same donor (rare) gets
                                // its own row rather than being silently dropped or
                                // squeezed into the same cell as the 1st.
                                // eslint-disable-next-line react/no-array-index-key
                                <tr key={`${donorId}-${entryIndex}`}>
                                    {entryIndex === 0 ? (
                                        <td className="tissue-heatmap-diagnosis-donor" rowSpan={entries.length}>
                                            {donorId}
                                        </td>
                                    ) : null}
                                    <td>
                                        {entry.outcome ? (
                                            <span
                                                className={
                                                    'tissue-heatmap-outcome-badge' +
                                                    (entry.outcome === 'Unacceptable' ? ' is-unacceptable' : ' is-acceptable')
                                                }>
                                                {entry.outcome}
                                            </span>
                                        ) : 'n/a'}
                                    </td>
                                    <td>{entry.final_neuropathological_diagnosis || 'n/a'}</td>
                                    <td>
                                        {entry.additional_notes || (entry.unacceptable_description ? '' : 'n/a')}
                                        {/* unacceptable_description is only ever submitted
                                            alongside outcome: "Unacceptable" (see
                                            get_brain_diagnosis_summary's own docstring) --
                                            surfaced here rather than as its own column since
                                            it's rare and reads as a 2nd kind of note, not a
                                            fundamentally different field. */}
                                        {entry.unacceptable_description ? (
                                            <div className="tissue-heatmap-unacceptable-note">
                                                <strong>Unacceptable: </strong>
                                                {entry.unacceptable_description}
                                            </div>
                                        ) : null}
                                    </td>
                                </tr>
                            ));
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
