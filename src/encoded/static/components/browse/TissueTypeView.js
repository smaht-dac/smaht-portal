'use strict';

import React, { useEffect, useMemo, useState } from 'react';
import {
    ajax,
    memoizedUrlParse,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { BROWSE_STATUS_FILTERS } from './BrowseView';
import AliquotVisualization from '../item-pages/components/tissue-overview/AliquotVisualization';
import NonSolidAliquotVisualization from '../item-pages/components/tissue-overview/NonSolidAliquotVisualization';
import { useUserDownloadAccess } from '../util/hooks';
import { pageTitleViews } from '../PageTitleSection';
import { formatDonorAge } from '../item-pages/components/donor-overview/ProtectedDonorViewDataCards';
import { formatCoverageDisplayValue } from '../viz/Matrix/StackedBlockVisual';
import {
    getDonorHref,
    getDisplayText,
    formatYesNo,
    getAutolysisScoreCellClass,
    dedupeTissuesByDonor,
    TissueDatum,
    sampleAliquotSlicesFallback,
    getTissueKitIdFromExternalId,
    sampleNonSolidAliquots,
    getCoreWellFromExternalId,
} from '../item-pages/components/tissue-overview/helpers';

// Standalone page for /tissue-overview/?tissue_type=<value>, registered
// against the synthetic 'Tissue-Overview' @type the backend's
// tissue_overview.py route forces onto its search response -- this is a
// real tissue_type-keyed page (unlike the legacy TissueOverview tab on a
// single Tissue item's page at /tissues/<uuid>/), so `context` here is the
// search response itself (its `@graph` already is the Tissue-search-by-
// tissue_type dataset).

// This page renders its own title/breadcrumb (TissueTypeViewTitle, below)
// inline with its content, same as item pages do -- suppress
// PageTitleSection's generic fallback (which would otherwise render
// context.title as a duplicate heading above it). The browser tab title
// (app.js's HTMLTitle) still reads context.title directly -- tissue_overview.py
// overrides that field per-request to the actual tissue_type value, so the
// tab title is meaningful without this page needing its own title view.
pageTitleViews.register(() => null, 'Tissue-Overview');

const TissueTypeViewTitle = ({ representativeTissue }) => {
    const targetTissueValue =
        representativeTissue?.uberon_id || representativeTissue?.tissue_type || null;
    const breadcrumbs = [
        { display_title: 'Home', href: '/' },
        { display_title: 'Data' },
        { display_title: 'Tissues' },
        { display_title: getDisplayText(targetTissueValue) },
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

export default function TissueTypeView({ context = {}, href, session }) {
    const tissueType = useMemo(
        () => (typeof href === 'string' ? memoizedUrlParse(href).query?.tissue_type : null) || null,
        [href]
    );
    const { userDownloadAccess } = useUserDownloadAccess(session);

    // The route's own search results already are the donor population for
    // this tissue_type (donor.study=Production&donor.tags=has_released_files,
    // baked into the link that got the user here -- see
    // BrowseTissueHeatmapTable.js) -- no separate client-side fetch needed
    // for this, unlike the legacy per-item TissueView.js.
    const allTissuesForType = context?.['@graph'] || [];
    const donors = useMemo(() => dedupeTissuesByDonor(allTissuesForType), [allTissuesForType]);
    const donorCount = donors.length;

    // Representative Tissue for header/summary fields (uberon_id, category,
    // study, display_title) -- prefer an entry with a populated
    // pathology_summary, same preference dedupeTissuesByDonor uses.
    const representativeTissue = useMemo(
        () => allTissuesForType.find((t) => t?.pathology_summary) || allTissuesForType[0] || null,
        [allTissuesForType]
    );

    const { display_title, uberon_id, tissue_type, study, category } = representativeTissue || {};

    const uberonHref = uberon_id && uberon_id['@id'] ? uberon_id['@id'] : null;
    const targetTissueValue = uberon_id || tissue_type || null;
    const targetTissueHref = uberon_id ? uberonHref : null;
    const tissueProtocolCode = tissue_type ? tissue_type.split(' - ')[0].trim() : null;
    // `category` is a real backend-calculated field (item_utils/tissue.py) --
    // "Clinically Accessible" covers exactly blood and buccal swab tissues.
    // Which of the two it is isn't itself a stored field, so that part still
    // falls back to matching the tissue_type label.
    const nonSolidSpecimenType =
        category === 'Clinically Accessible'
            ? tissue_type?.toLowerCase().includes('buccal')
                ? 'buccal'
                : 'blood'
            : null;
    const tissueMatrixFilterValue = tissueType || tissue_type || null;

    const [isLoading, setIsLoading] = useState(true);
    const [fileCount, setFileCount] = useState(0);
    const [totalCoverage, setTotalCoverage] = useState(0);
    const [tissueSamples, setTissueSamples] = useState(null);
    // True only while re-fetching for an already-rendered donor switch (not
    // the initial load, which uses aliquotSamplesLoading/the spinner
    // instead) -- lets the panel hint "updating" without unmounting the
    // still-valid previous diagram.
    const [samplesUpdating, setSamplesUpdating] = useState(false);
    const [selectedDonorUuid, setSelectedDonorUuid] = useState(null);

    // Re-seeds to the sorted list's first donor whenever `donors` (re)loads,
    // unless the current selection is a user choice that's still valid in
    // the new list (e.g. donors reloaded after a session change).
    useEffect(() => {
        if (donors.length === 0) return;
        setSelectedDonorUuid((current) => {
            if (current && donors.some((entry) => entry.donor?.uuid === current)) {
                return current;
            }
            return donors[0]?.donor?.uuid || null;
        });
    }, [donors]);

    const selectedDonorEntry = useMemo(
        () => donors.find((entry) => entry.donor?.uuid === selectedDonorUuid) || null,
        [donors, selectedDonorUuid]
    );
    // A donor's Fixed and Frozen Tissue records for this tissue_type are two
    // separate items sharing one tissue_type string, so the aliquot panel
    // needs every sibling Tissue's uuid, not just one.
    const tissueUuidsForSelectedDonor = useMemo(() => {
        if (!selectedDonorUuid) return [];
        return allTissuesForType
            .filter((t) => t?.donor?.uuid === selectedDonorUuid)
            .map((t) => t.uuid);
    }, [allTissuesForType, selectedDonorUuid]);
    const selectedDonorDisplayTitle = selectedDonorEntry?.donor?.display_title;
    const aliquotIdPrefix =
        selectedDonorDisplayTitle && tissueProtocolCode
            ? `${selectedDonorDisplayTitle}-${tissueProtocolCode}`
            : tissueProtocolCode;

    // The number of aliquots isn't a fixed/derivable constant -- it's
    // whatever was actually submitted for this tissue block, so it has to
    // come from a live count of TissueSamples across every sibling Tissue
    // (Fixed + Frozen) sharing this tissue_type.
    useEffect(() => {
        if (tissueUuidsForSelectedDonor.length === 0) {
            setTissueSamples(null);
            return;
        }
        // Deliberately not resetting to null here: on a donor switch it
        // would blank out an already-rendered diagram for no reason -- keep
        // showing the previous donor's slices until the new ones are ready.
        setSamplesUpdating(true);
        const sampleSourceParams = tissueUuidsForSelectedDonor
            .map((uuid) => `sample_sources.uuid=${encodeURIComponent(uuid)}`)
            .join('&');
        ajax.load(
            `/search/?type=TissueSample&status!=deleted&${sampleSourceParams}`,
            (resp) => {
                setTissueSamples(resp?.['@graph'] || []);
                setSamplesUpdating(false);
            },
            'GET',
            () => {
                setTissueSamples([]);
                setSamplesUpdating(false);
            }
        );
    }, [tissueUuidsForSelectedDonor, session]);

    // Real samples win once loaded; while loading (tissueSamples === null) or
    // if none exist yet, fall back to the illustrative demo set so the panel
    // isn't empty.
    const solidAliquotSlices = useMemo(() => {
        const realSlices = (tissueSamples || [])
            .filter((sample) => sample.preservation_type !== 'Fresh')
            .map((sample) => {
                const coreWell = getCoreWellFromExternalId(sample.external_id);
                return {
                    id: sample.uuid,
                    type: sample.preservation_type === 'Fixed' ? 'pink' : 'yellow',
                    widthCm: sample.preservation_type === 'Fixed' ? 0.5 : 1,
                    description: sample.external_id || sample.accession || undefined,
                    idPrefix: getTissueKitIdFromExternalId(sample.external_id),
                    frozenCoreWells: coreWell ? [coreWell] : [],
                    associatedPathologyReports: sample.associated_pathology_reports || [],
                    pathologyReports: sample.pathology_reports || [],
                    submissionCenter: sample.submission_centers?.[0]?.display_title || null,
                };
            });
        return realSlices.length > 0 ? realSlices : sampleAliquotSlicesFallback;
    }, [tissueSamples]);

    const nonSolidAliquots = useMemo(() => {
        const realAliquots = (tissueSamples || []).map((sample) => {
            return {
                id: sample.uuid,
                description: sample.external_id || sample.accession || undefined,
                submissionCenter: sample.submission_centers?.[0]?.display_title || null,
            };
        });
        return realAliquots.length > 0 ? realAliquots : sampleNonSolidAliquots;
    }, [tissueSamples]);

    const aliquotSamplesLoading = donors.length === 0 || tissueSamples === null;

    // Not filtered by any single donor -- this page covers every donor
    // sharing this tissue_type (see `donors` above), so the Files stat
    // needs to be the same population's total, not one representative
    // donor's own count (which undercounts whenever other donors in the
    // Donor Details table below have their own files for this tissue_type).
    useEffect(() => {
        if (!tissueMatrixFilterValue) {
            setFileCount(0);
            setTotalCoverage(0);
            setIsLoading(false);
            return;
        }
        const queryParts = [
            'type=File',
            BROWSE_STATUS_FILTERS,
            'dataset!=No+value',
            `sample_summary.tissues=${encodeURIComponent(tissueMatrixFilterValue)}`,
            // Needed for the coverage sum below, not just the count -- `total`
            // reflects every match regardless of page size, but summing
            // `@graph` without this only sees the first page (10 by default,
            // snovault/search/search.py's PAGINATION_SIZE) and silently
            // undercounts, same failure mode the Files stat itself had.
            'limit=all',
        ];

        setIsLoading(true);
        ajax.load(
            `/search/?${queryParts.join('&')}`,
            (resp) => {
                setFileCount(resp?.total || 0);
                // Same semantics as DataMatrix.js's total_coverage reducers
                // and visualization.py's SUM_DATA_GENERATION_SUMMARY_AGGREGATION_DEFINITION:
                // a sum of each File's own (already-averaged) per-BAM coverage.
                const files = resp?.['@graph'] || [];
                const coverageSum = files.reduce(
                    (sum, f) => sum + (Number(f?.data_generation_summary?.average_coverage) || 0),
                    0
                );
                setTotalCoverage(coverageSum);
                setIsLoading(false);
            },
            'GET',
            () => {
                setFileCount(0);
                setTotalCoverage(0);
                setIsLoading(false);
            }
        );
    }, [tissueMatrixFilterValue, session]);

    return (
        <div className="tissue-view">
            <TissueTypeViewTitle representativeTissue={representativeTissue} />
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
                                    <TissueDatum title="Sex" value={selectedDonorEntry?.donor?.sex} />
                                    <TissueDatum
                                        title="Total Coverage"
                                        value={!isLoading ? formatCoverageDisplayValue(totalCoverage).display : null}
                                    />
                                </div>
                            </div>
                            <div className="tissue-summary-stats d-flex gap-3">
                                <div className="donor-statistic donors d-flex flex-column p-2 gap-2">
                                    <div className="donor-statistic-label text-center">
                                        <i className="icon icon-lungs fas"></i>Donors
                                    </div>
                                    <div className="donor-statistic-value text-center">
                                        <span>{donorCount}</span>
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
                        <div className="tissue-aliquot-header">
                            <span className="aliquot-title">
                                {nonSolidSpecimenType
                                    ? 'Sample non-solid aliquot layout'
                                    : 'Sample solid-organ aliquot layout'}
                            </span>
                            {donors.length > 1 ? (
                                <div className="tissue-aliquot-donor-select">
                                    <label htmlFor="tissue-aliquot-donor-select">
                                        Donor
                                    </label>
                                    <select
                                        id="tissue-aliquot-donor-select"
                                        className="form-select form-select-sm"
                                        value={selectedDonorUuid || ''}
                                        onChange={(e) => setSelectedDonorUuid(e.target.value)}>
                                        {donors.map(({ donor: d }) => (
                                            <option key={d.uuid} value={d.uuid}>
                                                {getDisplayText(d)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ) : null}
                        </div>
                        <div
                            className={
                                'tissue-aliquot-body' +
                                (samplesUpdating && !aliquotSamplesLoading ? ' is-updating' : '')
                            }>
                            {aliquotSamplesLoading ? (
                                <div className="tissue-aliquot-loading">
                                    <i className="icon icon-circle-notch icon-spin fas" />
                                </div>
                            ) : nonSolidSpecimenType ? (
                                <NonSolidAliquotVisualization
                                    aliquots={nonSolidAliquots}
                                    specimenType={nonSolidSpecimenType}
                                    idPrefix={aliquotIdPrefix}
                                />
                            ) : (
                                <AliquotVisualization
                                    slices={solidAliquotSlices}
                                    dimensions={{
                                        heightCm: 1,
                                        depthCm: 1.5,
                                        heightLabel: '1 cm',
                                        depthLabel: '1.5 cm',
                                    }}
                                    idPrefix={aliquotIdPrefix}
                                    showSliceLabels={false}
                                />
                            )}
                        </div>
                    </div>
                </div>

                <div className="tissue-donor-table-card">
                    <div className="header">
                        <span className="header-text">Donor Details</span>
                    </div>
                    <div className="body">
                        <table className="tissue-donor-table table">
                            <thead>
                                <tr>
                                    <th>Donor ID</th>
                                    <th>Sex</th>
                                    <th>Age</th>
                                    <th>Autolysis Score</th>
                                    <th>Non-Target Tissue Presence</th>
                                    <th>Unexpected/Pathologic Finding</th>
                                    <th>Histology Viewer</th>
                                </tr>
                            </thead>
                            <tbody>
                                {donors.length > 0 ? (
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
                                                <td>{getDisplayText(formatDonorAge(d.age))}</td>
                                                <td className={getAutolysisScoreCellClass(pathologySummary.autolysis_score)}>
                                                    {getDisplayText(pathologySummary.autolysis_score)}
                                                </td>
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
}
