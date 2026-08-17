'use strict';

import React, { useEffect, useMemo, useState } from 'react';
import DefaultItemView from './DefaultItemView';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { BROWSE_STATUS_FILTERS } from '../browse/BrowseView';
import AliquotVisualization from './components/tissue-overview/AliquotVisualization';
import NonSolidAliquotVisualization from './components/tissue-overview/NonSolidAliquotVisualization';
import { useUserDownloadAccess } from '../util/hooks';
import { formatDonorAge } from './components/donor-overview/ProtectedDonorViewDataCards';
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
    getTissueDisplayLabel,
} from './components/tissue-overview/helpers';

export default class TissueOverview extends DefaultItemView {
    getTabViewContents() {
        const initTabs = [];
        initTabs.push(TissueView.getTabObject(this.props));
        return initTabs.concat(this.getCommonTabs());
    }
}

const TissueViewTitle = ({ context }) => {
    // A user reaches this page from a Browse-by-Tissue table header, i.e. by
    // tissue *type*, not by picking this one specific Tissue record -- and
    // which record actually renders here is itself a best-effort pick among
    // possibly several sharing that type (see dedupeTissuesByDonor). Showing
    // its specific instance ID (e.g. "SMHT001-3AL") in the breadcrumb would
    // overstate that certainty, so use the same descriptive tissue name the
    // page heading uses instead.
    // tissue_type first, not uberon_id -- see the body's targetTissueValue below.
    const targetTissueValue = context?.tissue_type || context?.uberon_id || null;
    const breadcrumbs = [
        { display_title: 'Home', href: '/' },
        { display_title: 'Data' },
        { display_title: 'Tissues' },
        { display_title: getTissueDisplayLabel(targetTissueValue) },
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

const TissueView = React.memo(function TissueView({
    context = {},
    session,
    // Gates the Donor Details table's Autolysis Score cell coloring below --
    // off by default per request.
    enableConditionalColor = false,
}) {
    const {
        display_title,
        donor,
        uberon_id,
        tissue_type,
        study,
        category,
    } = context;
    const { userDownloadAccess } = useUserDownloadAccess(session);

    const uberonHref = uberon_id && uberon_id['@id'] ? uberon_id['@id'] : null;
    // `tissue_type` (not uberon_id.display_title) so the displayed name
    // always uses the "<code> - <description>" convention (e.g. "3AN -
    // Brain, Hippocampus, L") -- uberon_id's own display_title formatting
    // is inconsistent across ontology terms (some carry the code prefix,
    // some don't), while tissue_type is always canonicalized this way
    // (item_utils/tissue.py's get_tissue_type). Still link out to the
    // ontology term via uberon_id when available.
    const targetTissueValue = tissue_type || uberon_id || null;
    const tissueIconSrc = getTissueIconSrc(tissue_type || getDisplayText(uberon_id));
    const aliquotDepthCm = getTissueAliquotDepthCm(tissue_type || getDisplayText(uberon_id));
    const aliquotLayoutNote = getAliquotLayoutNote(tissue_type || getDisplayText(uberon_id));
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
    const tissueMatrixFilterValue = useMemo(
        () => tissue_type || uberon_id?.display_title || null,
        [tissue_type, uberon_id]
    );
    // Mirrors the fileCount fetch below exactly (same donor + tissue_type
    // filters, no GCC filter) so this always matches the "Files: N" stat.
    const filesBrowseHref = getTissueFilesBrowseHref({
        donorDisplayTitle: donor?.display_title,
        tissueTypeValue: tissueMatrixFilterValue,
    });
    const [isLoading, setIsLoading] = useState(true);
    const [fileCount, setFileCount] = useState(0);
    const [totalCoverage, setTotalCoverage] = useState(0);
    const [donors, setDonors] = useState([]);
    // Every Tissue record sharing this tissue_type, undeduped -- unlike
    // `donors` (one representative Tissue per donor, for the summary table),
    // this keeps sibling Fixed/Frozen Tissue records together so the aliquot
    // panel can combine both into one box for a given donor.
    const [allTissuesForType, setAllTissuesForType] = useState([]);
    const [donorsLoading, setDonorsLoading] = useState(true);
    const [tissueSamples, setTissueSamples] = useState(null);
    // True only while re-fetching for an already-rendered donor switch (not
    // the initial load, which uses aliquotSamplesLoading/the spinner
    // instead) -- lets the panel hint "updating" without unmounting the
    // still-valid previous diagram.
    const [samplesUpdating, setSamplesUpdating] = useState(false);
    // Which donor's aliquot layout the visualization panel reflects. Stays
    // null (no auto-selected default) until the user explicitly picks one
    // from the <select> below -- the panel shows a "pick a donor" prompt
    // instead of any donor's data until then.
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
    // separate items sharing one tissue_type string (confirmed against real
    // data -- see note above sampleAliquotSlicesFallback), so the aliquot
    // panel needs every sibling Tissue's uuid, not just one. Empty (no
    // fallback to this page's own Tissue) until a donor is explicitly
    // selected -- see selectedDonorUuid above.
    const tissueUuidsForSelectedDonor = useMemo(() => {
        if (!selectedDonorUuid) return [];
        return allTissuesForType
            .filter((t) => t?.donor?.uuid === selectedDonorUuid)
            .map((t) => t.uuid);
    }, [allTissuesForType, selectedDonorUuid]);
    const selectedDonorDisplayTitle = selectedDonorEntry?.donor?.display_title;
    // Real sample IDs are "{donor}-{protocol}-{aliquot}{suffix}" (e.g.
    // "SMHT001-3I-001A1", see item_utils/tissue_sample.py's *_REGEX
    // constants) -- used only as a fallback when a slice has no real
    // external_id of its own (the illustrative demo set).
    const aliquotIdPrefix =
        selectedDonorDisplayTitle && tissueProtocolCode
            ? `${selectedDonorDisplayTitle}-${tissueProtocolCode}`
            : tissueProtocolCode;

    // The number of aliquots isn't a fixed/derivable constant (confirmed
    // against real TissueSample fixture data and PR smaht-dac/smaht-portal#728's
    // associate_fixed_samples.py, which counts real linked samples rather than
    // assuming one) -- it's whatever was actually submitted for this tissue
    // block, so it has to come from a live count of TissueSamples across
    // every sibling Tissue (Fixed + Frozen) sharing this tissue_type.
    useEffect(() => {
        // Wait for the sibling-Tissue search (donorsLoading) to finish before
        // fetching -- otherwise this fires once with just this page's own
        // Tissue uuid, renders that partial result, then fires again once
        // the sibling Fixed/Frozen Tissue is found, replacing it a moment
        // later. Both fetches were real, but the visible flash between them
        // reads as a bug, so wait for the complete uuid set instead.
        if (donorsLoading || tissueUuidsForSelectedDonor.length === 0) {
            setTissueSamples(null);
            return;
        }
        // Deliberately not resetting to null here: on the very first load
        // that's already the initial state, but on a later donor switch it
        // would blank out an already-rendered diagram (swap to spinner, then
        // swap again to the new donor's data) for no reason -- keep showing
        // the previous donor's slices until the new ones are ready, then
        // swap directly, once.
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
    }, [tissueUuidsForSelectedDonor, donorsLoading, session]);

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
                // This slice's own real "{donor}-{protocol}" -- Fixed and
                // Frozen siblings have different protocol codes despite
                // sharing one tissue_type, so each slice needs its own.
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
                    // Backend-computed (types/tissue_sample.py): chains this
                    // Frozen/Fresh sample's `linked_fixed_samples` through
                    // each linked Fixed sample's own `pathology_reports`.
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
                    // The grouped aliquot's own id (no position suffix) once
                    // more than one position shares it -- a single sample's
                    // full external_id (with position suffix) would
                    // misleadingly describe the whole box as just its first
                    // position.
                    description: groupKey
                        ? `${idPrefix}-${aliquotNumber}`
                        : sample.external_id || sample.accession || undefined,
                    idPrefix,
                    // The real aliquot number this slice was actually
                    // submitted under (e.g. "002") -- AliquotVisualization
                    // prefers this over its own positional numbering, so the
                    // popover title/"Frozen #" reflects reality instead of
                    // just "the Nth slice rendered", which can disagree with
                    // the real number whenever a tissue's aliquot numbering
                    // isn't contiguous from 001 (confirmed against real data:
                    // a donor whose only real Frozen aliquot is "002", with
                    // no "001" ever submitted).
                    aliquotNumber: aliquotNumber || undefined,
                    // Explicit [] (not undefined) for a real Frozen sample with
                    // no Core suffix -- so AliquotVisualization's `|| DEFAULT`
                    // fallback (meant only for illustrative demo slices) does
                    // not kick in and invent a position this real sample
                    // doesn't have.
                    frozenCorePositions: corePosition ? [corePosition] : [],
                    // Only Frozen/Fresh samples have this; Fixed samples
                    // never will, so this is naturally empty for pink slices.
                    associatedPathologyReports: sample.associated_pathology_reports || [],
                    // A Fixed sample's *own* pathology_reports (direct
                    // rev-link) -- this is the actual, most direct
                    // relationship; associatedPathologyReports above only
                    // exists to give Frozen/Fresh samples a path to this same
                    // data through their linked Fixed sample(s).
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
        // happened to return them in -- confirmed as a real point of
        // confusion: a donor's "002" aliquot was rendered as the 2nd box and
        // "001" as the 3rd, purely because "002"'s samples appeared earlier
        // in the API response. Slices without a real number (demo/pink with
        // no parseable number) keep their original relative order, sorted
        // after any numbered ones.
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

    // Real data replacing the illustrative fallback mid-render is a visible
    // jump no matter how few steps it takes to get there (different slice
    // counts/colors/arrangement) -- show a spinner instead of the fallback
    // while genuinely loading, and reserve the fallback for a tissue that
    // has finished loading and truly has no TissueSamples yet. Once donors
    // have loaded but none is selected yet, showDonorPrompt takes over
    // instead of this spinner (see render below).
    const aliquotSamplesLoading = donorsLoading || (!!selectedDonorUuid && tissueSamples === null);
    const showDonorPrompt = !donorsLoading && donors.length > 0 && !selectedDonorUuid;
    // Distinct from showDonorPrompt (donors loaded, none picked yet) --
    // this is the permission-filtered donors search coming back empty
    // (e.g. logged out), which must not fall through to the illustrative
    // fallback diagram as if it were real data.
    const showNoDonorData = !donorsLoading && donors.length === 0;
    // A donor explicitly selected, its TissueSample search has finished
    // (not still loading), and it genuinely returned zero real samples --
    // e.g. the search 404s. AliquotVisualization/NonSolidAliquotVisualization
    // would otherwise render the illustrative fallback set, but that fallback
    // still gets labelled with this donor's own real idPrefix (e.g.
    // "SMHT023-3M"), which reads as real per-donor data (real-looking IDs,
    // "GCC1"/"GCC2" placeholders that look like redacted real centers) even
    // though every field on it is fabricated -- confirmed misleading in
    // practice, so show an explicit empty state instead of the fallback
    // once we know for certain (not just "still loading") that this donor
    // has none. Mirrors solidAliquotSlices/nonSolidAliquots' own real-vs-
    // fallback check exactly (Fresh samples don't count for solid tissues,
    // per that useMemo's own filter) -- a donor whose only TissueSamples are
    // Fresh (filtered out there too) would otherwise still fall through to
    // the same mislabelled fallback despite tissueSamples.length > 0.
    const hasRealAliquotData = nonSolidSpecimenType
        ? (tissueSamples || []).length > 0
        : (tissueSamples || []).some((sample) => sample.preservation_type !== 'Fresh');
    const showNoSampleData =
        !aliquotSamplesLoading && !!selectedDonorUuid && Array.isArray(tissueSamples) && !hasRealAliquotData;

    // `session` in the dependency array (here and below) so logging in/out
    // re-fetches -- permission-filtered results can change without `href`
    // or any of this component's other inputs changing.
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
            // Needed for the coverage sum below, not just the count -- `total`
            // reflects every match regardless of page size, but summing
            // `@graph` without this only sees the first page (10 by default,
            // snovault/search/search.py's PAGINATION_SIZE) and silently
            // undercounts.
            'limit=all',
        ].filter(Boolean);

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
    }, [donor?.display_title, tissueMatrixFilterValue, session]);

    // All donors that share this Tissue's resolved tissue_type, not just this Tissue's own donor.
    useEffect(() => {
        if (!tissueMatrixFilterValue) {
            setDonors([]);
            setDonorsLoading(false);
            return;
        }
        setDonorsLoading(true);
        ajax.load(
            // donor.study/donor.tags restrict this to the same donor
            // population Browse by Donor/Browse by File use (Production
            // study, has_released_files tag) -- see types/tissue.py's
            // embedded_list -- so this list doesn't include donors who don't
            // have released files yet (e.g. benchmarking-only donors).
            `/search/?type=Tissue&tissue_type=${encodeURIComponent(tissueMatrixFilterValue)}&donor.study=Production&donor.tags=has_released_files&limit=all`,
            (resp) => {
                const results = resp?.['@graph'] || [];
                setAllTissuesForType(results);
                setDonors(dedupeTissuesByDonor(results));
                setDonorsLoading(false);
            },
            'GET',
            () => {
                setAllTissuesForType([]);
                setDonors([]);
                setDonorsLoading(false);
            }
        );
    }, [tissueMatrixFilterValue, session]);

    const donorCount = donors.length;

    return (
        <div className="tissue-view">
            <TissueViewTitle context={context} />
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
                                ? getTissueDisplayLabel(targetTissueValue)
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
                                        value={getTissueDisplayLabel(targetTissueValue)}
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
                                        {!donorsLoading ? (
                                            <span>{donorCount}</span>
                                        ) : (
                                            <i className="icon icon-circle-notch icon-spin fas" />
                                        )}
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
                                            title="View all files for this donor & tissue">
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
                                                <td>{getDisplayText(formatDonorAge(d.age))}</td>
                                                <td
                                                    className={
                                                        enableConditionalColor
                                                            ? getAutolysisScoreCellClass(
                                                                pathologySummary.autolysis_score
                                                            )
                                                            : ''
                                                    }>
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
});

TissueView.getTabObject = function (props) {
    return {
        tab: <span>Tissue Overview</span>,
        key: 'tissue-overview',
        content: <TissueView {...props} />,
    };
};
