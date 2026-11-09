'use strict';

import React, { useEffect, useMemo, useState } from 'react';
import { OverlayTrigger, Popover, PopoverBody } from 'react-bootstrap';
import {
    ajax,
    memoizedUrlParse,
    JWT,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { BROWSE_STATUS_FILTERS } from './BrowseView';
import {
    HeatmapColorPicker,
    buildSequentialPaletteFromHex,
} from './browse-view/BrowseTissueHeatmapTable';
import AliquotVisualization from '../item-pages/components/tissue-overview/AliquotVisualization';
import NonSolidAliquotVisualization from '../item-pages/components/tissue-overview/NonSolidAliquotVisualization';
import PathologyReportsTable, {
    PATHOLOGY_REPORT_SEARCH_FIELDS,
    getReportDonorUuids,
    getLinkId,
} from '../item-pages/components/tissue-overview/PathologyReportsTable';
import BrainPathologyReportsTable, {
    BRAIN_PATHOLOGY_REPORT_SEARCH_FIELDS,
} from '../item-pages/components/tissue-overview/BrainPathologyReportsTable';
import { useUserDownloadAccess } from '../util/hooks';
import { pageTitleViews } from '../PageTitleSection';
import { getTissueInternalCodeFromFacetTerm } from '../util/data';
import {
    getDisplayText,
    dedupeTissuesByDonor,
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
    getTissueNameFromFacetTerm,
    getTissueColorHex,
    hexToRgba,
} from '../item-pages/components/tissue-overview/helpers';

// Standalone page for /tissue-overview/?tissue_type=<value>, registered
// against the synthetic 'Tissue-Overview' @type the backend's
// tissue_overview.py route forces onto its search response -- a real
// tissue_type-keyed page (unlike the legacy TissueOverview tab on a single
// Tissue item's page at /tissues/<uuid>/), so `context` here is the search
// response itself (its `@graph` is the Tissue-search-by-tissue_type dataset).

// This page renders its own title/breadcrumb (TissueTypeViewTitle, below)
// inline with its content, same as item pages do -- suppress
// PageTitleSection's generic fallback. The browser tab title (app.js's
// HTMLTitle) still reads context.title directly -- tissue_overview.py
// overrides that field per-request to the actual tissue_type value.
pageTitleViews.register(() => null, 'Tissue-Overview');

// See TissueView.js's identical constant for the full rationale.
const BROWSE_STATUS_VALUES = new URLSearchParams(BROWSE_STATUS_FILTERS).getAll('status');
// This page's Files stat spans every donor sharing a tissue_type (unlike
// TissueView.js's single-donor scope), so the number of distinct
// sample_summary.sample_names values can realistically exceed
// data_matrix_aggregations' default per-bucket cap -- opt into a higher one
// (see visualization.py's max_bucket_count/MAX_BUCKET_COUNT_CEILING).
const TISSUE_TYPE_MAX_BUCKET_COUNT = 3000;

// Same released-donor Production population this page's own Tissue search is
// forced to (tissue_overview.py), expressed from a TissueSample's side -- see
// types/tissue_sample.py's sample_sources.donor.* embeds.
const SAMPLE_DONOR_POPULATION_PARAMS = {
    'sample_sources.donor.study': ['Production'],
    'sample_sources.donor.tags': ['has_released_files'],
};

// Tissue.preservation_type ("Snap Frozen", "Fixed" or "Fresh") decides which
// of the Sequencing Data/Histology & Pathology Data cards a Tissue (and its
// samples) counts towards: Fixed tissue is what pathology reports and
// histology images are made from, every other kind is what gets sequenced.
const isFixedPreservation = (preservationType) => preservationType === 'Fixed';

// "Snap Frozen" reads as plain "Frozen" in TPC code labels (e.g. "3Q - Frozen Lung").
const getPreservationLabel = (preservationType) =>
    preservationType && /frozen/i.test(preservationType) ? 'Frozen' : preservationType || null;

// A Tissue's own TPC code from its external_id (e.g. "3AG" in "SMHT004-3AG") --
// unlike tissue_type's code, this differs between a donor's Fixed and Frozen
// Tissue records even though both share one tissue_type.
const getTpcCodeFromExternalId = (externalId) => {
    const match = /^[A-Z0-9]+-(\d+[A-Z]+)$/.exec(externalId || '');
    return match ? match[1] : null;
};

// Resolves to a search's `total`, or 0 -- an empty search answers 404 (with
// total 0), which ajax.load routes to its error callback.
const fetchSearchTotal = (href) =>
    new Promise((resolve) => {
        const onResponse = (resp) => resolve(resp?.total || 0);
        ajax.load(href, onResponse, 'GET', onResponse);
    });

const SummaryDatum = ({ title, children }) => (
    <div className="datum">
        <span className="datum-title">{title}</span>
        <span className="datum-value">{children || '-'}</span>
    </div>
);

// One of the Sequencing Data/Histology & Pathology Data cards: the TPC
// code(s) of the Tissues it covers, their sample count, and its own stats.
// A null count is still loading.
const TissueDataCard = ({ title, variant, iconSrc, codeLabels, sampleCount, stats }) => (
    <div className={'tissue-data-card ' + variant}>
        <div className="header">
            <span className="header-text">{title}</span>
        </div>
        <div className="body">
            <div className="tissue-data-panel">
                <div className="tissue-data-panel-heading">
                    {iconSrc ? (
                        <i
                            className="tissue-icon-mask"
                            style={{
                                WebkitMaskImage: `url(${iconSrc})`,
                                maskImage: `url(${iconSrc})`,
                            }}
                        />
                    ) : null}
                    <div className="tissue-data-panel-title">
                        {codeLabels.map((label) => (
                            <div key={label}>{label}</div>
                        ))}
                    </div>
                    <span className="tissue-data-panel-badge">
                        {sampleCount === null ? (
                            <i className="icon icon-circle-notch icon-spin fas" />
                        ) : (
                            sampleCount
                        )}{' '}
                        {sampleCount === 1 ? 'Sample' : 'Samples'}
                    </span>
                </div>
                <div className="tissue-data-panel-stats">
                    {stats.map(({ label, value }) => (
                        <div className="tissue-data-panel-stat" key={label}>
                            <div className="stat-label">{label}</div>
                            <div className="stat-value">
                                {value === null ? (
                                    <i className="icon icon-circle-notch icon-spin fas" />
                                ) : (
                                    value
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </div>
);

const TissueTypeViewTitle = ({ representativeTissue }) => {
    // Same tissue_type-first preference as the body's targetTissueValue below.
    const targetTissueValue =
        representativeTissue?.tissue_type || representativeTissue?.uberon_id || null;
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

export default function TissueTypeView({
    context = {},
    href,
    session,
    // Gates the Donor Details table's Autolysis Score cell coloring below --
    // on by default using a neutral light->dark scale (_item-pages.scss),
    // not a status/alarm-style color ramp.
    enableConditionalColor = true,
}) {
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

    // Experimental Colors picker for the Donor Details table's Autolysis
    // Score column -- same admin-only, in-memory-only pattern as
    // BrowseTissueHeatmapTable.js's HeatmapColorPicker (imported directly
    // rather than reimplemented), just wired to this table's own,
    // independent `--tissue-donor-score-N-*` custom properties (see
    // _item-pages.scss) instead of the heatmap's `--heatmap-score-N-*`.
    const isAdminUser = useMemo(
        () => (JWT.getUserGroups() || []).includes('admin'),
        [session]
    );
    const [paletteBaseHex, setPaletteBaseHex] = useState(null);
    const donorTablePalette = useMemo(
        () => (paletteBaseHex ? buildSequentialPaletteFromHex(paletteBaseHex) : null),
        [paletteBaseHex]
    );
    const handlePickPaletteColor = (hex) => setPaletteBaseHex(hex);
    const handleResetPaletteColor = () => setPaletteBaseHex(null);
    const donorTablePaletteStyle = donorTablePalette
        ? donorTablePalette.reduce((style, { bg, text }, i) => {
            style[`--tissue-donor-score-${i}-bg`] = bg;
            style[`--tissue-donor-score-${i}-text`] = text;
            return style;
        }, {})
        : undefined;

    // Representative Tissue for header/summary fields (uberon_id, category,
    // study, display_title) -- prefer an entry with a populated
    // pathology_summary, same preference dedupeTissuesByDonor uses.
    const representativeTissue = useMemo(
        () => allTissuesForType.find((t) => t?.pathology_summary) || allTissuesForType[0] || null,
        [allTissuesForType]
    );

    const { display_title, uberon_id, tissue_type, category } = representativeTissue || {};

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
    const tissueProtocolCode = tissue_type ? tissue_type.split(' - ')[0].trim() : null;
    // `category` is a real backend-calculated field (item_utils/tissue.py) --
    // "Clinically Accessible" covers exactly blood and buccal swab tissues.
    // Which of the two it is isn't itself a stored field, so that part still
    // falls back to matching the tissue_type label. Fibroblast is *also* a
    // non-solid specimen like blood/buccal swab, but get_category() groups
    // it under "Mesoderm" instead, so it's detected by protocol code instead
    // (get_tissue_type() special-cases fibroblast to always return
    // "3AC - Fibroblast").
    const nonSolidSpecimenType =
        category === 'Clinically Accessible'
            ? tissue_type?.toLowerCase().includes('buccal')
                ? 'buccal'
                : 'blood'
            : tissueProtocolCode === '3AC'
                ? 'fibroblast'
                : null;
    // Prefer the real, resolved tissue_type off an actual Tissue result over
    // the raw URL token -- downstream consumers need the full
    // "<TPC code> - <name>" string, not the short code the URL may carry.
    // Only falls back to the raw param when there are no results to read it
    // from (e.g. a tissue_type with zero matching Tissues).
    const tissueMatrixFilterValue = tissue_type || tissueType || null;
    // Mirrors the fileCount fetch below exactly (tissue_type only, every
    // donor sharing it -- no single donor here) so this always matches the
    // "Files: N" stat.
    const filesBrowseHref = getTissueFilesBrowseHref({
        tissueTypeValue: tissueMatrixFilterValue,
    });
    // Every HistologyImage of this tissue_type's pathology reports, for the
    // same donor population -- also the query the Histology Images count
    // below runs, so the count matches the list this link opens.
    const histologyImagesSearchQuery = tissueMatrixFilterValue
        ? 'type=HistologyImage' +
          `&pathology_reports.tissue_samples.sample_sources.tissue_type=${encodeURIComponent(tissueMatrixFilterValue)}` +
          '&pathology_reports.tissue_samples.sample_sources.donor.study=Production' +
          '&pathology_reports.tissue_samples.sample_sources.donor.tags=has_released_files'
        : null;
    const histologyImagesBrowseHref = histologyImagesSearchQuery
        ? `/search/?${histologyImagesSearchQuery}`
        : null;

    const tissueName = getTissueNameFromFacetTerm(targetTissueValue);
    // Brain regions (e.g. "Brain, Frontal Lobe") have BrainPathologyReports,
    // whose aliquot table isn't designed yet -- they keep the donor-level table.
    const isBrainTissue = /^brain\b/i.test(tissueName);
    const smahtAcronym = tissue_type ? getTissueInternalCodeFromFacetTerm(tissue_type) : null;
    // Each distinct TPC code among this tissue_type's Tissues with its
    // preservation type -- sequenced (Frozen/Fresh) codes first, then Fixed.
    const tpcCodeEntries = useMemo(() => {
        const preservationTypeByCode = new Map();
        allTissuesForType.forEach((t) => {
            const code = getTpcCodeFromExternalId(t?.external_id);
            if (code && !preservationTypeByCode.has(code)) {
                preservationTypeByCode.set(code, t.preservation_type || null);
            }
        });
        return Array.from(preservationTypeByCode, ([code, preservationType]) => {
            return { code, preservationType };
        }).sort(
            (a, b) =>
                Number(isFixedPreservation(a.preservationType)) -
                    Number(isFixedPreservation(b.preservationType)) ||
                a.code.localeCompare(b.code, undefined, { numeric: true })
        );
    }, [allTissuesForType]);
    const getTpcCodeDescription = ({ preservationType }) =>
        [getPreservationLabel(preservationType), tissueName].filter(Boolean).join(' ');
    // Falls back to a plain "Fixed Liver"-style label when no Tissue of that
    // kind exists for this tissue_type (yet).
    const getTpcCodeLabels = (isFixed) => {
        const labels = tpcCodeEntries
            .filter((entry) => isFixedPreservation(entry.preservationType) === isFixed)
            .map((entry) => `${entry.code} - ${getTpcCodeDescription(entry)}`);
        return labels.length > 0 ? labels : [`${isFixed ? 'Fixed' : 'Frozen'} ${tissueName}`];
    };
    // Every TPC code, sequenced ones first -- the aliquot popovers' Tissue lines.
    const tissueCodeLabels = tpcCodeEntries.map((entry) => `${entry.code} - ${getTpcCodeDescription(entry)}`);
    // Target tissue subtypes reported by this tissue_type's pathology reports
    // (pathology_summary.target_tissues) -- a subtype named the same as the
    // tissue itself (e.g. Lung's "Lung") isn't a real subdivision of it.
    const tissueSubtypes = useMemo(() => {
        const subtypes = new Set();
        allTissuesForType.forEach((t) => {
            (t?.pathology_summary?.target_tissues || []).forEach((entry) => {
                if (entry?.subtype && entry.subtype.toLowerCase() !== tissueName.toLowerCase()) {
                    subtypes.add(entry.subtype);
                }
            });
        });
        return Array.from(subtypes).sort();
    }, [allTissuesForType, tissueName]);
    // Tissue.anatomical_location is recorded per Tissue, so donors can differ
    // -- each distinct value is listed. One that just repeats the tissue's
    // own name (e.g. "Liver") says nothing more and is left out.
    const collectionDetails = useMemo(() => {
        const locations = new Set();
        allTissuesForType.forEach((t) => {
            const location = t?.anatomical_location?.trim();
            if (location && location.toLowerCase() !== tissueName.toLowerCase()) {
                locations.add(location);
            }
        });
        return Array.from(locations).sort();
    }, [allTissuesForType, tissueName]);

    const [isLoading, setIsLoading] = useState(true);
    const [fileCount, setFileCount] = useState(0);
    // See TissueView.js's identical state for the full rationale.
    const [sampleNamesWithFiles, setSampleNamesWithFiles] = useState(null);
    // See TissueView.js's identical state for the full rationale.
    const [assayPlatformsBySampleName, setAssayPlatformsBySampleName] = useState({});
    // See TissueView.js's identical state for the full rationale.
    const [donorsWithAliquotData, setDonorsWithAliquotData] = useState(null);
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
        // `ignore` guards against a stale in-flight request overwriting a
        // newer one's state if responses arrive out of order (cleanup below).
        let ignore = false;
        setSamplesUpdating(true);
        const sampleSourceParams = tissueUuidsForSelectedDonor
            .map((uuid) => `sample_sources.uuid=${encodeURIComponent(uuid)}`)
            .join('&');
        ajax.load(
            // `limit=all` -- without it, Snovault's default PAGINATION_SIZE
            // (10, not the more commonly assumed 25) silently truncates the
            // result set with no error or indication anything was missing.
            //
            // See TissueView.js's identical fetch for why this is
            // `status%21=deleted`, not the literal `status!=deleted`.
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
                    // record -- e.g. a TPC procurement-level record and a
                    // separate GCC-submitted record for the same core -- so
                    // keep every distinct center per position instead of
                    // overwriting with just the last one processed.
                    if (corePosition) {
                        const center = sample.submission_centers?.[0]?.display_title || null;
                        const existingCenters =
                            existing.frozenCorePositionSubmissionCenters[corePosition] || [];
                        if (!existingCenters.includes(center)) {
                            existing.frozenCorePositionSubmissionCenters[corePosition] =
                                existingCenters.concat([center]);
                            // Parallel to the centers array above (same
                            // index per (position, center) pair) -- see
                            // TissueView.js's identical field for why.
                            existing.frozenCorePositionExternalIds[corePosition] = (
                                existing.frozenCorePositionExternalIds[corePosition] || []
                            ).concat([sample.external_id || null]);
                            existing.frozenCorePositionCoreSizes[corePosition] = (
                                existing.frozenCorePositionCoreSizes[corePosition] || []
                            ).concat([sample.core_size || null]);
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
                    // This record's own external_id per position -- parallel
                    // array to frozenCorePositionSubmissionCenters above.
                    frozenCorePositionExternalIds: corePosition
                        ? { [corePosition]: [sample.external_id || null] }
                        : {},
                    // This record's own `core_size` (mm: "1.5", "3.0" or "3.0
                    // Donut"; only Core samples have one) per position --
                    // parallel array to the two above, same reasoning.
                    frozenCorePositionCoreSizes: corePosition
                        ? { [corePosition]: [sample.core_size || null] }
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
            // that group's own header link means "this GCC's files for this
            // whole donor+tissue", not any one position's (which link to
            // frozenCorePositionFilesHrefs above instead). See TissueView.js's
            // identical field for the full rationale.
            slice.gccFilesHrefs = {};
            // See TissueView.js's identical block for the full rationale
            // (hasFiles is ground truth from sampleNamesWithFiles, not an
            // inference from having a real submissionCenter).
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
        // happened to return them in.
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
                    // No real donor data yet (no donor picked, or still
                    // loading) -- solidAliquotSlices is just the generic
                    // illustrative demo set at this point, which doesn't
                    // reflect this tissue_type's own real layout at all. A
                    // tissue with a fixed template shape (bivalved split /
                    // medial-lateral layers / strip) instead gets that exact
                    // shape here, built with an empty real-slices list so
                    // every position comes back an inert placeholder -- this
                    // is what the dimmed pre-selection preview
                    // (tissue-aliquot-body's showDonorPrompt case) actually
                    // renders, so it already looks like *this* organ instead
                    // of an unrelated generic box. Tissues with no fixed
                    // template (plain solid organs) still fall through to
                    // the generic demo set below, since there's no more
                    // specific shape available for them.
                    : bivalvedTemplate
                        ? buildBivalvedTemplateSlices(bivalvedTemplate, [])
                        : medialLateralTemplate
                            ? buildMedialLateralTemplateSlices(medialLateralTemplate, [])
                            : stripTemplate
                                ? buildStripTemplateSlices(stripTemplate, [])
                                : solidAliquotSlices;

    const nonSolidAliquots = useMemo(() => {
        const realAliquots = (tissueSamples || []).map((sample) => {
            const rawSubmissionCenter = sample.submission_centers?.[0]?.display_title || null;
            // See TissueView.js's identical block for the full rationale.
            const hasOnlyTpcSubmission = isTpcSubmissionCenter(rawSubmissionCenter);
            // See TissueView.js's identical field for the full rationale.
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
                filesHref: hasFiles
                    ? getGccFilesBrowseHref({
                        donorDisplayTitle: selectedDonorDisplayTitle,
                        tissueTypeValue: tissueMatrixFilterValue,
                        submissionCenter: rawSubmissionCenter,
                        coreExternalId: sample.external_id || null,
                    })
                    : null,
                // See TissueView.js's identical field.
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

    const aliquotSamplesLoading = !!selectedDonorUuid && tissueSamples === null;
    const showDonorPrompt = donors.length > 0 && !selectedDonorUuid;
    // Distinct from showDonorPrompt (donors loaded, none picked yet) --
    // this is the permission-filtered donors search coming back empty
    // (e.g. logged out), which must not fall through to the illustrative
    // fallback diagram as if it were real data.
    const showNoDonorData = !isLoading && donors.length === 0;
    // A donor explicitly selected, its TissueSample search has finished, and
    // it genuinely returned zero real samples. AliquotVisualization/
    // NonSolidAliquotVisualization would otherwise render the illustrative
    // fallback set labelled with this donor's own real idPrefix (e.g.
    // "SMHT023-3M"), which reads as real per-donor data even though every
    // field on it is fabricated -- show an explicit empty state instead once
    // we know for certain (not just "still loading") that this donor has
    // none. Mirrors solidAliquotSlices/nonSolidAliquots' own real-vs-fallback
    // check (Fresh samples don't count for solid tissues, per that useMemo's
    // own filter).
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
            setSampleNamesWithFiles(new Set());
            setAssayPlatformsBySampleName({});
            setIsLoading(false);
            return;
        }
        // See TissueView.js's identical effect for the full rationale
        // (aggregation instead of /search/?limit=all, status as the
        // column dimension to avoid double-counting pooled/"MC" files'
        // coverage). max_bucket_count is raised here (see the constant
        // above) since this page's scope is every donor sharing this
        // tissue_type, not just one.
        const searchQueryParams = {
            type: ['File'],
            status: BROWSE_STATUS_VALUES,
            'dataset!': ['No value'],
            'sample_summary.tissues': [tissueMatrixFilterValue],
        };

        setIsLoading(true);
        ajax.load(
            '/data_matrix_aggregations/',
            (resp) => {
                setFileCount(resp?.counts?.files || 0);
                const statusBuckets = resp?.terms || {};
                const namesWithFiles = new Set();
                const assayPlatforms = {};
                Object.values(statusBuckets).forEach((bucket) => {
                    Object.entries(bucket?.terms || {}).forEach(([name, sampleBucket]) => {
                        namesWithFiles.add(name);
                        const combos = assayPlatforms[name] || (assayPlatforms[name] = new Set());
                        Object.entries(sampleBucket?.terms || {}).forEach(([assay, assayBucket]) => {
                            Object.keys(assayBucket?.terms || {}).forEach((platform) => {
                                combos.add(
                                    platform && platform !== 'No value'
                                        ? `${assay} - ${platform}`
                                        : assay
                                );
                            });
                        });
                    });
                });
                setSampleNamesWithFiles(namesWithFiles);
                setAssayPlatformsBySampleName(
                    Object.fromEntries(
                        Object.entries(assayPlatforms).map(([name, combos]) => [
                            name,
                            Array.from(combos).sort(),
                        ])
                    )
                );
                setIsLoading(false);
            },
            'POST',
            () => {
                setFileCount(0);
                setSampleNamesWithFiles(new Set());
                setAssayPlatformsBySampleName({});
                setIsLoading(false);
            },
            JSON.stringify({
                search_query_params: searchQueryParams,
                column_agg_fields: ['status'],
                row_agg_fields: [
                    'sample_summary.sample_names',
                    'assays.display_title',
                    'sequencers.platform',
                ],
                max_bucket_count: TISSUE_TYPE_MAX_BUCKET_COUNT,
            }),
            {},
            null
        );
    }, [tissueMatrixFilterValue, session]);

    // Sample and donor counts for the Sequencing Data/Histology & Pathology
    // Data cards, split by each sample's own preservation type (see
    // isFixedPreservation) -- not its Tissue's, same as Browse by Tissue's
    // chart (tissue-histology-samples.js). One aggregation, bucketed by
    // preservation type and then donor. null while loading.
    const [sampleStats, setSampleStats] = useState(null);
    useEffect(() => {
        const emptyStats = {
            sequencing: { samples: 0, donors: 0 },
            histology: { samples: 0, donors: 0 },
        };
        if (!tissueMatrixFilterValue) {
            setSampleStats(emptyStats);
            return;
        }
        let ignore = false;
        setSampleStats(null);
        ajax.load(
            '/data_matrix_aggregations/',
            (resp) => {
                if (ignore) return;
                const groups = {
                    sequencing: { samples: 0, donors: new Set() },
                    histology: { samples: 0, donors: new Set() },
                };
                Object.entries(resp?.terms || {}).forEach(([preservationType, bucket]) => {
                    // Samples with no preservation type belong to neither card.
                    if (preservationType === 'No value') return;
                    const group = isFixedPreservation(preservationType)
                        ? groups.histology
                        : groups.sequencing;
                    group.samples += bucket?.counts?.files || 0;
                    Object.keys(bucket?.terms || {}).forEach((donorId) => group.donors.add(donorId));
                });
                setSampleStats({
                    sequencing: { samples: groups.sequencing.samples, donors: groups.sequencing.donors.size },
                    histology: { samples: groups.histology.samples, donors: groups.histology.donors.size },
                });
            },
            'POST',
            () => {
                if (!ignore) setSampleStats(emptyStats);
            },
            JSON.stringify({
                search_query_params: {
                    type: ['TissueSample'],
                    'status!': ['deleted'],
                    'sample_sources.tissue_type': [tissueMatrixFilterValue],
                    ...SAMPLE_DONOR_POPULATION_PARAMS,
                },
                column_agg_fields: ['preservation_type'],
                row_agg_fields: ['sample_sources.donor.external_id'],
                max_bucket_count: TISSUE_TYPE_MAX_BUCKET_COUNT,
            }),
            {},
            null
        );
        return () => {
            ignore = true;
        };
    }, [tissueMatrixFilterValue, session]);

    // The cards' remaining counts, each a plain search total. Variant Call
    // Sets are this tissue's SNV/Indel files, under the same filters as the
    // Browse Sequencing Files link. null while loading.
    const [recordCounts, setRecordCounts] = useState(null);
    useEffect(() => {
        if (!tissueMatrixFilterValue) {
            setRecordCounts({ variantCallSets: 0, pathologyReports: 0, histologyImages: 0 });
            return;
        }
        let ignore = false;
        setRecordCounts(null);
        const tissueParam = encodeURIComponent(tissueMatrixFilterValue);
        Promise.all([
            fetchSearchTotal(
                `/search/?type=File&${BROWSE_STATUS_FILTERS}&dataset%21=No+value` +
                    `&sample_summary.tissues=${tissueParam}&data_type=SNV&data_type=Indel&limit=0`
            ),
            fetchSearchTotal(
                `/search/?type=PathologyReport&tissue_samples.sample_sources.tissue_type=${tissueParam}` +
                    '&tissue_samples.sample_sources.donor.study=Production' +
                    '&tissue_samples.sample_sources.donor.tags=has_released_files&limit=0'
            ),
            fetchSearchTotal(`/search/?${histologyImagesSearchQuery}&limit=0`),
        ]).then(([variantCallSets, pathologyReports, histologyImages]) => {
            if (!ignore) setRecordCounts({ variantCallSets, pathologyReports, histologyImages });
        });
        return () => {
            ignore = true;
        };
        // histologyImagesSearchQuery is derived from tissueMatrixFilterValue alone.
    }, [tissueMatrixFilterValue, session]);

    // Every pathology report for this tissue_type (same donor population as
    // the page) -- BrainPathologyReports for a brain region, else
    // NonBrainPathologyReports -- for the Pathology Reports table's expanded
    // rows and per-donor findings/images. null while loading.
    const [pathologyReports, setPathologyReports] = useState(null);
    useEffect(() => {
        if (!tissueMatrixFilterValue) {
            setPathologyReports([]);
            return;
        }
        let ignore = false;
        setPathologyReports(null);
        const onResponse = (resp) => {
            if (!ignore) setPathologyReports(resp?.['@graph'] || []);
        };
        ajax.load(
            `/search/?type=${isBrainTissue ? 'BrainPathologyReport' : 'NonBrainPathologyReport'}` +
                `&tissue_samples.sample_sources.tissue_type=${encodeURIComponent(tissueMatrixFilterValue)}` +
                '&tissue_samples.sample_sources.donor.study=Production' +
                '&tissue_samples.sample_sources.donor.tags=has_released_files' +
                `&limit=all&${isBrainTissue ? BRAIN_PATHOLOGY_REPORT_SEARCH_FIELDS : PATHOLOGY_REPORT_SEARCH_FIELDS}`,
            onResponse,
            'GET',
            // An empty search answers 404 with an empty @graph.
            onResponse
        );
        return () => {
            ignore = true;
        };
    }, [tissueMatrixFilterValue, isBrainTissue, session]);

    // Each report's histology image @ids, for the aliquot popovers' Histology
    // column -- empty (every row "n/a") until the reports load.
    const histologyImageIdsByReportId = useMemo(() => {
        const byReportId = {};
        (pathologyReports || []).forEach((report) => {
            byReportId[report['@id']] = (report.histology_images || []).map(getLinkId).filter(Boolean);
        });
        return byReportId;
    }, [pathologyReports]);

    // Donor rows open in the Pathology Reports table -- also opened from the
    // aliquot diagram's report links (handlePathologyReportClick), which
    // additionally highlight and scroll to that report's row.
    const [expandedDonorUuids, setExpandedDonorUuids] = useState(() => new Set());
    const [highlightedReportId, setHighlightedReportId] = useState(null);
    const handleToggleDonor = (donorUuid) => {
        setExpandedDonorUuids((prev) => {
            const next = new Set(prev);
            if (next.has(donorUuid)) next.delete(donorUuid);
            else next.add(donorUuid);
            return next;
        });
    };
    // Returns false (so the link opens the report page as before) when the
    // report isn't in this page's table, e.g. a brain tissue or still loading.
    const handlePathologyReportClick = (reportId) => {
        const report = (pathologyReports || []).find((r) => r['@id'] === reportId);
        const donorUuids = report ? getReportDonorUuids(report) : [];
        if (donorUuids.length === 0) return false;
        setExpandedDonorUuids((prev) => new Set([...prev, ...donorUuids]));
        setHighlightedReportId(reportId);
        return true;
    };

    // See TissueView.js's identical effect for the full rationale.
    useEffect(() => {
        const tissueUuids = allTissuesForType.map((t) => t?.uuid).filter(Boolean);
        if (tissueUuids.length === 0) {
            setDonorsWithAliquotData(new Set());
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
    }, [allTissuesForType, session]);

    return (
        <div className="tissue-view">
            <TissueTypeViewTitle representativeTissue={representativeTissue} />
            <div className="view-content">
                <div className="tissue-summary-header">
                    <div
                        className="tissue-summary-header-icon"
                        style={
                            tissueColorHex
                                ? {
                                    backgroundColor: hexToRgba(tissueColorHex, 0.12),
                                    borderColor: hexToRgba(tissueColorHex, 0.85),
                                    color: tissueColorHex,
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
                        <div className="tissue-summary-header-title-row">
                            <h1 className="header-text fw-semibold">
                                Tissue Overview:{' '}
                                {tissueName !== '-' ? tissueName : display_title}
                            </h1>
                            <div className="tissue-summary-header-actions">
                                {filesBrowseHref ? (
                                    <a className="btn btn-sm btn-outline-secondary" href={filesBrowseHref}>
                                        <i className="icon icon-file fas" />
                                        Browse Sequencing Files
                                    </a>
                                ) : null}
                                {histologyImagesBrowseHref ? (
                                    <a className="btn btn-sm btn-outline-secondary" href={histologyImagesBrowseHref}>
                                        <i className="icon icon-image fas" />
                                        Browse Histology Images
                                    </a>
                                ) : null}
                            </div>
                        </div>
                        <div className="tissue-summary-header-meta">
                            <div className="tissue-summary-header-notes">
                                <span className="notes-label">Tissue Subtypes</span>
                                <span className="notes-value">
                                    {tissueSubtypes.length > 0
                                        ? tissueSubtypes.join(', ')
                                        : `No ${tissueName} Subtypes`}
                                </span>
                            </div>
                            {tissueColorHex ? (
                                <div className="tissue-summary-header-notes tissue-hex-code">
                                    <span className="notes-label">
                                        SMaHT Hex Code{' '}
                                        <a
                                            href="/static/data/color-schemes/smaht_tissue_colors.json"
                                            target="_blank"
                                            rel="noopener noreferrer">
                                            JSON
                                        </a>
                                    </span>
                                    <span
                                        className="tissue-hex-swatch"
                                        style={{ backgroundColor: tissueColorHex }}
                                    />
                                    <span className="tissue-hex-value">{tissueColorHex.toUpperCase()}</span>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>

                <div className="tissue-summary-row tissue-overview-layout">
                    <div className="tissue-summary-column">
                        <div className="tissue-summary-card">
                            <div className="header">
                                <span className="header-text">Tissue Summary</span>
                            </div>
                            <div className="body">
                                <div className="tissue-summary-sections">
                                    <div className="tissue-summary-section">
                                        <div className="tissue-summary-subheader">Overview</div>
                                        <div className="tissue-summary-fields tissue-summary-list">
                                            <SummaryDatum title="Target Tissue">
                                                {tissueName !== '-' ? (
                                                    targetTissueHref ? (
                                                        <a href={targetTissueHref}>{tissueName}</a>
                                                    ) : (
                                                        tissueName
                                                    )
                                                ) : null}
                                            </SummaryDatum>
                                            <SummaryDatum title="TPC Code">
                                                {tpcCodeEntries.length > 0
                                                    ? tpcCodeEntries.map((entry) => (
                                                        <div key={entry.code}>
                                                            <strong>{entry.code}</strong> -{' '}
                                                            {getTpcCodeDescription(entry)}
                                                        </div>
                                                    ))
                                                    : null}
                                            </SummaryDatum>
                                            <SummaryDatum title="SMaHT Acronym">{smahtAcronym}</SummaryDatum>
                                            <SummaryDatum title="Germ Layer">{category}</SummaryDatum>
                                        </div>
                                    </div>
                                    <div className="tissue-summary-section">
                                        <div className="tissue-summary-subheader">
                                            Tissue Ontology &amp; Collection Details
                                        </div>
                                        <div className="tissue-summary-fields tissue-summary-list">
                                            <SummaryDatum title="Ontology ID">
                                                {uberon_id?.identifier ? (
                                                    uberonHref ? (
                                                        <a href={uberonHref}>{uberon_id.identifier}</a>
                                                    ) : (
                                                        uberon_id.identifier
                                                    )
                                                ) : null}
                                            </SummaryDatum>
                                            <SummaryDatum title="Ontology Term">
                                                {uberon_id?.display_title}
                                            </SummaryDatum>
                                            <SummaryDatum title="Tissue Collection Details">
                                                {collectionDetails.length > 0
                                                    ? collectionDetails.map((location) => (
                                                        <div key={location}>{location}</div>
                                                    ))
                                                    : null}
                                            </SummaryDatum>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="tissue-data-cards">
                            <TissueDataCard
                                title="Sequencing Data"
                                variant="sequencing"
                                iconSrc={tissueIconSrc}
                                codeLabels={getTpcCodeLabels(false)}
                                sampleCount={sampleStats ? sampleStats.sequencing.samples : null}
                                stats={[
                                    { label: 'Donors', value: sampleStats ? sampleStats.sequencing.donors : null },
                                    { label: 'Sequencing Files', value: isLoading ? null : fileCount },
                                    {
                                        label: 'Variant Call Sets',
                                        value: recordCounts ? recordCounts.variantCallSets : null,
                                    },
                                ]}
                            />
                            <TissueDataCard
                                title="Histology & Pathology Data"
                                variant="histology"
                                iconSrc={tissueIconSrc}
                                codeLabels={getTpcCodeLabels(true)}
                                sampleCount={sampleStats ? sampleStats.histology.samples : null}
                                stats={[
                                    { label: 'Donors', value: sampleStats ? sampleStats.histology.donors : null },
                                    {
                                        label: 'Pathology Reports',
                                        value: recordCounts ? recordCounts.pathologyReports : null,
                                    },
                                    {
                                        label: 'Histology Images',
                                        value: recordCounts ? recordCounts.histologyImages : null,
                                    },
                                ]}
                            />
                        </div>
                    </div>

                    <div className="tissue-aliquot-card">
                        <div className="header tissue-aliquot-header">
                            <span className="aliquot-title">
                                Tissue Aliquot Visualization
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
                                <div
                                    className={
                                        'tissue-aliquot-donor-select' +
                                        (!selectedDonorUuid ? ' is-unselected' : '')
                                    }>
                                    <label htmlFor="tissue-aliquot-donor-select">
                                        Donor:
                                    </label>
                                    <select
                                        id="tissue-aliquot-donor-select"
                                        className="form-select form-select-sm"
                                        value={selectedDonorUuid || ''}
                                        onChange={(e) => setSelectedDonorUuid(e.target.value || null)}>
                                        <option value="">Select a donor…</option>
                                        {donors.map(({ donor: d }) => {
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
                        <div className="body">
                            <div
                                className={
                                    'tissue-aliquot-body' +
                                    (samplesUpdating && !aliquotSamplesLoading ? ' is-updating' : '')
                                }>
                                {showNoDonorData ? (
                                    <div className="tissue-aliquot-prompt">
                                        <p>No donor data available for this tissue type.</p>
                                    </div>
                                ) : aliquotSamplesLoading ? (
                                    <div className="tissue-aliquot-loading">
                                        <i className="icon icon-circle-notch icon-spin fas" />
                                    </div>
                                ) : showNoSampleData ? (
                                    <div className="tissue-aliquot-prompt">
                                        <p>No aliquot data available for the selected donor.</p>
                                    </div>
                                ) : (
                                    // Before a donor is picked (showDonorPrompt), `displaySlices`/
                                    // `nonSolidAliquots` are still the illustrative demo set (no
                                    // donor's real TissueSamples fetched yet) -- rendered here at
                                    // near-zero opacity and non-interactive (see .is-placeholder)
                                    // just to hint at the panel's eventual layout, with the actual
                                    // prompt overlaid on top rather than replacing it outright.
                                    <div
                                        className={
                                            'tissue-aliquot-diagram' +
                                            (showDonorPrompt ? ' is-placeholder' : '')
                                        }
                                        aria-hidden={showDonorPrompt || undefined}>
                                        {nonSolidSpecimenType ? (
                                            <NonSolidAliquotVisualization
                                                aliquots={nonSolidAliquots}
                                                specimenType={nonSolidSpecimenType}
                                                idPrefix={aliquotIdPrefix}
                                                assayPlatformsBySampleName={assayPlatformsBySampleName}
                                                donorLabel={selectedDonorDisplayTitle}
                                                tissueLabel={getTissueNameFromFacetTerm(targetTissueValue)}
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
                                                assayPlatformsBySampleName={assayPlatformsBySampleName}
                                                donorLabel={selectedDonorDisplayTitle}
                                                tissueLabel={getTissueNameFromFacetTerm(targetTissueValue)}
                                                // eslint-disable-next-line react/jsx-no-bind
                                                onPathologyReportClick={handlePathologyReportClick}
                                                tissueCodeLabels={tissueCodeLabels}
                                                histologyImageIdsByReportId={histologyImageIdsByReportId}
                                            />
                                        )}
                                    </div>
                                )}
                                {showDonorPrompt ? (
                                    <div className="tissue-aliquot-prompt tissue-aliquot-prompt-overlay">
                                        <i className="icon icon-arrow-up fas" />
                                        <p>Select a donor above to view its aliquot layout.</p>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>

                <div
                    className="tissue-donor-table-card tissue-heatmap-card pathology-reports-card"
                    style={donorTablePaletteStyle}>
                    {isAdminUser ? (
                        <div className="tissue-heatmap-toolbar">
                            <HeatmapColorPicker
                                baseHex={paletteBaseHex}
                                // eslint-disable-next-line react/jsx-no-bind
                                onPick={handlePickPaletteColor}
                                // eslint-disable-next-line react/jsx-no-bind
                                onReset={handleResetPaletteColor}
                            />
                        </div>
                    ) : null}
                    {/*
                        A plain static stand-in for DotRouter/DotRouterTab's
                        own rendered markup (nav.dot-tab-nav > .dot-tab-nav-list
                        > button.active > .btn-title, then .tab-router-contents)
                        -- there's only ever 1 real tab here, and the real
                        DotRouter (BrowseTissueHeatmapTable.js's own 3-tab
                        tables, Ischemic Time/Autolysis Score/Target Tissue %,
                        on the separate Browse-by-Tissue overview page)
                        actually throws with just 1 child: DotRouter.getDefaultTab
                        reads `children.length`, but React only wraps `props.children`
                        in an array once there's more than 1 of them -- with
                        exactly 1, `children` is that single element, `.length`
                        comes back `undefined`, the loop never finds a default
                        tab, and render() crashes destructuring `null.props`.
                        Reusing just the CSS classes (`tissue-heatmap-tabs`, a
                        real component's own click/URL routing has nothing to
                        switch to here anyway) gives this table the exact same
                        tab-strip card look for visual consistency without
                        that crash.
                    */}
                    <div className="tab-router">
                        <nav className="dot-tab-nav tissue-heatmap-tabs">
                            <div className="dot-tab-nav-list">
                                <button type="button" className="active">
                                    <div className="btn-title">Pathology Reports</div>
                                </button>
                            </div>
                        </nav>
                        <div className="tab-router-contents">
                            <div className="body">
                                {isBrainTissue ? (
                                    <BrainPathologyReportsTable
                                        donors={donors}
                                        reports={pathologyReports}
                                        tissueTypeValue={tissueMatrixFilterValue}
                                        tissueIconSrc={tissueIconSrc}
                                        userDownloadAccess={userDownloadAccess}
                                        enableConditionalColor={enableConditionalColor}
                                        expandedDonorUuids={expandedDonorUuids}
                                        // eslint-disable-next-line react/jsx-no-bind
                                        onToggleDonor={handleToggleDonor}
                                        highlightedReportId={highlightedReportId}
                                    />
                                ) : (
                                    <PathologyReportsTable
                                        donors={donors}
                                        reports={pathologyReports}
                                        tissueName={tissueName}
                                        tissueTypeValue={tissueMatrixFilterValue}
                                        tissueIconSrc={tissueIconSrc}
                                        userDownloadAccess={userDownloadAccess}
                                        enableConditionalColor={enableConditionalColor}
                                        expandedDonorUuids={expandedDonorUuids}
                                        // eslint-disable-next-line react/jsx-no-bind
                                        onToggleDonor={handleToggleDonor}
                                        highlightedReportId={highlightedReportId}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
