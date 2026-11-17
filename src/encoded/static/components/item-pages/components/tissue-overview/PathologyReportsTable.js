'use strict';

import React, { useEffect, useMemo, useState } from 'react';
import { OverlayTrigger, Popover, PopoverBody, PopoverHeader } from 'react-bootstrap';
import {
    SortableHeaderLabel,
    compareSortValues,
} from '../../../browse/browse-view/BrowseTissueHeatmapTable';
import { formatDonorAge } from '../donor-overview/ProtectedDonorViewDataCards';
import {
    getDonorHref,
    getDisplayText,
    getAutolysisScoreCellClass,
    PathologyOutcomeBadge,
} from './helpers';

// Only the fields this table reads, off a NonBrainPathologyReport /search/
// result -- `field=` keeps each report's embedded tissue_samples/
// histology_images down to just what's listed instead of their full embeds.
export const PATHOLOGY_REPORT_SEARCH_FIELDS = [
    'accession',
    'outcome',
    'unacceptable_description',
    'tissue_autolysis_score',
    'target_tissues',
    'non_target_tissues',
    'pathologic_findings',
    'histology_images.@id',
    'tissue_samples.display_title',
    'tissue_samples.sample_sources.donor.uuid',
]
    .map((field) => `field=${encodeURIComponent(field)}`)
    .join('&');

// NonBrainPathologyReport.pathologic_findings[].finding_type values, in
// schema order -- one column each in the aliquot table.
const FINDING_TYPES = ['Inflammation', 'Metaplasia', 'Neoplasia/Tumor/Carcinoma', 'Necrosis', 'Other'];

// Same 0..3 scale as NonBrainPathologyReport.tissue_autolysis_score's own
// schema description.
const AUTOLYSIS_SCORE_LABELS = ['None', 'Mild', 'Moderate', 'Severe'];

// The order NON_TARGET_TISSUE_PERCENTAGE_ORDER (item_utils/pathology_report.py)
// ranks bands in -- used to sort the Non-Target Tissue % column.
const NON_TARGET_PERCENTAGE_ORDER = ['[0-10]', '[11-25]', '[26-49]', '[50-100]'];

// A report's donor(s) -- normally one, via its tissue samples' Tissue.
export const getReportDonorUuids = (report) => {
    const uuids = new Set();
    (report?.tissue_samples || []).forEach((sample) => {
        (sample?.sample_sources || []).forEach((source) => {
            if (source?.donor?.uuid) uuids.add(source.donor.uuid);
        });
    });
    return Array.from(uuids);
};

export const getLinkId = (item) => (typeof item === 'string' ? item : item?.['@id']) || null;

// "/non-brain-pathology-reports/<uuid>/" -> "<uuid>".
export const getUuidFromAtId = (atId) => {
    const [, , uuid] = String(atId || '').split('/');
    return uuid || null;
};

// "[50-100]" -> "50-100%", "0" -> "0%".
const formatPercentageBand = (band) => (band ? `${String(band).replace(/^\[|\]$/g, '')}%` : null);

const getAliquotIds = (report) =>
    (report?.tissue_samples || []).map((sample) => sample?.display_title).filter(Boolean);

// A report's present target tissue subtypes, in submitted order.
const getPresentTargetTissues = (report) =>
    (report?.target_tissues || []).filter(
        (entry) =>
            entry?.target_tissue_present === 'Yes' && (entry.target_tissue_subtype || entry.target_tissue_percentage)
    );

// e.g. "50-100% Lung", one per present target tissue subtype.
const getTargetTissueLines = (report) =>
    getPresentTargetTissues(report).map((entry) =>
        [formatPercentageBand(entry.target_tissue_percentage), entry.target_tissue_subtype].filter(Boolean).join(' ')
    );

const formatNonTargetLine = (subtype, band, description = null) => {
    const label = subtype === 'Other' && description ? `Other (${description})` : subtype;
    const percentage = formatPercentageBand(band);
    return percentage ? `${label}: ${percentage}` : label;
};

// e.g. "Fibroadipose: 50-100%", one per present non-target tissue subtype.
const getNonTargetTissueLines = (report) =>
    (report?.non_target_tissues || [])
        .filter((entry) => entry?.non_target_tissue_present === 'Yes' && entry.non_target_tissue_subtype)
        .map((entry) =>
            formatNonTargetLine(
                entry.non_target_tissue_subtype,
                entry.non_target_tissue_percentage,
                entry.non_target_tissue_description
            )
        );

// Each present finding as its finding_type plus display text -- the
// description when given (e.g. "Edema"), else just "Present".
const getPresentFindings = (report) =>
    (report?.pathologic_findings || [])
        .filter((entry) => entry?.finding_present === 'Yes' && entry.finding_type)
        .map((entry) => {
            const percentage = formatPercentageBand(entry.finding_percentage);
            const text = entry.finding_description || 'Present';
            return { type: entry.finding_type, text: percentage ? `${text} (${percentage})` : text };
        });

const getAliquotSortKey = (report) => getAliquotIds(report)[0] || '';

// Each present target tissue subtype's own autolysis score, stacked in the
// aliquot row's Autolysis cell in the same order as the Target Tissue %
// lines beside it (getTargetTissueLines), so each score sits level with its
// subtype -- "-" for a subtype with no score. Only when they add something
// to the report-level score: more than one subtype, or a different score.
const getSubtypeAutolysisLines = (report) => {
    const entries = getPresentTargetTissues(report);
    const scores = entries.map((entry) =>
        typeof entry.target_tissue_autolysis_score === 'number' ? entry.target_tissue_autolysis_score : null
    );
    if (!scores.some((score) => score !== null)) return [];
    const differs = scores.some((score) => score !== null && score !== report?.tissue_autolysis_score);
    return entries.length > 1 || differs ? scores.map((score) => getDisplayText(score)) : [];
};

// Lines stacked one per row, or a muted placeholder when there are none.
export const StackedLines = ({ lines, emptyText = 'None' }) =>
    lines.length > 0 ? (
        lines.map((line, i) => <div key={i}>{line}</div>)
    ) : (
        <span className="text-muted-placeholder">{emptyText}</span>
    );

// Column-header info icon -- hover/focus opens the portal's standard
// definitions popover (header band + padded body).
const HeaderInfo = ({ id, title, className = '', children }) => (
    <OverlayTrigger
        trigger={['hover', 'focus']}
        placement="top"
        overlay={
            <Popover
                id={id}
                className={'description-definitions-popover pathology-header-info-popover ' + className}>
                <PopoverHeader>{title}</PopoverHeader>
                <PopoverBody className="p-3">{children}</PopoverBody>
            </Popover>
        }>
        <i className="icon icon-info-circle fas pathology-header-info-icon" tabIndex={0} />
    </OverlayTrigger>
);

// `forDonorRow`: the donor table rolls several reports into one row, so its
// popovers also say how; the per-aliquot table shows one report per row.
export const AutolysisHeaderInfo = ({ forDonorRow = true }) => (
    <HeaderInfo
        id="tissue-autolysis-legend-popover"
        title="Tissue Autolysis Score"
        className="tissue-autolysis-legend-popover">
        <p>
            How far the tissue has broken down after death, as graded by the pathologist.
            {forDonorRow
                ? " The donor row shows the highest score across that donor's reports."
                : ' When target tissues are scored separately, each score is listed level with its target tissue; the color follows the overall score.'}{' '}
            An overall score of 3 makes a sample unacceptable.
        </p>
        {AUTOLYSIS_SCORE_LABELS.map((label, score) => (
            <div className="tissue-autolysis-legend-row" key={score}>
                <span className={`tissue-autolysis-legend-swatch score-${score}`}>{score}</span>
                {label}
            </div>
        ))}
    </HeaderInfo>
);

const NonTargetHeaderInfo = ({ forDonorRow = true }) => (
    <HeaderInfo id="non-target-tissue-info-popover" title="Non-Target Tissue %">
        <p className="mb-0">
            Tissue in the sample other than the target tissue (e.g. fibroadipose or lymphoid), with the percentage
            range of the sample it makes up.
            {forDonorRow
                ? " The donor row shows the highest range reported for each non-target tissue across that donor's reports."
                : ''}
        </p>
    </HeaderInfo>
);

const TargetTissueHeaderInfo = () => (
    <HeaderInfo id="target-tissue-info-popover" title="Target Tissue %">
        <p className="mb-0">
            The tissue the sample was meant to contain, with the percentage range of the sample it makes up. A sample
            is unacceptable if target tissues make up less than 10% of the tissue on the slide.
        </p>
    </HeaderInfo>
);

const OutcomeHeaderInfo = () => (
    <HeaderInfo id="pathology-outcome-info-popover" title="Outcome">
        A sample is unacceptable if any of the following apply:
        <ol className="mt-2 mb-0 ps-3">
            <li>target tissues comprise &lt;10% of the tissue on the slide;</li>
            <li>the overall autolysis score is 3;</li>
            <li>a significant unexpected pathological finding is present.</li>
        </ol>
    </HeaderInfo>
);

export const FindingsHeaderInfo = ({ isBrain = false }) => (
    <HeaderInfo id="pathologic-finding-info-popover" title="Unexpected/Pathologic Finding">
        <p className="mb-0">
            {isBrain
                ? 'Whether the pathologist reported a neuropathologic finding (developmental, infectious, inflammatory, neoplastic, TBI, vascular, neurodegenerative, metabolic or other). Artifacts are a specimen quality issue and are not counted. '
                : 'Whether the pathologist reported an unexpected or pathologic finding in the sample (inflammation, metaplasia, neoplasia/tumor/carcinoma, necrosis or other). '}
            The count covers all of the donor&apos;s reports; click it to see each finding. A significant finding makes
            a sample unacceptable.
        </p>
    </HeaderInfo>
);

// "N Findings" chip -- opens a list of every present finding (per aliquot,
// when `aliquotId` is given).
export const FindingsChip = ({ donorId, findings }) => (
    <OverlayTrigger
        trigger="click"
        rootClose
        placement="bottom"
        overlay={
            <Popover id={`pathology-findings-${donorId}`} className="pathology-findings-popover">
                <PopoverBody>
                    <table>
                        <tbody>
                            {findings.map(({ aliquotId, type, text }, i) => (
                                <tr key={i}>
                                    {aliquotId ? <td className="finding-aliquot">{aliquotId}</td> : null}
                                    <td className="finding-type">{type}</td>
                                    <td>{text}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </PopoverBody>
            </Popover>
        }>
        <button type="button" className="pathology-findings-chip">
            <i className="icon icon-flag fas" />
            {findings.length} {findings.length === 1 ? 'Finding' : 'Findings'}
            <i className="icon icon-caret-down fas" />
        </button>
    </OverlayTrigger>
);

// Image link: the image itself when there's just one, else the matching
// HistologyImage search.
export const HistologyImagesLink = ({ imageIds, searchHref, showCount }) => {
    if (imageIds.length === 0) return null;
    const href = imageIds.length === 1 ? imageIds[0] : searchHref;
    return (
        <a className="histology-images-link" href={href} target="_blank" rel="noopener noreferrer">
            {showCount ? imageIds.length : null}
            <i className="icon icon-image fas" />
        </a>
    );
};

// Every donor's reports, keyed by donor uuid -- null while `reports` loads.
export const groupReportsByDonorUuid = (reports) => {
    const byDonor = {};
    (reports || []).forEach((report) => {
        getReportDonorUuids(report).forEach((uuid) => {
            (byDonor[uuid] || (byDonor[uuid] = [])).push(report);
        });
    });
    return byDonor;
};

// HistologyImage search for one donor's images of this tissue_type -- what
// the donor row's image count links to when there's more than one.
export const getDonorHistologyImagesHref = (tissueTypeValue, donorLabel) =>
    '/search/?type=HistologyImage' +
    `&pathology_reports.tissue_samples.sample_sources.tissue_type=${encodeURIComponent(tissueTypeValue)}` +
    `&pathology_reports.tissue_samples.sample_sources.donor.display_title=${encodeURIComponent(donorLabel)}`;

/**
 * Click-to-sort for a donor table -- same asc/desc/none cycle as
 * BrowseTissueHeatmapTable.js's own tables. `sortValueGetters` maps a column
 * key to a row's sort value; a column without one isn't sortable.
 */
export function useSortableRows(rows, sortValueGetters) {
    const [sortState, setSortState] = useState(null);
    const sortedRows = useMemo(() => {
        const getSortValue = sortState ? sortValueGetters[sortState.key] : null;
        if (!getSortValue) return rows;
        return [...rows].sort((a, b) => compareSortValues(getSortValue(a), getSortValue(b), sortState.direction));
        // sortValueGetters only reads its arguments, so it isn't a dependency.
    }, [rows, sortState]);
    const renderSortableHeader = (key, label) => (
        <SortableHeaderLabel
            label={label}
            sortDirection={sortState?.key === key ? sortState.direction : null}
            // eslint-disable-next-line react/jsx-no-bind
            onClick={() => {
                setSortState((prev) => {
                    if (!prev || prev.key !== key) return { key, direction: 'asc' };
                    if (prev.direction === 'asc') return { key, direction: 'desc' };
                    return null;
                });
            }}
        />
    );
    return { sortedRows, renderSortableHeader };
}

// Brings a report opened from outside (the aliquot diagram) into view once
// its donor's row has expanded -- the report's element carries
// `id="pathology-report-<uuid>"`.
export function useScrollToHighlightedReport(highlightedReportId, expandedDonorUuids) {
    useEffect(() => {
        if (!highlightedReportId) return;
        const reportUuid = getUuidFromAtId(highlightedReportId);
        const element = reportUuid ? document.getElementById(`pathology-report-${reportUuid}`) : null;
        if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [highlightedReportId, expandedDonorUuids]);
}

const AliquotReportsTable = ({ reports, highlightedReportId, enableConditionalColor }) => (
    <table className="pathology-aliquot-table">
        <colgroup>
            <col style={{ width: '11%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '5%' }} />
        </colgroup>
        <thead>
            <tr>
                <th>Aliquot ID</th>
                <th>
                    Outcome
                    <OutcomeHeaderInfo />
                </th>
                <th>
                    Autolysis
                    <AutolysisHeaderInfo forDonorRow={false} />
                </th>
                <th>
                    Target Tissue %
                    <TargetTissueHeaderInfo />
                </th>
                <th>
                    Non-Target Tissue %
                    <NonTargetHeaderInfo forDonorRow={false} />
                </th>
                {FINDING_TYPES.map((type) => (
                    // A line-break opportunity after each "/" -- "Neoplasia/Tumor/Carcinoma"
                    // is otherwise one unbreakable word in its narrow column.
                    <th key={type}>
                        {type.split('/').map((part, i, parts) => (
                            <React.Fragment key={i}>
                                {part}
                                {i < parts.length - 1 ? (
                                    <>
                                        /<wbr />
                                    </>
                                ) : null}
                            </React.Fragment>
                        ))}
                    </th>
                ))}
                <th>Histology</th>
            </tr>
        </thead>
        <tbody>
            {reports.map((report) => {
                const reportId = report['@id'];
                const findings = getPresentFindings(report);
                const imageIds = (report.histology_images || []).map(getLinkId).filter(Boolean);
                const reportUuid = getUuidFromAtId(reportId);
                const subtypeAutolysisLines = getSubtypeAutolysisLines(report);
                return (
                    <tr
                        key={reportId}
                        id={reportUuid ? `pathology-report-${reportUuid}` : undefined}
                        className={reportId === highlightedReportId ? 'is-highlighted' : undefined}>
                        <td>
                            <a href={reportId} target="_blank" rel="noopener noreferrer">
                                <StackedLines lines={getAliquotIds(report)} emptyText={report.accession} />
                            </a>
                        </td>
                        <td>
                            <PathologyOutcomeBadge
                                outcome={report.outcome}
                                unacceptableDescription={report.unacceptable_description}
                            />
                        </td>
                        {/* Colored by the report-level score either way. */}
                        <td
                            className={
                                enableConditionalColor ? getAutolysisScoreCellClass(report.tissue_autolysis_score) : ''
                            }>
                            {subtypeAutolysisLines.length > 0 ? (
                                <StackedLines lines={subtypeAutolysisLines} />
                            ) : (
                                getDisplayText(report.tissue_autolysis_score)
                            )}
                        </td>
                        <td>
                            <StackedLines lines={getTargetTissueLines(report)} />
                        </td>
                        <td>
                            <StackedLines lines={getNonTargetTissueLines(report)} />
                        </td>
                        {FINDING_TYPES.map((type) => {
                            const lines = findings.filter((f) => f.type === type).map((f) => f.text);
                            return (
                                <td key={type} className={lines.length > 0 ? 'is-finding-present' : undefined}>
                                    <StackedLines lines={lines} />
                                </td>
                            );
                        })}
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
                );
            })}
        </tbody>
    </table>
);

/**
 * Donor rows for a non-brain tissue_type, each expandable into its aliquots'
 * own pathology reports. `donors` are TissueTypeView's {donor, tissue}
 * entries (one representative Tissue per donor); `reports` are every
 * NonBrainPathologyReport for this tissue_type, or null while loading.
 * Expanded rows are controlled by the caller so the aliquot diagram's report
 * links can open a donor's row.
 */
export default function PathologyReportsTable({
    donors,
    reports,
    tissueName,
    tissueTypeValue,
    tissueIconSrc,
    userDownloadAccess,
    enableConditionalColor = true,
    expandedDonorUuids,
    onToggleDonor,
    highlightedReportId = null,
}) {
    const reportsByDonorUuid = useMemo(() => {
        const byDonor = groupReportsByDonorUuid(reports);
        Object.values(byDonor).forEach((list) =>
            list.sort((a, b) =>
                getAliquotSortKey(a).localeCompare(getAliquotSortKey(b), undefined, { numeric: true })
            )
        );
        return byDonor;
    }, [reports]);

    const rows = useMemo(
        () =>
            donors.map(({ donor: d, tissue: t }) => {
                const donorReports = reports ? reportsByDonorUuid[d.uuid] || [] : null;
                const findings = (donorReports || []).flatMap((report) => {
                    const aliquotId = getAliquotIds(report).join(', ') || report.accession;
                    return getPresentFindings(report).map((finding) => {
                        return { aliquotId, ...finding };
                    });
                });
                const imageIds = Array.from(
                    new Set(
                        (donorReports || []).flatMap((report) =>
                            (report.histology_images || []).map(getLinkId).filter(Boolean)
                        )
                    )
                );
                const nonTargetTissues = t?.pathology_summary?.non_target_tissues || [];
                return { donor: d, tissue: t, donorReports, findings, imageIds, nonTargetTissues };
            }),
        [donors, reports, reportsByDonorUuid]
    );

    // Histology Images isn't sortable -- it's a link/count.
    const { sortedRows, renderSortableHeader } = useSortableRows(rows, {
        donorId: ({ donor: d }) => getDisplayText(d),
        age: ({ donor: d }) => (typeof d?.age === 'number' ? d.age : null),
        sex: ({ donor: d }) => d?.sex ?? null,
        autolysisScore: ({ tissue: t }) => t?.pathology_summary?.autolysis_score ?? null,
        nonTarget: ({ nonTargetTissues }) =>
            nonTargetTissues.length > 0
                ? Math.max(...nonTargetTissues.map((entry) => NON_TARGET_PERCENTAGE_ORDER.indexOf(entry.percentage)))
                : null,
        findings: ({ donorReports, findings }) => (donorReports && donorReports.length > 0 ? findings.length : null),
    });

    useScrollToHighlightedReport(highlightedReportId, expandedDonorUuids);

    if (donors.length === 0) {
        return <div className="pathology-reports-empty">No donor data available for this tissue type.</div>;
    }

    return (
        <table className="tissue-donor-table pathology-reports-table table">
            <colgroup>
                <col style={{ width: '14%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '27%' }} />
                <col style={{ width: '12%' }} />
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
                    <th>
                        {renderSortableHeader('nonTarget', 'Non-Target Tissue %')}
                        <NonTargetHeaderInfo />
                    </th>
                    <th>
                        {renderSortableHeader('findings', 'Unexpected/Pathologic Finding')}
                        <FindingsHeaderInfo />
                    </th>
                    <th>Histology Images</th>
                </tr>
            </thead>
            {sortedRows.map(({ donor: d, tissue: t, donorReports, findings, imageIds, nonTargetTissues }) => {
                const donorHref = getDonorHref(d, userDownloadAccess);
                const pathologySummary = t?.pathology_summary || null;
                const isExpanded = expandedDonorUuids.has(d.uuid);
                const hasReports = !!donorReports && donorReports.length > 0;
                const donorLabel = getDisplayText(d);
                return (
                    // One <tbody> per donor so a donor row and its expanded
                    // aliquot row stay together (and share zebra striping).
                    <tbody key={d.uuid} className={isExpanded ? 'is-expanded' : undefined}>
                        <tr className="pathology-donor-row">
                            <td>
                                <button
                                    type="button"
                                    className="pathology-row-toggle"
                                    aria-expanded={isExpanded}
                                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${donorLabel} pathology reports`}
                                    // eslint-disable-next-line react/jsx-no-bind
                                    onClick={() => onToggleDonor(d.uuid)}>
                                    <i className={`icon fas ${isExpanded ? 'icon-minus' : 'icon-plus'}`} />
                                </button>
                                {donorHref ? <a href={donorHref}>{donorLabel}</a> : donorLabel}
                            </td>
                            <td>{getDisplayText(formatDonorAge(d.age))}</td>
                            <td>{getDisplayText(d.sex)}</td>
                            <td
                                className={
                                    enableConditionalColor
                                        ? getAutolysisScoreCellClass(pathologySummary?.autolysis_score)
                                        : ''
                                }>
                                {getDisplayText(pathologySummary?.autolysis_score)}
                            </td>
                            <td>
                                {pathologySummary ? (
                                    <StackedLines
                                        lines={nonTargetTissues.map((entry) =>
                                            formatNonTargetLine(entry.subtype, entry.percentage)
                                        )}
                                    />
                                ) : (
                                    <span className="text-muted-placeholder">n/a</span>
                                )}
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
                                    <div className="pathology-aliquot-heading">
                                        {tissueIconSrc ? (
                                            <i
                                                className="tissue-icon-mask"
                                                style={{
                                                    WebkitMaskImage: `url(${tissueIconSrc})`,
                                                    maskImage: `url(${tissueIconSrc})`,
                                                }}
                                            />
                                        ) : null}
                                        {donorLabel} {tissueName} Aliquot - Pathology Reports
                                    </div>
                                    {donorReports === null ? (
                                        <i className="icon icon-circle-notch icon-spin fas" />
                                    ) : hasReports ? (
                                        <AliquotReportsTable
                                            reports={donorReports}
                                            highlightedReportId={highlightedReportId}
                                            enableConditionalColor={enableConditionalColor}
                                        />
                                    ) : (
                                        <div className="pathology-reports-empty">
                                            No pathology reports for this donor yet.
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
