'use strict';

import React, { useEffect, useMemo, useState } from 'react';
import { OverlayTrigger, Popover, PopoverBody } from 'react-bootstrap';
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
    isTpcSubmissionCenter,
    getTissueFilesBrowseHref,
    getTissueAliquotDepthCm,
    getAliquotLayoutNote,
    isMedialLateralAliquotLayout,
    isBivalvedAliquotLayout,
    getBivalvedTemplate,
    buildBivalvedTemplateSlices,
    getMedialLateralTemplate,
    buildMedialLateralTemplateSlices,
    getStripTemplate,
    buildStripTemplateSlices,
    dedupePathologyReportEntries,
    getTissueDisplayLabel,
    getTissueColorHex,
    hexToRgba,
} from './components/tissue-overview/helpers';

// `search_query_params` for /data_matrix_aggregations/ takes status as a
// plain array, not a query string -- derived once from BROWSE_STATUS_FILTERS
// itself (rather than a second hardcoded list) so the two can't drift apart.
const BROWSE_STATUS_VALUES = new URLSearchParams(BROWSE_STATUS_FILTERS).getAll('status');

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
    // on by default using a neutral light->dark scale (_item-pages.scss),
    // not the earlier green->yellow->orange->red ramp that read as a status/
    // alarm signal regardless of what the metric actually was.
    enableConditionalColor = true,
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
    // Same official per-tissue color used for the germ-layer summary
    // bubbles (BrowseTissueVizWrapper.js) -- null for the tissue_type
    // values that color scheme doesn't cover, in which case the header
    // icon just keeps its existing default green theme (see the fallback
    // styling below and _item-pages.scss's .tissue-summary-header-icon).
    const tissueColorHex = getTissueColorHex(tissue_type || getDisplayText(uberon_id));
    const aliquotDepthCm = getTissueAliquotDepthCm(tissue_type || getDisplayText(uberon_id));
    const aliquotLayoutNote = getAliquotLayoutNote(tissue_type || getDisplayText(uberon_id));
    const enableMedialLateralLayers = isMedialLateralAliquotLayout(
        tissue_type || getDisplayText(uberon_id)
    );
    const enableBivalvedSplit = isBivalvedAliquotLayout(
        tissue_type || getDisplayText(uberon_id)
    );
    const targetTissueHref = uberon_id ? uberonHref : null;
    const tissueProtocolCode = tissue_type ? tissue_type.split(' - ')[0].trim() : null;
    // `category` is a real backend-calculated field (item_utils/tissue.py) --
    // "Clinically Accessible" covers exactly blood and buccal swab tissues.
    // Which of the two it is isn't itself a stored field, so that part still
    // falls back to matching the tissue_type label. Fibroblast is *also* a
    // non-solid (cultured-cell-suspension) specimen like blood/buccal swab,
    // but get_category() groups it under "Mesoderm" (its germ-layer
    // category, for the Browse germ-layer panel) rather than "Clinically
    // Accessible" -- so it can't be detected the same way. It's still
    // reliably identifiable by protocol code though: get_tissue_type()
    // special-cases fibroblast to always return "3AC - Fibroblast".
    const nonSolidSpecimenType =
        category === 'Clinically Accessible'
            ? tissue_type?.toLowerCase().includes('buccal')
                ? 'buccal'
                : 'blood'
            : tissueProtocolCode === '3AC'
                ? 'fibroblast'
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
    // Every sample_summary.sample_names value seen across this donor+tissue's
    // actual indexed Files (built for free below, off the same fetch used
    // for fileCount/totalCoverage) -- lets each aliquot/core position check
    // whether it *really* has files instead of just inferring "probably yes"
    // from having a real (non-TPC) submission_centers value. A TissueSample
    // can be submitted to a real GCC well before that GCC's files actually
    // exist/are indexed, so that inference was confirmed misleading: the
    // popover would show a GCC name and a clickable link that resolves to
    // 0 results.
    const [sampleNamesWithFiles, setSampleNamesWithFiles] = useState(null);
    const [donors, setDonors] = useState([]);
    // Every Tissue record sharing this tissue_type, undeduped -- unlike
    // `donors` (one representative Tissue per donor, for the summary table),
    // this keeps sibling Fixed/Frozen Tissue records together so the aliquot
    // panel can combine both into one box for a given donor.
    const [allTissuesForType, setAllTissuesForType] = useState([]);
    const [donorsLoading, setDonorsLoading] = useState(true);
    // Which of `donors`, keyed by external_id, actually have >=1 real
    // TissueSample (Core/Fixed/Frozen/Liquid/Cells) for this tissue_type --
    // a donor can have a real Tissue record (which is all `donors` itself
    // confirms) well before any aliquot has actually been submitted/
    // processed for it, which otherwise meant every single option in the
    // donor picker had to be clicked through by hand to discover which
    // ones actually had anything to show. null (not an empty Set) while
    // still loading/unknown, so nothing gets incorrectly disabled before
    // this resolves.
    const [donorsWithAliquotData, setDonorsWithAliquotData] = useState(null);
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
    const [showAliquotLayoutNote, setShowAliquotLayoutNote] = useState(false);

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
            //
            // `status%21=deleted`, not the literal `status!=deleted` -- a
            // raw "!" here is technically valid in a query string (RFC
            // 3986 leaves it unreserved, so the browser sends it as-is),
            // but Snovault's own URL canonicalization always percent-
            // encodes it, 301-redirecting to `%21` before actually serving
            // the search. Sending the encoded form directly skips that
            // redirect round-trip.
            `/search/?type=TissueSample&status%21=deleted&${sampleSourceParams}&limit=all`,
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
                            // Parallel to the centers array above (same
                            // index per (position, center) pair) -- this
                            // record's own external_id, so the position's
                            // files link (below) can narrow down to just
                            // this specific TissueSample's files instead of
                            // every file the GCC produced for the whole
                            // donor+tissue.
                            existing.frozenCorePositionExternalIds[corePosition] = (
                                existing.frozenCorePositionExternalIds[corePosition] || []
                            ).concat([sample.external_id || null]);
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
                    // This record's own external_id per position -- parallel
                    // array to frozenCorePositionSubmissionCenters above (see
                    // that field's comment).
                    frozenCorePositionExternalIds: corePosition
                        ? { [corePosition]: [sample.external_id || null] }
                        : {},
                };
                realSlices.push(slice);
                if (groupKey) slicesByGroupKey.set(groupKey, slice);
            });
        if (realSlices.length === 0) return sampleAliquotSlicesFallback;
        // Links each row's own GCC to *that specific core position's own*
        // files for this donor+tissue (via sample_summary.sample_names --
        // see getGccFilesBrowseHref's coreExternalId param), not every file
        // the GCC produced for the whole donor+tissue. Computed per
        // (position, center) pair, since a position can have more than one
        // real submitting center.
        realSlices.forEach((slice) => {
            slice.frozenCorePositionFilesHrefs = {};
            // Generic (not core-specific) href per distinct submitting
            // center -- the popover groups every position under the same
            // GCC into one row group (see AliquotVisualization.js), and
            // that group's own header link is meant to mean "this GCC's
            // files for this whole donor+tissue", not any one position's;
            // each position's own row links to its own core-specific href
            // (frozenCorePositionFilesHrefs above) instead. Named for the
            // *filter* the resulting href actually applies
            // (sequencing_center.display_title on File, per
            // getGccFilesBrowseHref) rather than the submissionCenter input
            // value, since submission_centers on a File is often a
            // downstream analysis center (e.g. "HMS DAC"), not this GCC.
            slice.gccFilesHrefs = {};
            // Ground truth, not an inference from having a real (non-TPC)
            // submissionCenter -- see nonSolidAliquots' identical
            // `hasFiles` for the full rationale (a TissueSample can be
            // submitted to a real GCC well before that GCC's files for it
            // actually exist/are indexed). `sampleNamesWithFiles === null`
            // (still loading) intentionally reads as "yes" so the popover
            // doesn't flash "No files yet" and then correct itself.
            const centersWithFiles = new Set();
            Object.entries(slice.frozenCorePositionSubmissionCenters).forEach(
                ([corePosition, submissionCenters]) => {
                    const externalIds = slice.frozenCorePositionExternalIds[corePosition] || [];
                    slice.frozenCorePositionFilesHrefs[corePosition] = submissionCenters.map(
                        (submissionCenter, i) => {
                            const externalId = externalIds[i] || null;
                            const hasFiles =
                                sampleNamesWithFiles === null ||
                                (!!externalId && sampleNamesWithFiles.has(externalId));
                            if (hasFiles && submissionCenter) {
                                centersWithFiles.add(submissionCenter);
                            }
                            return hasFiles
                                ? getGccFilesBrowseHref({
                                    donorDisplayTitle: selectedDonorDisplayTitle,
                                    tissueTypeValue: tissueMatrixFilterValue,
                                    submissionCenter,
                                    coreExternalId: externalId,
                                })
                                : null;
                        }
                    );
                }
            );
            Object.values(slice.frozenCorePositionSubmissionCenters).forEach(
                (submissionCenters) => {
                    submissionCenters.forEach((submissionCenter) => {
                        if (
                            !submissionCenter ||
                            slice.gccFilesHrefs[submissionCenter] !== undefined
                        ) {
                            return;
                        }
                        slice.gccFilesHrefs[submissionCenter] = centersWithFiles.has(
                            submissionCenter
                        )
                            ? getGccFilesBrowseHref({
                                donorDisplayTitle: selectedDonorDisplayTitle,
                                tissueTypeValue: tissueMatrixFilterValue,
                                submissionCenter,
                            })
                            : null;
                    });
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
    }, [
        tissueSamples,
        selectedDonorDisplayTitle,
        tissueMatrixFilterValue,
        sampleNamesWithFiles,
    ]);

    // Bivalved tissues (Adrenal/Heart/Gonads) always render their full
    // fixed Anterior/Posterior template (see getBivalvedTemplate) once
    // there's real data at all -- not just solidAliquotSlices' own
    // variable-length real slice list. Left alone while solidAliquotSlices
    // is still the illustrative demo set (no donor picked yet): expanding a
    // fabricated demo slice list out to fill a real fixed template would
    // only compound how much of the panel is made up.
    const bivalvedTemplate = enableBivalvedSplit
        ? getBivalvedTemplate(tissueMatrixFilterValue)
        : null;
    // Same fixed-template treatment for Lung/Liver (see getMedialLateralTemplate) --
    // enableBivalvedSplit/enableMedialLateralLayers are mutually exclusive per
    // tissue_type, so only one of these two ever actually resolves a template.
    const medialLateralTemplate = enableMedialLateralLayers
        ? getMedialLateralTemplate(tissueMatrixFilterValue)
        : null;
    // Muscle/Skin/Colon/Aorta/Esophagus's fixed 9-slice strip (see
    // getStripTemplate) -- no split/layering prop needed for this one,
    // since it renders through the same plain single-row path as any other
    // (non-bivalved, non-medial/lateral) tissue already does; only ever
    // resolves for the tissues explicitly in that group, so it can't
    // conflict with the other two templates above.
    const stripTemplate = !bivalvedTemplate && !medialLateralTemplate
        ? getStripTemplate(tissueMatrixFilterValue)
        : null;
    const displaySlices =
        bivalvedTemplate && solidAliquotSlices !== sampleAliquotSlicesFallback
            ? buildBivalvedTemplateSlices(bivalvedTemplate, solidAliquotSlices)
            : medialLateralTemplate && solidAliquotSlices !== sampleAliquotSlicesFallback
                ? buildMedialLateralTemplateSlices(medialLateralTemplate, solidAliquotSlices)
                : stripTemplate && solidAliquotSlices !== sampleAliquotSlicesFallback
                    ? buildStripTemplateSlices(stripTemplate, solidAliquotSlices)
                    : solidAliquotSlices;

    const nonSolidAliquots = useMemo(() => {
        const realAliquots = (tissueSamples || []).map((sample) => {
            const rawSubmissionCenter = sample.submission_centers?.[0]?.display_title || null;
            // A TPC (e.g. "NDRI TPC") is a procurement-level record with no
            // files of its own -- excluded here the same way
            // AliquotVisualization.js excludes it from the solid-tissue core
            // grid/popover, rather than shown as if it were this aliquot's
            // owning GCC. `hasOnlyTpcSubmission` (vs. just leaving
            // submissionCenter null, which also covers "no data at all"/
            // demo slices) lets the render side tell a real TPC-only
            // aliquot apart from an illustrative placeholder, so it can say
            // "no files yet" instead of a fabricated "GCC1" label.
            const hasOnlyTpcSubmission = isTpcSubmissionCenter(rawSubmissionCenter);
            // Ground truth, not an inference from submission_centers -- a
            // sample can be legitimately submitted to a real GCC well
            // before that GCC's files for it actually exist/are indexed
            // (see sampleNamesWithFiles above), so `hasOnlyTpcSubmission`
            // alone isn't enough to promise "this aliquot has files".
            // `sampleNamesWithFiles === null` (still loading) intentionally
            // reads as "yes" here rather than flashing "No files yet" and
            // then correcting itself once the fetch resolves.
            const hasFiles =
                !hasOnlyTpcSubmission &&
                (sampleNamesWithFiles === null ||
                    sampleNamesWithFiles.has(sample.external_id));
            return {
                id: sample.uuid,
                description: sample.external_id || sample.accession || undefined,
                submissionCenter: hasOnlyTpcSubmission ? null : rawSubmissionCenter,
                hasOnlyTpcSubmission,
                hasFiles,
                // getGccFilesBrowseHref itself already returns null for a
                // non-GCC center, so passing the raw (unfiltered) center
                // through is safe -- narrowed to just this aliquot's own
                // files via its own external_id (sample_summary.sample_names).
                // Nulled out when hasFiles is false so the popover can't
                // link to a query that's confirmed to resolve to 0 results.
                filesHref: hasFiles
                    ? getGccFilesBrowseHref({
                        donorDisplayTitle: selectedDonorDisplayTitle,
                        tissueTypeValue: tissueMatrixFilterValue,
                        submissionCenter: rawSubmissionCenter,
                        coreExternalId: sample.external_id || null,
                    })
                    : null,
                // The GCC's own name is also a link in the solid-tissue
                // popover (AliquotVisualization.js's group header) -- to
                // this same generic (not core-specific) "all this GCC's
                // files for this donor+tissue" href, not this one
                // aliquot's own narrower one above.
                gccFilesHref: hasFiles
                    ? getGccFilesBrowseHref({
                        donorDisplayTitle: selectedDonorDisplayTitle,
                        tissueTypeValue: tissueMatrixFilterValue,
                        submissionCenter: rawSubmissionCenter,
                    })
                    : null,
            };
        });
        return realAliquots.length > 0 ? realAliquots : sampleNonSolidAliquots;
    }, [
        tissueSamples,
        selectedDonorDisplayTitle,
        tissueMatrixFilterValue,
        sampleNamesWithFiles,
    ]);

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
    //
    // Uses /data_matrix_aggregations/ (the same aggregation endpoint
    // DataMatrix.js/BrowseDonorVizWrapper.js already rely on) instead of a
    // plain /search/?limit=all fetch of every matching File -- this donor's
    // one tissue realistically stays well under the endpoint's own
    // per-bucket cap (MAX_BUCKET_COUNT=200 in visualization.py, sized for
    // "up to ~150 donors"), so a single request gets fileCount, the real
    // total_coverage sum, *and* sampleNamesWithFiles all as proper ES
    // aggregations -- no File document bodies transferred at all, so this
    // doesn't get more expensive as this donor+tissue's file count grows.
    // `column_agg_fields: ['status']` groups by File's own (single-valued,
    // non-array) status -- at most the handful of values in
    // BROWSE_STATUS_VALUES -- purely so each bucket's total_coverage can be
    // summed client-side into one overall figure without double-counting
    // (status is 1-per-File, unlike sample_summary.sample_names, which is
    // why that field is nested as `row_agg_fields` instead: a pooled/"MC"
    // File can legitimately list more than one sample_name, so summing
    // *that* dimension's per-bucket coverage would double-count it).
    useEffect(() => {
        const searchQueryParams = {
            type: ['File'],
            status: BROWSE_STATUS_VALUES,
            'dataset!': ['No value'],
            ...(donor?.display_title
                ? { 'donors.display_title': [donor.display_title] }
                : {}),
            ...(tissueMatrixFilterValue
                ? { 'sample_summary.tissues': [tissueMatrixFilterValue] }
                : {}),
        };

        setIsLoading(true);
        ajax.load(
            '/data_matrix_aggregations/',
            (resp) => {
                setFileCount(resp?.counts?.files || 0);
                const statusBuckets = resp?.terms || {};
                // Same semantics as DataMatrix.js's total_coverage reducers:
                // a sum of each File's own (already-averaged) per-BAM
                // coverage, computed here by ES itself (Painless script,
                // see SUM_DATA_GENERATION_SUMMARY_AGGREGATION_DEFINITION)
                // rather than summed client-side over fetched documents.
                let coverageSum = 0;
                const namesWithFiles = new Set();
                Object.values(statusBuckets).forEach((bucket) => {
                    coverageSum += Number(bucket?.counts?.total_coverage) || 0;
                    Object.keys(bucket?.terms || {}).forEach((name) =>
                        namesWithFiles.add(name)
                    );
                });
                setTotalCoverage(coverageSum);
                setSampleNamesWithFiles(namesWithFiles);
                setIsLoading(false);
            },
            'POST',
            () => {
                setFileCount(0);
                setTotalCoverage(0);
                setSampleNamesWithFiles(new Set());
                setIsLoading(false);
            },
            JSON.stringify({
                search_query_params: searchQueryParams,
                column_agg_fields: ['status'],
                row_agg_fields: ['sample_summary.sample_names'],
            }),
            {},
            null
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

    // Batch pre-check (one request, not one per donor) for which donors in
    // the picker above actually have real TissueSample data for this
    // tissue_type -- reuses /data_matrix_aggregations/ (now fixed to only
    // attach its File-specific coverage aggregation when the search is
    // actually scoped to File -- see visualization.py's is_file_type_search
    // -- confirmed against real data after the earlier fix caused every
    // donor to wrongly show as having no data), scoped to every donor's
    // own Tissue uuid(s) at once via sample_sources.uuid, bucketed by
    // sample_sources.donor.external_id (already embedded, see
    // types/sample.py's embedded_list) so it doesn't need per-donor
    // requests. max_bucket_count is set generously above this tissue_type's
    // actual donor count since a caller undercounting it silently drops
    // the lowest-count donors from the result (see visualization.py).
    useEffect(() => {
        const tissueUuids = allTissuesForType.map((t) => t?.uuid).filter(Boolean);
        if (tissueUuids.length === 0) {
            setDonorsWithAliquotData(donorsLoading ? null : new Set());
            return;
        }
        ajax.load(
            '/data_matrix_aggregations/',
            (resp) => {
                const bucket = resp?.terms || {};
                setDonorsWithAliquotData(new Set(Object.keys(bucket)));
            },
            'POST',
            () => setDonorsWithAliquotData(new Set()),
            JSON.stringify({
                search_query_params: {
                    type: ['TissueSample'],
                    'status!': ['deleted'],
                    'sample_sources.uuid': tissueUuids,
                },
                column_agg_fields: ['sample_sources.donor.external_id'],
                row_agg_fields: ['status'],
                max_bucket_count: Math.max(tissueUuids.length, 200),
            }),
            {},
            null
        );
    }, [allTissuesForType, donorsLoading, session]);

    const donorCount = donors.length;

    return (
        <div className="tissue-view">
            <TissueViewTitle context={context} />
            <div className="view-content">
                <div className="tissue-summary-header">
                    <div
                        className="tissue-summary-header-icon"
                        style={
                            tissueColorHex
                                ? {
                                    borderColor: hexToRgba(tissueColorHex, 0.85),
                                    borderWidth: 4,
                                }
                                : undefined
                        }>
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
                        {uberon_id?.description ? (
                            <div className="tissue-summary-header-notes">
                                <span className="notes-label">Description</span>
                                <span className="notes-value">{uberon_id.description}</span>
                            </div>
                        ) : null}
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
                                {aliquotLayoutNote && !nonSolidSpecimenType ? (
                                    <OverlayTrigger
                                        show={showAliquotLayoutNote}
                                        overlay={
                                            <Popover id="tissue-aliquot-layout-note-popover">
                                                <PopoverBody
                                                    // eslint-disable-next-line react/jsx-no-bind
                                                    onMouseEnter={() =>
                                                        setShowAliquotLayoutNote(true)
                                                    }
                                                    // eslint-disable-next-line react/jsx-no-bind
                                                    onMouseLeave={() =>
                                                        setShowAliquotLayoutNote(false)
                                                    }>
                                                    {aliquotLayoutNote}
                                                </PopoverBody>
                                            </Popover>
                                        }
                                        placement="right"
                                        flip={true}
                                        popperConfig={{
                                            modifiers: [
                                                {
                                                    name: 'flip',
                                                    options: {
                                                        fallbackPlacements: [
                                                            'bottom',
                                                            'left',
                                                            'top',
                                                        ],
                                                    },
                                                },
                                            ],
                                        }}>
                                        <i
                                            className="icon icon-info-circle fas aliquot-title-info-icon"
                                            // eslint-disable-next-line react/jsx-no-bind
                                            onMouseEnter={() => setShowAliquotLayoutNote(true)}
                                            // eslint-disable-next-line react/jsx-no-bind
                                            onMouseLeave={() => setShowAliquotLayoutNote(false)}
                                        />
                                    </OverlayTrigger>
                                ) : null}
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
                                        {donors.map(({ donor: d }) => {
                                            // null (still loading) reads as
                                            // "don't know yet" -- nothing
                                            // gets disabled prematurely.
                                            const hasData =
                                                donorsWithAliquotData === null ||
                                                donorsWithAliquotData.has(d.external_id);
                                            return (
                                                <option
                                                    key={d.uuid}
                                                    value={d.uuid}
                                                    disabled={!hasData}>
                                                    {getDisplayText(d)}
                                                    {hasData ? '' : ' (no data yet)'}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            ) : null}
                        </div>
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
                                    slices={displaySlices}
                                    dimensions={{
                                        heightCm: 1,
                                        depthCm: aliquotDepthCm,
                                        heightLabel: '1 cm',
                                        depthLabel: `${aliquotDepthCm} cm`,
                                    }}
                                    idPrefix={aliquotIdPrefix}
                                    showSliceLabels={false}
                                    enableMedialLateralLayers={enableMedialLateralLayers}
                                    enableBivalvedSplit={enableBivalvedSplit}
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
                                                        <a
                                                            href={histologyImages[0]?.href || histologyImages[0]?.['@id']}
                                                            target="_blank"
                                                            rel="noopener noreferrer">
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
