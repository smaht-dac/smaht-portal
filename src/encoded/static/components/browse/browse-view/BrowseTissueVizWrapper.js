'use strict';

import React, { useState, useEffect, useMemo } from 'react';
import url from 'url';
import _ from 'underscore';
import { Popover } from 'react-bootstrap';
import ReactTooltip from 'react-tooltip';
import { IconToggle } from '@hms-dbmi-bgm/shared-portal-components/es/components/forms/components/Toggle';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { normalizeQueryValuesForStringify } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/search-filters';
import { BrowseSummaryStatsViewer } from './BrowseSummaryStatController';
import { ChartDataController } from '../../viz/chart-data-controller';
import DonorCohortViewChart from '../components/DonorCohortViewChart';
import { formUrlEncode } from './BrowseTissueHeatmapTable';
import { FacetCharts } from '../components/FacetCharts';
import { BROWSE_STATUS_FILTERS } from '../BrowseView';
import AliquotVisualization, {
    SLICE_TYPE_STYLES,
} from '../../item-pages/components/tissue-overview/AliquotVisualization';
import {
    getTissueIconSrc,
    getTissueTypeUrlCode,
    getTissueColorHex,
    hexToRgba,
} from '../../item-pages/components/tissue-overview/helpers';
import { getTissueInternalCodeFromFacetTerm } from '../../util/data';
import smahtTissueColors from '../../../data/color-schemes/smaht_tissue_colors.json';

// Fixed display order for the 5 raw categories item_utils/tissue.py's
// get_category() returns -- used by the Cohort View charts, which chart each
// category on its own.
const TISSUE_CATEGORY_ORDER = ['Ectoderm', 'Mesoderm', 'Endoderm', 'Germ Cells', 'Clinically Accessible'];

// Same population filter Browse by Donor/Browse by File use, mirrored from
// TissueTypeView.js's identical constant -- keeps the GCC chart's file-count
// fetch consistent with the rest of the page's population instead of
// counting every File regardless of release status.
const BROWSE_STATUS_VALUES = new URLSearchParams(BROWSE_STATUS_FILTERS).getAll('status');

// What the Cohort View's facet chart starts out aggregating: files per tissue,
// split by sample type (preservation type).
const FACET_CHART_INITIAL_FIELDS = ['sample_summary.tissues', 'sample_summary.preservation_types'];

// pathology_summary.autolysis_score is an integer 0-3 (see
// item-pages/components/tissue-overview/helpers.js's getAutolysisScoreCellClass
// for the same 0=None/1=mild/2=moderate/3=severe scale).
const AUTOLYSIS_SCORE_GROUPS = [
    { value: 0, label: 'None' },
    { value: 1, label: 'Mild' },
    { value: 2, label: 'Moderate' },
    { value: 3, label: 'Severe' },
];

export const renderTissueCategoryPopover = (customId) => (
    <Popover id={customId || 'chart-info-popover-tissue-category'} className="w-auto description-definitions-popover">
        <Popover.Body className="p-0">
            <table className="table">
                <thead>
                    <tr><th className="text-left">Tissue Category Distribution</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td className="text-left">
                            Shows the number of donors with released files, grouped by germ-layer category.
                        </td>
                    </tr>
                </tbody>
            </table>
        </Popover.Body>
    </Popover>
);

// Same per-value table layout as ProtectedDonorViewDataCards.js's Hardy
// Scale popover -- the x-axis now shows the raw score (matching that
// chart's own numeric axis convention), so the None/Mild/Moderate/Severe
// labels live here instead of doubling as tick text.
export const renderAutolysisScorePopover = (customId) => (
    <Popover id={customId || 'chart-info-popover-autolysis-score'} className="w-auto description-definitions-popover">
        <Popover.Body className="p-0">
            <table className="table">
                <thead>
                    <tr><th className="text-left px-4" colSpan={2}>Autolysis Score Distribution (by Tissue)</th></tr>
                </thead>
                <tbody>
                    <tr className="w-100">
                        <td className="fw-light text-left px-4 py-3" colSpan={2}>
                            Shows the number of tissue specimens by autolysis score. Each specimen
                            is counted once, using the highest score across its pathology reports.
                            <br />
                            <i>Score meanings:</i>
                        </td>
                    </tr>
                    {AUTOLYSIS_SCORE_GROUPS.map(({ value, label }) => (
                        <tr key={value}>
                            <td className="fs-5 align-middle text-center index-cell">{value}</td>
                            <td className="text-left">{label}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </Popover.Body>
    </Popover>
);

export const renderSubmissionCenterPopover = (customId) => (
    <Popover id={customId || 'chart-info-popover-submission-center'} className="w-auto description-definitions-popover">
        <Popover.Body className="p-0">
            <table className="table">
                <thead>
                    <tr><th className="text-left">GCC Distribution (by Tissue Sample)</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td className="text-left">
                            Shows the number of tissue sample records processed by each Genome
                            Characterization Center (GCC). Other center types (e.g. Tissue
                            Procurement Centers) are not shown.
                        </td>
                    </tr>
                </tbody>
            </table>
        </Popover.Body>
    </Popover>
);

// smaht_tissue_colors.json's full_name uses a bare hyphen for the handful of
// tissues with a sub-region (e.g. "Brain-Cerebellum", "Colon-Ascending") but
// already uses ", " for the L/R-suffixed ones (e.g. "Testis, L") -- only
// rewrite the former so both read the same "Brain, Cerebellum" way.
const formatTissueFullName = (fullName) =>
    fullName.includes(',') ? fullName : fullName.replace('-', ', ');

// TPC codes run 3A, 3B, ... 3Y, then 3AA, 3AC, ... -- shorter codes first,
// since a plain alphabetical sort would put "3AA" ahead of "3B".
const compareTpcCodes = (a, b) => a.length - b.length || a.localeCompare(b);

// Index into this list is BrowseTissue.js's tissueSortModeIndex (its header
// toggle) -- how both Tissue View modes order their tiles.
export const TISSUE_SORT_MODES = [
    { key: 'tpc-code', compare: (a, b) => compareTpcCodes(a.tpcCode, b.tpcCode) },
    { key: 'internal-code', compare: (a, b) => a.internalCode.localeCompare(b.internalCode) },
];

// Every tissue type SMaHT tracks, regardless of whether
// any donor currently has data for it -- both Tissue View modes (Basic
// bubbles, Advanced cards) always show the complete set, so a tissue with 0
// donors still renders as a disabled tile instead of being silently absent.
// Built from the static smaht_tissue_colors.json (which getTissueIconSrc/
// getTissueColorHex already rely on) rather than a new list to keep in sync.
const ALL_TISSUE_TYPES = Object.entries(smahtTissueColors)
    .map(([tpcCode, entry]) => {
        const fullName = formatTissueFullName(entry.full_name);
        return {
            tpcCode,
            internalCode: entry.smaht_code,
            fullName,
            // Same "<TPC code> - <name>" shape real tissue_type facet values
            // use, so getTissueIconSrc/getTissueColorHex/getTissueTypeUrlCode
            // (which all parse that shape via getTissueInternalCodeFromFacetTerm)
            // resolve this tissue's icon/color/URL code the same way they do
            // for a real facet term.
            facetTermValue: `${tpcCode} - ${fullName}`,
        };
    })
    .sort(TISSUE_SORT_MODES[0].compare);

// Re-keys a `/bar_plot_aggregations/` response's `resp.terms` (raw
// tissue_type term string -> {donors, files, doc_count}, same shape
// buildTissueCategoryChartData reads `.donors` off of) by each term's stable
// 4-letter internal code, so a count can be looked up against
// ALL_TISSUE_TYPES' own internalCode regardless of which exact tissue_type
// string variant a given term happens to use.
export const buildDonorCountByInternalCode = (terms = {}) => {
    const counts = {};
    Object.entries(terms).forEach(([term, bucket]) => {
        const internalCode = getTissueInternalCodeFromFacetTerm(term);
        if (internalCode) counts[internalCode] = bucket?.donors || 0;
    });
    return counts;
};

// Donors-with-released-files count per tissue type, shared by both Tissue
// View modes below (Basic and Advanced stay mounted together, see
// BrowseTissueVizWrapper) so they need one fetch, not one each.
const useTissueDonorCounts = (fileFilters, session) => {
    const [loading, setLoading] = useState(true);
    const [donorCountByInternalCode, setDonorCountByInternalCode] = useState({});

    useEffect(() => {
        setLoading(true);

        const requestBody = {
            search_query_params: fileFilters,
            fields_to_aggregate_for: ['sample_summary.tissues'],
        };

        ajax.load(
            '/bar_plot_aggregations/',
            (resp) => {
                setDonorCountByInternalCode(buildDonorCountByInternalCode(resp?.terms));
                setLoading(false);
            },
            'POST',
            () => setLoading(false),
            JSON.stringify(requestBody),
            {},
            null
        );
    }, [fileFilters, session]);

    return { loading, donorCountByInternalCode };
};

// Basic Tissue View: every tissue type as a compact, icon-only bubble in one
// 8-column grid (3 rows for the 24 tracked tissues), in `tissueTypes` order.
const TissueBasicPanel = ({ loading, donorCountByInternalCode, tissueTypes }) => {
    // data-tip is react-tooltip's static-attribute API (see app.js's global
    // <ReactTooltip/> mount) -- it only picks up nodes present at its last
    // build, so newly rendered bubbles need an explicit rebuild once loaded.
    useEffect(() => {
        if (!loading) ReactTooltip.rebuild();
    }, [loading, donorCountByInternalCode]);

    return (
        <div className="tissue-basic-panel">
            {tissueTypes.map((tissueType) => {
                // Same per-tissue anatomy icon used on the Tissue Overview
                // header and Browse-by-Tissue table headers
                // (getTissueIconSrc). The tooltip leads with the TPC code,
                // matching Advanced view's own "<TPC code> - <4-letter code>"
                // card header, followed by the tissue's full name.
                const bubbleIconSrc = getTissueIconSrc(tissueType.facetTermValue);
                const bubbleLabel = `${tissueType.tpcCode} - ${tissueType.internalCode} - ${tissueType.fullName}`;
                // Official per-tissue color (smaht_tissue_colors.json),
                // same one used to fill the anatomy icon here as the
                // rest of the app uses for this tissue elsewhere --
                // falls back to the panel's neutral default color (set
                // in SCSS) for the handful of tissue_type values that
                // scheme doesn't cover.
                const bubbleColorHex = getTissueColorHex(tissueType.facetTermValue);
                // Color lives only on the ring -- tinting the
                // bubble background/icon fill too reads as
                // too much color competing with the rest of
                // the page. The icon keeps the panel's plain
                // neutral fill; only the border carries the
                // tissue's own color, a bit thicker than the
                // uncovered fallback ring so it still reads
                // clearly.
                const bubbleStyle = bubbleColorHex
                    ? {
                        borderColor: hexToRgba(bubbleColorHex, 0.85),
                        borderStyle: 'solid',
                        borderWidth: '2.5px',
                    }
                    : undefined;
                const bubbleContent = bubbleIconSrc ? (
                    <i
                        className="tissue-basic-bubble-icon"
                        style={{
                            WebkitMaskImage: `url(${bubbleIconSrc})`,
                            maskImage: `url(${bubbleIconSrc})`,
                        }}
                    />
                ) : null;
                // Same disabled treatment as Advanced view's cards: 0 donors
                // (only once loaded, so nothing flashes disabled while
                // counts are still coming in) has nothing to link to.
                const isDisabled = !loading && !donorCountByInternalCode[tissueType.internalCode];

                return isDisabled ? (
                    <div
                        className="tissue-basic-bubble is-disabled"
                        key={tissueType.internalCode}
                        data-tip={bubbleLabel}
                        aria-label={bubbleLabel}
                        aria-disabled="true"
                        style={bubbleStyle}>
                        {bubbleContent}
                    </div>
                ) : (
                    <a
                        className="tissue-basic-bubble"
                        key={tissueType.internalCode}
                        href={`/tissue-overview/?tissue_type=${formUrlEncode(getTissueTypeUrlCode(tissueType.facetTermValue))}`}
                        data-tip={bubbleLabel}
                        aria-label={bubbleLabel}
                        style={bubbleStyle}>
                        {bubbleContent}
                    </a>
                );
            })}
        </div>
    );
};

// Advanced Tissue View: every tissue type as a card (icon + TPC/internal
// code + full name + donor count) in one 8-column grid (3 rows for the 24
// tracked tissues), in `tissueTypes` order. Cards for tissues with 0 donors are
// disabled, not hidden.
const TissueAdvancedPanel = ({ loading, donorCountByInternalCode, tissueTypes }) => (
    <div className="tissue-advanced-panel">
        {tissueTypes.map((tissueType) => {
            const donorCount = donorCountByInternalCode[tissueType.internalCode] || 0;
            // Disabled while a count hasn't loaded yet would
            // incorrectly flash every card as disabled, so
            // only 0 donors *after* loading finishes counts.
            const isDisabled = !loading && donorCount === 0;
            const iconSrc = getTissueIconSrc(tissueType.facetTermValue);
            // Same official per-tissue color
            // (smaht_tissue_colors.json) the compact
            // bubble panel/tissue-overview
            // header use elsewhere -- exposed as a CSS
            // custom property so _search.scss can tint
            // this card's header/border/donor-count
            // footer with it (falling back to the
            // plain neutral colors below for the
            // handful of tissue types that scheme
            // doesn't cover).
            const tissueColorHex = getTissueColorHex(tissueType.facetTermValue);
            const cardStyle = tissueColorHex
                ? {
                    // The palette hex as-is, for the
                    // header text.
                    '--tissue-advanced-card-color': tissueColorHex,
                    // The card's outline -- same ring
                    // color/opacity Basic view's bubbles
                    // use, so both views read alike.
                    '--tissue-advanced-card-border': hexToRgba(tissueColorHex, 0.85),
                    // A light background tint for the
                    // donor-count footer -- computed
                    // here (not via CSS color-mix(),
                    // for wider browser support)
                    // from the same hex at reduced
                    // opacity, not a fixed shade.
                    '--tissue-advanced-card-bg': hexToRgba(tissueColorHex, 0.14),
                }
                : undefined;

            const cardContent = (
                <React.Fragment>
                    <div className="tissue-advanced-card-header">
                        {tissueType.tpcCode} - {tissueType.internalCode}
                    </div>
                    {iconSrc ? (
                        <i
                            className="tissue-advanced-card-icon"
                            style={{
                                WebkitMaskImage: `url(${iconSrc})`,
                                maskImage: `url(${iconSrc})`,
                            }}
                        />
                    ) : null}
                    <div className="tissue-advanced-card-name">{tissueType.fullName}</div>
                    <div className="tissue-advanced-card-donors">
                        {loading
                            ? '–'
                            : `${donorCount.toLocaleString()} Donor${donorCount === 1 ? '' : 's'}`}
                    </div>
                </React.Fragment>
            );

            // A disabled card (0 donors) has nothing to link
            // to -- render as a plain, non-interactive div
            // instead of an <a> with a dead/misleading href.
            return isDisabled ? (
                <div
                    className="tissue-advanced-card is-disabled"
                    key={tissueType.internalCode}
                    style={cardStyle}
                    aria-disabled="true">
                    {cardContent}
                </div>
            ) : (
                <a
                    className="tissue-advanced-card"
                    key={tissueType.internalCode}
                    style={cardStyle}
                    href={`/tissue-overview/?tissue_type=${formUrlEncode(getTissueTypeUrlCode(tissueType.facetTermValue))}`}>
                    {cardContent}
                </a>
            );
        })}
    </div>
);

// Builds the fixed-order, 5-category chart data array the three Cohort View
// charts below share -- same shape DonorCohortViewChart already expects from
// BrowseDonorVizWrapper.js's Age Groups/Hardy Scale charts (group/value1/
// value1FileCount/total), just with a single ('single' chartType) series.
const buildTissueCategoryChartData = (termsByCategory = {}, totalDonors = 0) =>
    TISSUE_CATEGORY_ORDER.map((category) => {
        const bucket = termsByCategory[category];
        return {
            group: category,
            value1: bucket?.donors || 0,
            value1FileCount: bucket?.files || 0,
            totalFileCount: bucket?.files || 0,
            total: totalDonors,
            field: 'sample_summary.category',
            from: category,
            to: category,
        };
    });

const buildAutolysisScoreChartData = (tissueResults = []) => {
    const countsByScore = {};
    tissueResults.forEach((t) => {
        const score = t?.pathology_summary?.autolysis_score;
        if (score === null || score === undefined) return;
        countsByScore[score] = (countsByScore[score] || 0) + 1;
    });
    // `group` is the numeric score itself (matching BrowseDonorVizWrapper.js's
    // Hardy Scale chart, whose x-axis is also its own raw scale value) --
    // the None/Mild/Moderate/Severe labels move to the info popover instead
    // of doubling as axis tick text.
    return AUTOLYSIS_SCORE_GROUPS.map(({ value }) => ({
        group: String(value),
        value1: countsByScore[value] || 0,
        total: tissueResults.length,
        field: 'pathology_summary.autolysis_score',
        from: value,
        to: value,
    }));
};

// Tissue.submission_centers is always the procuring TPC (this program routes
// physical tissue procurement through a single TPC, so that dimension has
// no real variation to chart). The GCC diversity
// is a level down, on the individual TissueSample records a TPC's tissue
// gets aliquoted/processed into (see TissueTypeView.js's own
// `sample.submission_centers?.[0]?.display_title` on TissueSample, which
// already shows real TPC/GCC mixes like "NDRI TPC"/"UWSC GCC"/"BROAD GCC").
// Built from a `bar_plot_aggregations` bucket count (unlike Autolysis Score,
// which needs the full Tissue records for pathology_summary) since
// submission_centers.display_title is embedded/facetable on TissueSample --
// no need to pull every record client-side just to count them.
//
// Only GCC-suffixed centers are kept -- every submission_centers value ends
// in its role suffix (GCC/TPC/TTD/DAC/OC; see helpers.js's
// getGccFilesBrowseHref, which uses this same `endsWith('GCC')` check), and
// this chart exists specifically to compare GCCs. TPC, TTD, DAC, etc. are a
// different kind of center entirely, not just noise to threshold away.
// `fileCountsByCenter` (from a separate type=File aggregation on
// sequencing_center.display_title -- see TissueCohortCharts) feeds the
// tooltip's "Files" line/link; the bar height itself stays the TissueSample
// count from `termsByCenter`, matching what the chart's own title/axis say.
const buildSubmissionCenterChartData = (termsByCenter = {}, fileCountsByCenter = {}) => {
    const gccEntries = Object.entries(termsByCenter).filter(([center]) =>
        center?.trim().endsWith('GCC')
    );
    const total = gccEntries.reduce((sum, [, bucket]) => sum + (bucket?.doc_count || 0), 0);
    return gccEntries
        .map(([center, bucket]) => ({
            group: center,
            value1: bucket?.doc_count || 0,
            value1FileCount: fileCountsByCenter[center] || 0,
            totalFileCount: fileCountsByCenter[center] || 0,
            total,
            field: 'sequencing_center.display_title',
            from: center,
            to: center,
        }))
        .sort((a, b) => b.value1 - a.value1 || a.group.localeCompare(b.group, undefined, { numeric: true }));
};

// Illustrative Fixed/Frozen/Fixed/Frozen/Frozen/Fixed slice pattern for the
// representative collection diagram below -- not sampleAliquotSlicesFallback
// (helpers.js's own placeholder set, used on TissueView.js/TissueTypeView.js
// before a donor is picked): that one has 3 Fixed + 6 Frozen slices, a
// different pattern meant to preview a real single-tissue layout, whereas
// this is its own smaller, purely representative block for the population
// summary shown here.
const TISSUE_COLLECTION_SAMPLE_SLICES = [
    { id: 'fixed-1', type: 'pink', widthCm: 0.5 },
    { id: 'frozen-1', type: 'yellow', widthCm: 1 },
    { id: 'frozen-2', type: 'yellow', widthCm: 1 },
    { id: 'fixed-2', type: 'pink', widthCm: 0.5 },
    { id: 'frozen-3', type: 'yellow', widthCm: 1 },
    { id: 'frozen-4', type: 'yellow', widthCm: 1 },
    { id: 'fixed-3', type: 'pink', widthCm: 0.5 },
];

// Non-interactive, illustrative stand-in for a real per-tissue aliquot
// diagram (AliquotVisualization.js's own solid-organ view on TissueView.js/
// TissueTypeView.js) -- this panel isn't scoped to one tissue, so there's no
// single real slice layout to draw. Renders a generic Fixed/Frozen demo
// block (TISSUE_COLLECTION_SAMPLE_SLICES), wrapped so it can't be clicked
// (no per-slice popover makes sense outside a real tissue's data).
// The Fixed/Frozen counts below it come from `tissueResults`, the same
// Tissue records TissueCohortCharts already fetches for the Autolysis Score
// chart, avoiding a second population query for the same donor set.
const TissueSampleCollectionViz = ({ tissueResults = [], loading }) => {
    const counts = useMemo(() => {
        let fixed = 0;
        let frozen = 0;
        tissueResults.forEach((t) => {
            if (!t?.preservation_type) return;
            // "Fixed" vs everything else ("Snap Frozen", "Fresh", ...) is
            // the same two-way distinction AliquotVisualization.js's own
            // slice coloring (and BrowseTissueHeatmapTable.js's
            // formatPreservationTypeLabel) uses.
            if (t.preservation_type === 'Fixed') fixed += 1;
            else frozen += 1;
        });
        return { fixed, frozen };
    }, [tissueResults]);

    return (
        <div className="donor-cohort-view-chart tissue-collection-viz-chart">
            <div className="chart-title-container">
                <h3>SMaHT Tissue Sample Collection</h3>
            </div>
            <div className="tissue-collection-viz-diagram" aria-hidden="true">
                <AliquotVisualization
                    slices={TISSUE_COLLECTION_SAMPLE_SLICES}
                    dimensions={{
                        heightCm: 1,
                        depthCm: 1.5,
                        heightLabel: '1 cm',
                        depthLabel: '1.5 cm',
                    }}
                    idPrefix="tissue-collection-overview"
                    showSliceLabels={false}
                    showLegend={false}
                />
            </div>
            <div className="tissue-collection-viz-summary">
                <div className="tissue-collection-viz-summary-item is-fixed">
                    <div className="tissue-collection-viz-summary-item-heading">
                        <span className="swatch" />
                        <span className="label">Fixed Tissues</span>
                    </div>
                    <div className="count">
                        {loading ? '–' : counts.fixed.toLocaleString()} Samples
                    </div>
                    {/* Static/decorative, not real links -- there's no
                        single destination for these at the population
                        level the way there is for one donor's own tissue
                        (per explicit choice over wiring up real hrefs). */}
                    <ul className="tissue-collection-viz-summary-item-bullets">
                        <li>Path Report</li>
                        <li>Histology Views</li>
                    </ul>
                </div>
                <div className="tissue-collection-viz-summary-item is-frozen">
                    <div className="tissue-collection-viz-summary-item-heading">
                        <span className="swatch" />
                        <span className="label">Frozen Tissues</span>
                    </div>
                    <div className="count">
                        {loading ? '–' : counts.frozen.toLocaleString()} Samples
                    </div>
                    <ul className="tissue-collection-viz-summary-item-bullets">
                        <li>Sequencing Data</li>
                        <li>Download CRAM</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

// Population-level Cohort View charts -- analogous to BrowseDonorVizWrapper.js's
// Age Groups/Hardy Scale/Donor Sequencing Progress charts, but built around
// tissue category, autolysis score, and submitting center instead of the
// donor-oriented demographic fields.
const TissueCohortCharts = ({ fileFilters, session }) => {
    const [tissueCategoryData, setTissueCategoryData] = useState();
    const [categoryLoading, setCategoryLoading] = useState(false);
    const [tissueResults, setTissueResults] = useState([]);
    const [tissueResultsLoading, setTissueResultsLoading] = useState(false);
    const [submissionCenterTerms, setSubmissionCenterTerms] = useState();
    const [submissionCenterLoading, setSubmissionCenterLoading] = useState(false);

    useEffect(() => {
        setCategoryLoading(true);
        ajax.load(
            '/bar_plot_aggregations/',
            (resp) => {
                setTissueCategoryData(
                    buildTissueCategoryChartData(resp?.terms, resp?.total?.donors || 0)
                );
                setCategoryLoading(false);
            },
            'POST',
            () => setCategoryLoading(false),
            JSON.stringify({
                search_query_params: fileFilters,
                fields_to_aggregate_for: ['sample_summary.category'],
            }),
            {},
            null
        );
    }, [fileFilters, session]);

    // Only Autolysis Score needs full Tissue records (pathology_summary
    // isn't a bucketable stored field, unlike sample_summary.category or
    // TissueSample's submission_centers below).
    useEffect(() => {
        setTissueResultsLoading(true);
        ajax.load(
            '/search/?type=Tissue&donor.study=Production&donor.tags=has_released_files&limit=all',
            (resp) => {
                setTissueResults(resp?.['@graph'] || []);
                setTissueResultsLoading(false);
            },
            'GET',
            () => {
                setTissueResults([]);
                setTissueResultsLoading(false);
            }
        );
    }, [session]);

    // TissueSample rather than Tissue -- Tissue.submission_centers is always
    // the procuring TPC (no variation to show, see buildSubmissionCenterChartData's
    // comment); the GCC diversity lives on TissueSample. Filtered to the same
    // released-donor Production population as the other two charts, via
    // sample_sources.donor.study/tags -- added to TissueSample's
    // embedded_list (types/tissue_sample.py) specifically so this filter
    // would be real rather than relying only on the GCC-suffix naming
    // convention (which doesn't itself guarantee "Production").
    useEffect(() => {
        setSubmissionCenterLoading(true);
        ajax.load(
            '/bar_plot_aggregations/',
            (resp) => {
                setSubmissionCenterTerms(resp?.terms);
                setSubmissionCenterLoading(false);
            },
            'POST',
            () => setSubmissionCenterLoading(false),
            JSON.stringify({
                search_query_params: {
                    type: ['TissueSample'],
                    'status!': ['deleted'],
                    'sample_sources.donor.study': ['Production'],
                    'sample_sources.donor.tags': ['has_released_files'],
                },
                fields_to_aggregate_for: ['submission_centers.display_title'],
            }),
            {},
            null
        );
    }, [session]);

    // File counts per GCC, for the GCC chart's tooltip "Files" line/link --
    // a separate File-scoped aggregation (not derivable from the
    // TissueSample-scoped fetch above, which never carries File counts,
    // see visualization.py's bar_plot_chart: `files` is 0 unless the search
    // itself is type=File). Filters by `fileFilters` (the same File-mapped,
    // released-donor population every other chart on this page uses).
    const [submissionCenterFileCounts, setSubmissionCenterFileCounts] = useState({});
    useEffect(() => {
        ajax.load(
            '/bar_plot_aggregations/',
            (resp) => {
                const countsByCenter = {};
                Object.entries(resp?.terms || {}).forEach(([center, bucket]) => {
                    countsByCenter[center] = bucket?.doc_count || 0;
                });
                setSubmissionCenterFileCounts(countsByCenter);
            },
            'POST',
            () => setSubmissionCenterFileCounts({}),
            JSON.stringify({
                search_query_params: {
                    ...fileFilters,
                    type: ['File'],
                    status: BROWSE_STATUS_VALUES,
                    'dataset!': ['No value'],
                },
                fields_to_aggregate_for: ['sequencing_center.display_title'],
            }),
            {},
            null
        );
    }, [fileFilters, session]);

    // Exact-match File browse link factory -- unlike BrowseDonorVizWrapper.js's
    // buildFilesHref (which builds `.from`/`.to` *range* filters for numeric
    // fields like age/hardy_scale), the GCC name and tissue category charts
    // below both group by a plain categorical value, so each just needs a
    // direct equality filter on the corresponding File field. Shared here
    // since both charts need the exact same shape, just a different field.
    const buildCategoricalFilesHref = (field) => (d) =>
        d?.group ? url.format({ pathname: '/browse/', query: { ...fileFilters, [field]: d.group } }) : null;
    // Same field/convention helpers.js's getGccFilesBrowseHref already uses
    // for GCC file links elsewhere in the app.
    const buildSubmissionCenterFilesHref = buildCategoricalFilesHref('sequencing_center.display_title');
    const buildTissueCategoryFilesHref = buildCategoricalFilesHref('sample_summary.category');

    const autolysisScoreData = useMemo(
        () => buildAutolysisScoreChartData(tissueResults),
        [tissueResults]
    );
    const submissionCenterData = useMemo(
        () => buildSubmissionCenterChartData(submissionCenterTerms, submissionCenterFileCounts),
        [submissionCenterTerms, submissionCenterFileCounts]
    );

    return (
        <div className="donor-cohort-view-chart-container">
            <DonorCohortViewChart
                title="Autolysis Score Distribution (by Tissue)"
                data={autolysisScoreData}
                chartWidth="auto"
                chartHeight={420}
                chartType="single"
                topStackColor={SLICE_TYPE_STYLES.pink.front}
                xAxisTitle="Autolysis score"
                yAxisTitle="# of Tissues"
                showBarTooltip={false}
                showXAxisTitle={true}
                popover={renderAutolysisScorePopover()}
                session={session}
                loading={tissueResultsLoading}
            />

            <TissueSampleCollectionViz
                tissueResults={tissueResults}
                loading={tissueResultsLoading}
            />

            <DonorCohortViewChart
                title="GCC Distribution (by Tissue Sample)"
                data={submissionCenterData}
                chartWidth="auto"
                chartHeight={420}
                chartType="horizontal"
                topStackColor={SLICE_TYPE_STYLES.yellow.front}
                xAxisTitle="# of Tissue Samples"
                showYAxisTitle={false}
                showBarTooltip={true}
                tooltipTitles={{ crumb: null, left: 'GCC', right: '# of Tissue Samples' }}
                // eslint-disable-next-line react/jsx-no-bind
                buildFilesHref={buildSubmissionCenterFilesHref}
                showXAxisTitle={true}
                popover={renderSubmissionCenterPopover()}
                session={session}
                loading={submissionCenterLoading}
            />

            {/* Kept mounted but hidden rather than removed -- may be
                reinstated later. See toggleViewIndex above for the same
                mount-but-hide pattern. */}
            <div className="d-none">
                <DonorCohortViewChart
                    title="Tissue Category Distribution"
                    data={tissueCategoryData}
                    chartWidth="auto"
                    chartHeight={420}
                    chartType="single"
                    topStackColor="#30975E"
                    xAxisTitle="Tissue category"
                    yAxisTitle="# of Donors"
                    showBarTooltip={true}
                    tooltipTitles={{ crumb: null, left: 'Tissue Category', right: '# of Donors' }}
                    // eslint-disable-next-line react/jsx-no-bind
                    buildFilesHref={buildTissueCategoryFilesHref}
                    showXAxisTitle={true}
                    popover={renderTissueCategoryPopover()}
                    session={session}
                    loading={categoryLoading}
                />
            </div>
        </div>
    );
};

export const BrowseTissueVizWrapper = (props) => {
    const {
        href,
        session,
        windowWidth,
        windowHeight,
        navigate,
        isFullscreen,
        toggleViewIndex,
        setToggleViewIndex,
        tissueDetailModeIndex,
        tissueSortModeIndex = 0,
        cohortModeIndex = 1,
    } = props;
    const useCompactFor = ['xs', 'sm', 'md', 'xxl'];

    // The Ischemic Time/Autolysis Score/Target Tissue % tabs below this
    // panel live in their own DotRouter and only change `href`'s hash
    // fragment (e.g. "#tissue-heatmap.autolysis-score") when clicked --
    // `url.parse(href, true).query` (what the aggregation requests below are
    // actually built from) never includes the hash, so that click doesn't
    // change the query these need. Depending on the raw `href` string anyway
    // re-ran those effects on every such click, flashing back to loading
    // placeholders and re-fetching identical data. Depending on just the
    // query-string portion (search) skips that.
    const hrefSearch = useMemo(() => url.parse(href).search || '', [href]);

    // Shared by useTissueDonorCounts and TissueCohortCharts -- both need the
    // same File-mapped, tissue-population-filtered query params.
    const fileFilters = useMemo(() => {
        const hrefParts = url.parse(href, true);
        const hrefQuery = normalizeQueryValuesForStringify(_.clone(hrefParts.query));
        delete hrefQuery.limit;
        delete hrefQuery.field;
        ChartDataController.transformFilterDonorToFile(hrefQuery, 'tissue');
        return hrefQuery;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hrefSearch, session]);

    // FacetCharts initializes ChartDataController and fetches on mount, so it
    // isn't mounted until someone opens it -- but stays mounted after that
    // (toggled via d-none, like the other views here) so switching back
    // doesn't refetch.
    const [facetChartOpened, setFacetChartOpened] = useState(toggleViewIndex === 1 && cohortModeIndex === 1);
    useEffect(() => {
        if (toggleViewIndex === 1 && cohortModeIndex === 1) setFacetChartOpened(true);
    }, [toggleViewIndex, cohortModeIndex]);

    const { loading: tissueCountsLoading, donorCountByInternalCode } = useTissueDonorCounts(fileFilters, session);
    const tissuePanelProps = useMemo(
        () => {
            return {
                loading: tissueCountsLoading,
                donorCountByInternalCode,
                tissueTypes: [...ALL_TISSUE_TYPES].sort(TISSUE_SORT_MODES[tissueSortModeIndex].compare),
            };
        },
        [tissueCountsLoading, donorCountByInternalCode, tissueSortModeIndex]
    );

    return (
        <div className="row browse-viz-container tissue-viz-container">
            <div className="stats-column col-auto">
                <BrowseSummaryStatsViewer
                    {...{ session, href, windowWidth, useCompactFor }}
                    mapping="tissue"
                />
                <IconToggle
                    options={[
                        {
                            title: (
                                <React.Fragment>
                                    <i className="icon fas icon-fas icon-lungs me-1" />{' '}
                                    Tissue View
                                </React.Fragment>
                            ),
                            dataTip: 'Toggle tissue view',
                            btnCls: 'w-100 btn-sm',
                            onClick: () => setToggleViewIndex(0),
                        },
                        {
                            title: (
                                <React.Fragment>
                                    <i className="icon fas icon-fas icon-users me-1" />{' '}
                                    Cohort View
                                </React.Fragment>
                            ),
                            dataTip: 'Toggle cohort view',
                            btnCls: 'w-100 btn-sm',
                            onClick: () => setToggleViewIndex(1),
                        },
                    ]}
                    activeIdx={toggleViewIndex}
                    divCls="view-toggle p-1"
                />
            </div>
            <div className="col ps-0 tissue-viz-content">
                {/* Both stay mounted (toggled via d-none, not a ternary that
                    unmounts) so switching back to a tab whose data already
                    loaded doesn't re-run its fetch effects from scratch --
                    same reasoning as BrowseTissueHeatmapTable.js's DotRouterTab
                    `cache` prop for its 3 tabs. */}
                <div className={toggleViewIndex === 0 ? '' : 'd-none'}>
                    {/* Both stay mounted (toggled via d-none), same
                        already-loaded-data reasoning as toggleViewIndex
                        above. */}
                    <div className={tissueDetailModeIndex === 0 ? '' : 'd-none'}>
                        <TissueBasicPanel {...tissuePanelProps} />
                    </div>
                    <div className={tissueDetailModeIndex === 1 ? '' : 'd-none'}>
                        <TissueAdvancedPanel {...tissuePanelProps} />
                    </div>
                </div>
                <div className={toggleViewIndex === 1 ? '' : 'd-none'}>
                    {/* Both Cohort View modes stay mounted once shown (toggled
                        via d-none), same reasoning as the views above. */}
                    <div className={cohortModeIndex === 0 ? '' : 'd-none'}>
                        <TissueCohortCharts fileFilters={fileFilters} session={session} />
                    </div>
                    {facetChartOpened ? (
                        <div className={cohortModeIndex === 1 ? '' : 'd-none'}>
                            {/* The same chart Browse by File/Donor show (X Axis /
                                Group By / germ-layer tabs, bars link to the
                                filtered File list), here aggregating this
                                page's released files by tissue. */}
                            <div id="facet-charts-container" className="container ps-0 ps-xl-4">
                                <FacetCharts
                                    {..._.pick(props, 'context', 'href', 'session', 'schemas', 'browseBaseState')}
                                    {...{
                                        windowWidth,
                                        windowHeight,
                                        navigate,
                                        isFullscreen,
                                        initialFields: FACET_CHART_INITIAL_FIELDS,
                                        mapping: 'tissue',
                                    }}
                                />
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
};
