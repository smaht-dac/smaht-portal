'use strict';

import React, { useMemo } from 'react';
import { BRAIN_FINDING_CATEGORIES } from '../../../browse/browse-view/BrowseBrainPathologyTable';
import { formatDonorAge } from '../donor-overview/ProtectedDonorViewDataCards';
import {
    getDonorHref,
    getDisplayText,
    getAutolysisScoreCellClass,
    PathologyOutcomeBadge,
} from './helpers';
import {
    getLinkId,
    getUuidFromAtId,
    AutolysisHeaderInfo,
    FindingsChip,
    HistologyImagesLink,
    groupReportsByDonorUuid,
    getDonorHistologyImagesHref,
    useSortableRows,
    useScrollToHighlightedReport,
} from './PathologyReportsTable';

// BrainPathologyReport's own present/description field pair per finding
// category (schemas/brain_pathology_report.json), keyed by
// BRAIN_FINDING_CATEGORIES' display labels -- same pairs as
// item_utils/pathology_report.py::BRAIN_FINDING_CATEGORIES.
const BRAIN_FINDING_FIELDS = {
    Developmental: ['developmental_neuropathology_present', 'developmental_neuropathology_description'],
    Infectious: ['infectious_neuropathology_present', 'infectious_neuropathology_description'],
    Inflammatory: ['inflammatory_neuropathology_present', 'inflammatory_neuropathology_description'],
    Neoplastic: ['neoplastic_neuropathology_present', 'neoplastic_neuropathology_description'],
    TBI: ['tbi_neuropathology_present', 'tbi_neuropathology_description'],
    Vascular: ['vascular_neuropathology_present', 'vascular_neuropathology_description'],
    Neurodegenerative: ['neurodegenerative_neuropathology_present', 'neurodegenerative_neuropathology_description'],
    Metabolic: ['metabolic_neuropathology_present', 'metabolic_neuropathology_description'],
    Other: ['other_pathology_present', 'other_pathology_description'],
    Artifacts: ['artifacts_present', 'artifacts_description'],
};

const STAINING_FIELD = 'additional_age-related_staining_performed';

// A brain region Tissue's TPC code -> its BrainPathologyReport
// brain_subregions[].subregion -- the inverse of
// item_utils/pathology_report.py::BRAIN_SUBREGION_TISSUE_CODES.
const BRAIN_SUBREGION_BY_TISSUE_CODE = {
    '3AM': 'Cerebellum Left Hemisphere',
    '3AK': 'Frontal Lobe Left Hemisphere',
    '3AN': 'Hippocampus Left Hemisphere',
    '3AO': 'Hippocampus Right Hemisphere',
    '3AL': 'Temporal Lobe Left Hemisphere',
};

// Only the fields this table reads, off a BrainPathologyReport /search/ result.
export const BRAIN_PATHOLOGY_REPORT_SEARCH_FIELDS = [
    'accession',
    'outcome',
    'unacceptable_description',
    'additional_notes',
    'final_neuropathological_diagnosis',
    'brain_subregions',
    STAINING_FIELD,
    ...Object.values(BRAIN_FINDING_FIELDS).flat(),
    'histology_images.@id',
    'tissue_samples.display_title',
    'tissue_samples.sample_sources.tissue_type',
    'tissue_samples.sample_sources.donor.uuid',
]
    .map((field) => `field=${encodeURIComponent(field)}`)
    .join('&');

// A BrainPathologyReport covers the whole brain and scores autolysis per
// region -- only this region's own entry counts, and none when the region
// wasn't present in the report (same rule as get_tissue_autolysis_score).
const getRegionAutolysisScore = (report, tissueCode) => {
    const subregion = BRAIN_SUBREGION_BY_TISSUE_CODE[tissueCode];
    const entry = (report?.brain_subregions || []).find((e) => e?.subregion === subregion);
    return entry?.is_present === 'Yes' ? entry.tissue_autolysis_score ?? null : null;
};

// Every category with `present` true/false, or null when the report didn't
// address it at all (not the same as an explicit "No").
const getBrainFindings = (report) =>
    BRAIN_FINDING_CATEGORIES.map((category) => {
        const [presentField, descriptionField] = BRAIN_FINDING_FIELDS[category];
        const value = report?.[presentField];
        return {
            category,
            present: value === 'Yes' ? true : value === 'No' ? false : null,
            description: report?.[descriptionField] || null,
        };
    });

// Artifacts is a specimen/staining quality flag, not a pathologic finding --
// left out of the findings count, same as has_pathologic_finding.
const getPresentFindings = (report) =>
    getBrainFindings(report)
        .filter((finding) => finding.present && finding.category !== 'Artifacts')
        .map((finding) => {
            return { type: finding.category, text: finding.description || 'Present' };
        });

// The report's own samples of this brain region -- one report links every
// region's samples.
const getRegionSamples = (report, tissueTypeValue) =>
    (report?.tissue_samples || []).filter((sample) =>
        (sample?.sample_sources || []).some((source) => source?.tissue_type === tissueTypeValue)
    );

const getReportImageIds = (report) => (report?.histology_images || []).map(getLinkId).filter(Boolean);

// "Yes" when any of the donor's reports had additional staining, "No" when
// they all answered no, null when none answered.
const getStainingValue = (reports) => {
    const values = (reports || []).map((report) => report?.[STAINING_FIELD]).filter(Boolean);
    if (values.includes('Yes')) return 'Yes';
    return values.length > 0 ? 'No' : null;
};

/**
 * One BrainPathologyReport, expanded under its donor's row. Everything but
 * Sample Details is brain-wide, so it reads the same on every brain region's
 * page -- only the samples (and their autolysis) are this region's own.
 */
const BrainReportDetails = ({ report, tissueCode, tissueTypeValue, enableConditionalColor, isHighlighted }) => {
    const reportUuid = getUuidFromAtId(report['@id']);
    const samples = getRegionSamples(report, tissueTypeValue);
    const autolysisScore = getRegionAutolysisScore(report, tissueCode);
    const imageIds = getReportImageIds(report);
    const outcomeBadge = (
        <PathologyOutcomeBadge outcome={report.outcome} unacceptableDescription={report.unacceptable_description} />
    );
    return (
        <div
            id={reportUuid ? `pathology-report-${reportUuid}` : undefined}
            className={'brain-report-details' + (isHighlighted ? ' is-highlighted' : '')}>
            <div className="brain-report-sections">
                <section className="brain-report-section brain-report-samples">
                    <div className="brain-report-section-title">Sample Details</div>
                    <table className="pathology-aliquot-table">
                        <colgroup>
                            <col style={{ width: '38%' }} />
                            <col style={{ width: '24%' }} />
                            <col style={{ width: '18%' }} />
                            <col style={{ width: '20%' }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th>Aliquot ID</th>
                                <th>Outcome</th>
                                <th>Autolysis</th>
                                <th>Histology</th>
                            </tr>
                        </thead>
                        <tbody>
                            {samples.length > 0 ? (
                                samples.map((sample) => (
                                    <tr key={sample['@id'] || sample.display_title}>
                                        <td>
                                            <a href={report['@id']} target="_blank" rel="noopener noreferrer">
                                                {sample.display_title}
                                            </a>
                                        </td>
                                        <td>{outcomeBadge}</td>
                                        <td
                                            className={
                                                enableConditionalColor ? getAutolysisScoreCellClass(autolysisScore) : ''
                                            }>
                                            {getDisplayText(autolysisScore)}
                                        </td>
                                        <td>
                                            {imageIds.length > 0 ? (
                                                <HistologyImagesLink
                                                    imageIds={imageIds}
                                                    searchHref={`/search/?type=HistologyImage&pathology_reports.uuid=${reportUuid}`}
                                                    showCount={imageIds.length > 1}
                                                />
                                            ) : (
                                                <span className="text-muted-placeholder">-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} className="text-muted-placeholder">
                                        No sample of this region in this report.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </section>
                <section className="brain-report-section brain-report-diagnosis">
                    <div className="brain-report-section-title">Brain Diagnosis Summary</div>
                    <table className="pathology-aliquot-table">
                        <colgroup>
                            <col style={{ width: '14%' }} />
                            <col style={{ width: '60%' }} />
                            <col style={{ width: '26%' }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th>Outcome</th>
                                <th>Final Neuropathological Diagnosis</th>
                                <th>Additional Notes</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>{outcomeBadge}</td>
                                <td>
                                    {report.final_neuropathological_diagnosis || (
                                        <span className="text-muted-placeholder">n/a</span>
                                    )}
                                </td>
                                <td>
                                    {report.additional_notes || <span className="text-muted-placeholder">n/a</span>}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </section>
            </div>
            <section className="brain-report-section">
                <div className="brain-report-section-title">Neuropathology Findings</div>
                <table className="pathology-aliquot-table brain-findings-table">
                    <thead>
                        <tr>
                            {BRAIN_FINDING_CATEGORIES.map((category) => (
                                <th key={category}>{category}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            {getBrainFindings(report).map(({ category, present, description }) => (
                                <td key={category} className={present ? 'is-finding-present' : undefined}>
                                    {present ? (
                                        description || 'Present'
                                    ) : present === false ? (
                                        <span className="text-muted-placeholder">Absent</span>
                                    ) : null}
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </section>
        </div>
    );
};

/**
 * Donor rows for a brain region tissue_type, each expandable into the
 * donor's BrainPathologyReport. `donors` are TissueTypeView's {donor,
 * tissue} entries; `reports` are every BrainPathologyReport linking a sample
 * of this region, or null while loading. Expanded rows are controlled by the
 * caller, same as PathologyReportsTable.
 */
export default function BrainPathologyReportsTable({
    donors,
    reports,
    tissueTypeValue,
    tissueIconSrc,
    userDownloadAccess,
    enableConditionalColor = true,
    expandedDonorUuids,
    onToggleDonor,
    highlightedReportId = null,
}) {
    const [tissueCode] = String(tissueTypeValue || '').split(' - ');
    const reportsByDonorUuid = useMemo(() => groupReportsByDonorUuid(reports), [reports]);

    const rows = useMemo(
        () =>
            donors.map(({ donor: d, tissue: t }) => {
                const donorReports = reports ? reportsByDonorUuid[d.uuid] || [] : null;
                const regionScores = (donorReports || [])
                    .map((report) => getRegionAutolysisScore(report, tissueCode))
                    .filter((score) => typeof score === 'number');
                return {
                    donor: d,
                    donorReports,
                    // The region's own score off the reports, falling back to
                    // the Tissue's rolled-up one when no report scores it.
                    autolysisScore:
                        regionScores.length > 0
                            ? Math.max(...regionScores)
                            : t?.pathology_summary?.autolysis_score ?? null,
                    findings: (donorReports || []).flatMap(getPresentFindings),
                    staining: getStainingValue(donorReports),
                    imageIds: Array.from(new Set((donorReports || []).flatMap(getReportImageIds))),
                };
            }),
        [donors, reports, reportsByDonorUuid, tissueCode]
    );

    // Histology Images isn't sortable -- it's a link/count.
    const { sortedRows, renderSortableHeader } = useSortableRows(rows, {
        donorId: ({ donor: d }) => getDisplayText(d),
        age: ({ donor: d }) => (typeof d?.age === 'number' ? d.age : null),
        sex: ({ donor: d }) => d?.sex ?? null,
        autolysisScore: ({ autolysisScore }) => autolysisScore,
        findings: ({ donorReports, findings }) => (donorReports && donorReports.length > 0 ? findings.length : null),
        staining: ({ staining }) => staining,
    });

    useScrollToHighlightedReport(highlightedReportId, expandedDonorUuids);

    if (donors.length === 0) {
        return <div className="pathology-reports-empty">No donor data available for this tissue type.</div>;
    }

    return (
        <table className="tissue-donor-table pathology-reports-table table">
            <colgroup>
                <col style={{ width: '15%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '14%' }} />
            </colgroup>
            <thead>
                <tr>
                    <th>{renderSortableHeader('donorId', 'Donor ID')}</th>
                    <th>{renderSortableHeader('age', 'Age')}</th>
                    <th>{renderSortableHeader('sex', 'Sex')}</th>
                    <th>
                        {renderSortableHeader('autolysisScore', 'Autolysis')}
                        <AutolysisHeaderInfo />
                    </th>
                    <th>{renderSortableHeader('findings', 'Unexpected/Pathologic Finding')}</th>
                    <th>{renderSortableHeader('staining', 'Neuropathology Staining')}</th>
                    <th>Histology Images</th>
                </tr>
            </thead>
            {sortedRows.map(({ donor: d, donorReports, autolysisScore, findings, staining, imageIds }) => {
                const donorHref = getDonorHref(d, userDownloadAccess);
                const isExpanded = expandedDonorUuids.has(d.uuid);
                const hasReports = !!donorReports && donorReports.length > 0;
                const donorLabel = getDisplayText(d);
                return (
                    <tbody key={d.uuid} className={isExpanded ? 'is-expanded' : undefined}>
                        <tr className="pathology-donor-row">
                            <td>
                                <button
                                    type="button"
                                    className="pathology-row-toggle"
                                    aria-expanded={isExpanded}
                                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${donorLabel} pathology report`}
                                    // eslint-disable-next-line react/jsx-no-bind
                                    onClick={() => onToggleDonor(d.uuid)}>
                                    <i className={`icon fas ${isExpanded ? 'icon-minus' : 'icon-plus'}`} />
                                </button>
                                {donorHref ? <a href={donorHref}>{donorLabel}</a> : donorLabel}
                            </td>
                            <td>{getDisplayText(formatDonorAge(d.age))}</td>
                            <td>{getDisplayText(d.sex)}</td>
                            <td className={enableConditionalColor ? getAutolysisScoreCellClass(autolysisScore) : ''}>
                                {getDisplayText(autolysisScore)}
                            </td>
                            <td>
                                {donorReports === null ? (
                                    <i className="icon icon-circle-notch icon-spin fas" />
                                ) : !hasReports ? (
                                    <span className="text-muted-placeholder">n/a</span>
                                ) : findings.length > 0 ? (
                                    <span className="pathology-findings-cell">
                                        Yes :
                                        <FindingsChip donorId={d.uuid} findings={findings} />
                                    </span>
                                ) : (
                                    <span className="text-muted-placeholder">No</span>
                                )}
                            </td>
                            <td>
                                {staining || <span className="text-muted-placeholder">n/a</span>}
                            </td>
                            <td>
                                {imageIds.length > 0 ? (
                                    <HistologyImagesLink
                                        imageIds={imageIds}
                                        searchHref={getDonorHistologyImagesHref(tissueTypeValue, donorLabel)}
                                        showCount
                                    />
                                ) : (
                                    <span className="text-muted-placeholder">n/a</span>
                                )}
                            </td>
                        </tr>
                        {isExpanded ? (
                            <tr className="pathology-aliquot-row">
                                <td colSpan={7}>
                                    <div className="pathology-aliquot-heading brain-report-heading">
                                        {tissueIconSrc ? (
                                            <i
                                                className="tissue-icon-mask"
                                                style={{
                                                    WebkitMaskImage: `url(${tissueIconSrc})`,
                                                    maskImage: `url(${tissueIconSrc})`,
                                                }}
                                            />
                                        ) : null}
                                        {donorLabel} Brain Pathology Report
                                    </div>
                                    {donorReports === null ? (
                                        <i className="icon icon-circle-notch icon-spin fas" />
                                    ) : hasReports ? (
                                        donorReports.map((report) => (
                                            <BrainReportDetails
                                                key={report['@id']}
                                                report={report}
                                                tissueCode={tissueCode}
                                                tissueTypeValue={tissueTypeValue}
                                                enableConditionalColor={enableConditionalColor}
                                                isHighlighted={report['@id'] === highlightedReportId}
                                            />
                                        ))
                                    ) : (
                                        <div className="pathology-reports-empty">
                                            No pathology report for this donor yet.
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ) : null}
                    </tbody>
                );
            })}
        </table>
    );
}
