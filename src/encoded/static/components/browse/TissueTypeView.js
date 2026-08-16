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
    formatSexBreakdown,
    TissueDatum,
    sampleAliquotSlicesFallback,
    getTissueKitIdFromExternalId,
    sampleNonSolidAliquots,
    getCorePositionFromExternalId,
    getAliquotNumberFromExternalId,
    getTissueIconSrc,
    getGccFilesBrowseHref,
    getTissueFilesBrowseHref,
    getTissueAliquotDepthCm,
    getAliquotLayoutNote,
    dedupePathologyReportEntries,
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
    // Same tissue_type-first preference as the body's targetTissueValue below.
    const targetTissueValue =
        representativeTissue?.tissue_type || representativeTissue?.uberon_id || null;
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
    // `tissue_type` (not uberon_id.display_title) so the displayed name
    // always uses the "<code> - <description>" convention (e.g. "3AN -
    // Brain, Hippocampus, L") -- uberon_id's own display_title formatting
    // is inconsistent across ontology terms (some carry the code prefix,
    // some don't), while tissue_type is always canonicalized this way
    // (item_utils/tissue.py's get_tissue_type). Still link out to the
    // ontology term via uberon_id when available.
    const targetTissueValue = tissue_type || uberon_id || null;
    const targetTissueHref = uberon_id ? uberonHref : null;
    const tissueIconSrc = getTissueIconSrc(tissue_type || getDisplayText(uberon_id));
    const aliquotDepthCm = getTissueAliquotDepthCm(tissue_type || getDisplayText(uberon_id));
    const aliquotLayoutNote = getAliquotLayoutNote(tissue_type || getDisplayText(uberon_id));
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
    // Mirrors the fileCount fetch below exactly (tissue_type only, every
    // donor sharing it -- no single donor here) so this always matches the
    // "Files: N" stat.
    const filesBrowseHref = getTissueFilesBrowseHref({
        tissueTypeValue: tissueMatrixFilterValue,
    });

    const [isLoading, setIsLoading] = useState(true);
    const [fileCount, setFileCount] = useState(0);
    const [totalCoverage, setTotalCoverage] = useState(0);
    const [tissueSamples, setTissueSamples] = useState(null);
    // True only while re-fetching for an already-rendered donor switch (not
    // the initial load, which uses aliquotSamplesLoading/the spinner
    // instead) -- lets the panel hint "updating" without unmounting the
    // still-valid previous diagram.
    const [samplesUpdating, setSamplesUpdating] = useState(false);
    // Stays null (no auto-selected default) until the user explicitly picks
    // one from the <select> below -- the panel shows a "pick a donor"
    // prompt instead of any donor's data until then.
    const [selectedDonorUuid, setSelectedDonorUuid] = useState(null);

    // Clears the selection if it's no longer valid for the current `donors`
    // list (e.g. donors reloaded after a session change) -- never seeds a
    // default, so nothing renders until the user chooses.
    useEffect(() => {
        if (donors.length === 0) {
            setSelectedDonorUuid(null);
            return;
        }
        setSelectedDonorUuid((current) =>
            current && donors.some((entry) => entry.donor?.uuid === current) ? current : null
        );
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
        //
        // `ignore` guards against a stale in-flight request winning a race
        // against a newer one -- e.g. donor A's (real-data) response
        // arriving after donor B's (genuinely empty, 404) response if A was
        // slower, which would otherwise overwrite B's correctly-cleared
        // state with A's stale slices right after the swap to B. Any
        // earlier effect run's callbacks become no-ops once a newer one
        // starts (cleanup below).
        let ignore = false;
        setSamplesUpdating(true);
        const sampleSourceParams = tissueUuidsForSelectedDonor
            .map((uuid) => `sample_sources.uuid=${encodeURIComponent(uuid)}`)
            .join('&');
        ajax.load(
            // `limit=all` -- without it, Snovault's default PAGINATION_SIZE
            // (10, not the more commonly assumed 25) silently truncates the
            // result set. Confirmed as a real bug against production data:
            // a tissue with 20 real TissueSamples (4 Fixed + 16 Core) only
            // ever surfaced the first 10, cutting off 10 real Core positions
            // with no error or indication anything was missing.
            `/search/?type=TissueSample&status!=deleted&${sampleSourceParams}&limit=all`,
            (resp) => {
                if (ignore) return;
                setTissueSamples(resp?.['@graph'] || []);
                setSamplesUpdating(false);
            },
            'GET',
            () => {
                if (ignore) return;
                setTissueSamples([]);
                setSamplesUpdating(false);
            }
        );
        return () => {
            ignore = true;
        };
    }, [tissueUuidsForSelectedDonor, session]);

    // Real samples win once loaded; while loading (tissueSamples === null) or
    // if none exist yet, fall back to the illustrative demo set so the panel
    // isn't empty.
    const solidAliquotSlices = useMemo(() => {
        // Multiple Core TissueSamples (one per core position) can be cut
        // from the same physical Frozen aliquot -- group those by idPrefix +
        // aliquot number into one slice box with several highlighted
        // positions instead of one duplicate box per position (see
        // getAliquotNumberFromExternalId).
        const slicesByGroupKey = new Map();
        const realSlices = [];
        (tissueSamples || [])
            .filter((sample) => sample.preservation_type !== 'Fresh')
            .forEach((sample) => {
                const isFixed = sample.preservation_type === 'Fixed';
                const corePosition = getCorePositionFromExternalId(sample.external_id);
                const idPrefix = getTissueKitIdFromExternalId(sample.external_id);
                // Real aliquot number embedded in the external_id (e.g. "002"
                // in "SMHT004-3S-002A1") -- extracted for every sample, Fixed
                // included, so the popover can label a slice with the number
                // it actually was submitted under. Only used as a *merge* key
                // for non-Fixed samples (Fixed ones are never merged), but
                // every slice still carries its own real number for display.
                const aliquotNumber = getAliquotNumberFromExternalId(sample.external_id);
                const groupKey = !isFixed && aliquotNumber ? `${idPrefix}-${aliquotNumber}` : null;
                const existing = groupKey ? slicesByGroupKey.get(groupKey) : null;
                if (existing) {
                    if (corePosition && !existing.frozenCorePositions.includes(corePosition)) {
                        existing.frozenCorePositions.push(corePosition);
                    }
                    existing.associatedPathologyReports =
                        existing.associatedPathologyReports.concat(
                            sample.associated_pathology_reports || []
                        );
                    existing.pathologyReports = existing.pathologyReports.concat(
                        sample.pathology_reports || []
                    );
                    // A position can have more than one real TissueSample
                    // record -- confirmed against real production data: the
                    // same physical core gets a TPC procurement-level record
                    // (e.g. "NDRI TPC") *and* a separate GCC-submitted record
                    // (e.g. "UWSC GCC") for the same "SMHT001-3AM-001D2".
                    // Overwriting with just the last one processed silently
                    // dropped the other institution's record entirely (a
                    // real reported bug), so keep every distinct center per
                    // position instead of picking one.
                    if (corePosition) {
                        const center = sample.submission_centers?.[0]?.display_title || null;
                        const existingCenters =
                            existing.frozenCorePositionSubmissionCenters[corePosition] || [];
                        if (!existingCenters.includes(center)) {
                            existing.frozenCorePositionSubmissionCenters[corePosition] =
                                existingCenters.concat([center]);
                        }
                    }
                    return;
                }
                const slice = {
                    id: sample.uuid,
                    type: isFixed ? 'pink' : 'yellow',
                    widthCm: isFixed ? 0.5 : 1,
                    description: groupKey
                        ? `${idPrefix}-${aliquotNumber}`
                        : sample.external_id || sample.accession || undefined,
                    idPrefix,
                    // The real aliquot number this slice was actually
                    // submitted under -- see TissueView.js's identical field
                    // for why AliquotVisualization prefers this over its own
                    // positional numbering.
                    aliquotNumber: aliquotNumber || undefined,
                    frozenCorePositions: corePosition ? [corePosition] : [],
                    associatedPathologyReports: sample.associated_pathology_reports || [],
                    pathologyReports: sample.pathology_reports || [],
                    // The real submitting institution(s) per core position
                    // (e.g. "BROAD GCC", "UWSC GCC") -- keyed by position,
                    // one array per position since a single position can
                    // have more than one real TissueSample record (see the
                    // merge branch above for why this is an array, not a
                    // single value).
                    frozenCorePositionSubmissionCenters: corePosition
                        ? { [corePosition]: [sample.submission_centers?.[0]?.display_title || null] }
                        : {},
                };
                realSlices.push(slice);
                if (groupKey) slicesByGroupKey.set(groupKey, slice);
            });
        if (realSlices.length === 0) return sampleAliquotSlicesFallback;
        // Links each row's own GCC to that center's files for this
        // donor+tissue (verified facets -- see getGccFilesBrowseHref) -- not
        // to this specific core position, since File's own sample-level
        // field isn't faceted. Computed per (position, center) pair, since a
        // position can have more than one real submitting center.
        realSlices.forEach((slice) => {
            slice.frozenCorePositionFilesHrefs = {};
            Object.entries(slice.frozenCorePositionSubmissionCenters).forEach(
                ([corePosition, submissionCenters]) => {
                    slice.frozenCorePositionFilesHrefs[corePosition] = submissionCenters.map(
                        (submissionCenter) =>
                            getGccFilesBrowseHref({
                                donorDisplayTitle: selectedDonorDisplayTitle,
                                tissueTypeValue: tissueMatrixFilterValue,
                                submissionCenter,
                            })
                    );
                }
            );
            // Merging core positions concatenates each one's own linked
            // Fixed-sample pathology entries -- siblings usually share the
            // same Fixed sample(s), so this dedupes the repeats down to one
            // row per distinct Fixed sample instead of one per position.
            slice.associatedPathologyReports = dedupePathologyReportEntries(
                slice.associatedPathologyReports
            );
        });
        // Sort by real aliquot number (ascending, numeric) so boxes read
        // left-to-right in the order a person would expect ("001" before
        // "002") instead of whatever order the raw TissueSample search
        // happened to return them in -- see TissueView.js's identical sort
        // for the confirmed real-world case this fixes.
        realSlices.sort((a, b) => {
            const aNum = a.aliquotNumber ? parseInt(a.aliquotNumber, 10) : null;
            const bNum = b.aliquotNumber ? parseInt(b.aliquotNumber, 10) : null;
            if (aNum === null && bNum === null) return 0;
            if (aNum === null) return 1;
            if (bNum === null) return -1;
            return aNum - bNum;
        });
        return realSlices;
    }, [tissueSamples, selectedDonorDisplayTitle, tissueMatrixFilterValue]);

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

    const aliquotSamplesLoading = !!selectedDonorUuid && tissueSamples === null;
    const showDonorPrompt = donors.length > 0 && !selectedDonorUuid;
    // Distinct from showDonorPrompt (donors loaded, none picked yet) --
    // this is the permission-filtered donors search coming back empty
    // (e.g. logged out), which must not fall through to the illustrative
    // fallback diagram as if it were real data.
    const showNoDonorData = !isLoading && donors.length === 0;
    // A donor explicitly selected, its TissueSample search has finished
    // (not still loading), and it genuinely returned zero real samples --
    // e.g. the search 404s. AliquotVisualization/NonSolidAliquotVisualization
    // would otherwise render the illustrative fallback set, but that fallback
    // still gets labelled with this donor's own real idPrefix (e.g.
    // "SMHT023-3M"), which reads as real per-donor data even though every
    // field on it is fabricated -- confirmed misleading in practice, so show
    // an explicit empty state instead of the fallback once we know for
    // certain (not just "still loading") that this donor has none. Mirrors
    // solidAliquotSlices/nonSolidAliquots' own real-vs-fallback check
    // exactly (Fresh samples don't count for solid tissues, per that
    // useMemo's own filter) -- a donor whose only TissueSamples are Fresh
    // (filtered out there too) would otherwise still fall through to the
    // same mislabelled fallback despite tissueSamples.length > 0.
    const hasRealAliquotData = nonSolidSpecimenType
        ? (tissueSamples || []).length > 0
        : (tissueSamples || []).some((sample) => sample.preservation_type !== 'Fresh');
    const showNoSampleData =
        !aliquotSamplesLoading && !!selectedDonorUuid && Array.isArray(tissueSamples) && !hasRealAliquotData;

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
                        {tissueIconSrc ? (
                            <i
                                className="tissue-icon-mask"
                                style={{
                                    WebkitMaskImage: `url(${tissueIconSrc})`,
                                    maskImage: `url(${tissueIconSrc})`,
                                }}
                            />
                        ) : (
                            <i className="icon icon-lungs fas"></i>
                        )}
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
                                    <TissueDatum title="Sex" value={formatSexBreakdown(donors)} />
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
                                {(() => {
                                    const filesStatContent = (
                                        <>
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
                                        </>
                                    );
                                    return !isLoading && fileCount > 0 && filesBrowseHref ? (
                                        <a
                                            className="donor-statistic files d-flex flex-column p-2 gap-2"
                                            href={filesBrowseHref}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title="View all files for this tissue">
                                            {filesStatContent}
                                        </a>
                                    ) : (
                                        <div className="donor-statistic files d-flex flex-column p-2 gap-2">
                                            {filesStatContent}
                                        </div>
                                    );
                                })()}
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
                            {donors.length > 0 ? (
                                <div className="tissue-aliquot-donor-select">
                                    <label htmlFor="tissue-aliquot-donor-select">
                                        Donor
                                    </label>
                                    <select
                                        id="tissue-aliquot-donor-select"
                                        className={
                                            'form-select form-select-sm' +
                                            (!selectedDonorUuid ? ' is-unselected' : '')
                                        }
                                        value={selectedDonorUuid || ''}
                                        onChange={(e) => setSelectedDonorUuid(e.target.value || null)}>
                                        <option value="">Select a donor…</option>
                                        {donors.map(({ donor: d }) => (
                                            <option key={d.uuid} value={d.uuid}>
                                                {getDisplayText(d)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ) : null}
                        </div>
                        {aliquotLayoutNote && !nonSolidSpecimenType ? (
                            <p className="tissue-aliquot-layout-note">
                                <i className="icon icon-info-circle fas" />
                                {aliquotLayoutNote}
                            </p>
                        ) : null}
                        <div
                            className={
                                'tissue-aliquot-body' +
                                (samplesUpdating && !aliquotSamplesLoading ? ' is-updating' : '')
                            }>
                            {showNoDonorData ? (
                                <div className="tissue-aliquot-prompt">
                                    <p>No donor data available for this tissue type.</p>
                                </div>
                            ) : showDonorPrompt ? (
                                <div className="tissue-aliquot-prompt">
                                    <i className="icon icon-arrow-up fas" />
                                    <p>Select a donor above to view its aliquot layout.</p>
                                </div>
                            ) : aliquotSamplesLoading ? (
                                <div className="tissue-aliquot-loading">
                                    <i className="icon icon-circle-notch icon-spin fas" />
                                </div>
                            ) : showNoSampleData ? (
                                <div className="tissue-aliquot-prompt">
                                    <p>No aliquot data available for the selected donor.</p>
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
                                        depthCm: aliquotDepthCm,
                                        heightLabel: '1 cm',
                                        depthLabel: `${aliquotDepthCm} cm`,
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
