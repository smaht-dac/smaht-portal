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
import { BROWSE_STATUS_FILTERS } from '../BrowseView';
import AliquotVisualization, {
    SLICE_TYPE_STYLES,
} from '../../item-pages/components/tissue-overview/AliquotVisualization';
import {
    getTissueIconSrc,
    getTissueDisplayLabel,
    getTissueTypeUrlCode,
    getTissueColorHex,
    hexToRgba,
} from '../../item-pages/components/tissue-overview/helpers';
import { tissueCategoryByTpcCode, getTissueInternalCodeFromFacetTerm } from '../../util/data';
import smahtTissueColors from '../../../data/color-schemes/smaht_tissue_colors.json';

// Groups the categories returned by item_utils/tissue.py::get_category() into
// the 5 display rows the germ-layer panel shows -- Germ Cells and Clinically
// Accessible each get their own row now, rather than sharing one "GERM/CLIN"
// row.
const GERM_LAYER_LABELS = [
    { key: 'ecto', label: 'ECTO', categories: ['Ectoderm'] },
    { key: 'meso', label: 'MESO', categories: ['Mesoderm'] },
    { key: 'endo', label: 'ENDO', categories: ['Endoderm'] },
    { key: 'germ', label: 'GERM', categories: ['Germ Cells'] },
    { key: 'clin', label: 'CLIN', categories: ['Clinically Accessible'] },
];

// Fixed display order for the 5 raw categories item_utils/tissue.py's
// get_category() returns -- used (unlike GERM_LAYER_LABELS above) by the
// Cohort View charts, which chart each category on its own rather than
// folding Germ Cells/Clinically Accessible into one row.
const TISSUE_CATEGORY_ORDER = ['Ectoderm', 'Mesoderm', 'Endoderm', 'Germ Cells', 'Clinically Accessible'];

// Same population filter Browse by Donor/Browse by File use, mirrored from
// TissueTypeView.js's identical constant -- keeps the GCC chart's file-count
// fetch consistent with the rest of the page's population instead of
// counting every File regardless of release status.
const BROWSE_STATUS_VALUES = new URLSearchParams(BROWSE_STATUS_FILTERS).getAll('status');

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

// Exported for unit testing. `tissueCategoryByTerm` keys are the actual
// tissue_type term strings (e.g. "Liver") -- keeping the terms (not just a
// count per germ layer) lets each bubble below link to its own
// /tissue-overview/ page.
export const countTissueTypesByGermLayer = (tissueCategoryByTerm = {}) => {
    const termsByCategory = {};
    Object.entries(tissueCategoryByTerm).forEach(([term, category]) => {
        if (!termsByCategory[category]) termsByCategory[category] = [];
        termsByCategory[category].push(term);
    });
    return GERM_LAYER_LABELS.map(({ key, label, categories }) => {
        const tissueTypes = categories
            .reduce((terms, c) => terms.concat(termsByCategory[c] || []), [])
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        return { key, label, tissueTypes };
    });
};

const TissueGermLayerPanel = ({ fileFilters, session }) => {
    const [loading, setLoading] = useState(true);
    const [germLayerGroups, setGermLayerGroups] = useState(
        GERM_LAYER_LABELS.map(({ key, label }) => {
            return { key, label, tissueTypes: [] };
        })
    );

    // data-tip is react-tooltip's static-attribute API (see app.js's global
    // <ReactTooltip/> mount) -- it only picks up nodes present at its last
    // build, so newly rendered bubbles need an explicit rebuild once loaded.
    useEffect(() => {
        if (!loading) ReactTooltip.rebuild();
    }, [loading, germLayerGroups]);

    useEffect(() => {
        setLoading(true);

        const requestBody = {
            search_query_params: fileFilters,
            fields_to_aggregate_for: ['sample_summary.tissues'],
            include_meta_tissue_categories: true,
        };

        ajax.load(
            '/bar_plot_aggregations/',
            (resp) => {
                setGermLayerGroups(countTissueTypesByGermLayer(resp?.meta?.tissue_category_by_term));
                setLoading(false);
            },
            'POST',
            () => setLoading(false),
            JSON.stringify(requestBody),
            {},
            null
        );
    }, [fileFilters, session]);

    return (
        <div className="tissue-germ-layer-panel">
            {germLayerGroups.map(({ key, label, tissueTypes }) => (
                <div className="tissue-germ-layer-row" key={key}>
                    <div className="tissue-germ-layer-label">
                        {label.split('/').map((part, i, arr) => (
                            <React.Fragment key={part}>
                                {part}
                                {i < arr.length - 1 ? (
                                    <>
                                        /<br />
                                    </>
                                ) : null}
                            </React.Fragment>
                        ))}
                    </div>
                    <div className="tissue-germ-layer-bubbles">
                        {!loading &&
                            tissueTypes.map((tissueType) => {
                                // Same per-tissue anatomy icon and 4-letter
                                // code label used on the Tissue Overview
                                // header and Browse-by-Tissue table headers
                                // (getTissueIconSrc/getTissueDisplayLabel).
                                const bubbleIconSrc = getTissueIconSrc(tissueType);
                                const bubbleLabel = getTissueDisplayLabel(tissueType);
                                // Official per-tissue color (smaht_tissue_colors.json),
                                // same one used to fill the anatomy icon here as the
                                // rest of the app uses for this tissue elsewhere --
                                // falls back to the panel's neutral default color (set
                                // in SCSS) for the handful of tissue_type values that
                                // scheme doesn't cover.
                                const bubbleColorHex = getTissueColorHex(tissueType);
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
                                return (
                                    <a
                                        className="tissue-germ-layer-bubble"
                                        key={tissueType}
                                        href={`/tissue-overview/?tissue_type=${formUrlEncode(getTissueTypeUrlCode(tissueType))}`}
                                        data-tip={bubbleLabel}
                                        aria-label={bubbleLabel}
                                        style={bubbleStyle}>
                                        {bubbleIconSrc ? (
                                            <i
                                                className="tissue-germ-layer-bubble-icon"
                                                style={{
                                                    WebkitMaskImage: `url(${bubbleIconSrc})`,
                                                    maskImage: `url(${bubbleIconSrc})`,
                                                }}
                                            />
                                        ) : null}
                                    </a>
                                );
                            })}
                    </div>
                </div>
            ))}
        </div>
    );
};

// Advanced Tissue View's own display name for each of item_utils/tissue.py's
// 5 raw categories -- unlike GERM_LAYER_LABELS above (which folds Germ
// Cells/Clinically Accessible into one "GERM/CLIN" row for the compact
// bubble panel), Advanced view gives every category its own column, so each
// gets its own readable title-cased name instead.
const ADVANCED_GERM_LAYER_CATEGORY_DISPLAY_NAME = {
    Ectoderm: 'Ectoderm',
    Mesoderm: 'Mesoderm',
    Endoderm: 'Endoderm',
    'Germ cells': 'Germ Cells',
    'Clinically accessible': 'Clinically Accessible',
};
// Germ Cells and Clinically Accessible each have very few tissue types (2
// apiece), so giving them their own full-width column like Ectoderm/
// Mesoderm/Endoderm leaves that column mostly empty -- stacking the two
// inside one shared column instead keeps every column's width consistent
// without wasting horizontal space.
//
// Ectoderm has the most tissue types (7), which at the shared 2-per-row card
// width made it visibly taller than every other column -- `cardColumns: 3`
// widens just that column's own flex-basis and card grid so it stays
// roughly as tall as its neighbors instead of forcing every column to a
// wider (mostly empty) 3-column grid.
const ADVANCED_GERM_LAYER_COLUMNS = [
    { key: 'ectoderm', germLayers: ['Ectoderm'], cardColumns: 3 },
    { key: 'mesoderm', germLayers: ['Mesoderm'], cardColumns: 2 },
    { key: 'endoderm', germLayers: ['Endoderm'], cardColumns: 2 },
    { key: 'germ-clin', germLayers: ['Germ Cells', 'Clinically Accessible'], cardColumns: 2 },
];

// smaht_tissue_colors.json's full_name uses a bare hyphen for the handful of
// tissues with a sub-region (e.g. "Brain-Cerebellum", "Colon-Ascending") but
// already uses ", " for the L/R-suffixed ones (e.g. "Testis, L") -- only
// rewrite the former so both read the same "Brain, Cerebellum" way.
const formatAdvancedTissueFullName = (fullName) =>
    fullName.includes(',') ? fullName : fullName.replace('-', ', ');

// Every tissue type SMaHT tracks, regardless of whether any donor currently
// has data for it -- Advanced view (unlike TissueGermLayerPanel above, which
// only shows tissue types the live aggregation actually returned) always
// shows the complete set, so a tissue with 0 donors still renders as a
// disabled card instead of being silently absent. Built from the same two
// static sources TissueGermLayerPanel and helpers.js already rely on
// (smaht_tissue_colors.json for the code/name, data.js's
// tissueCategoryByTpcCode for the germ-layer category) rather than a new
// third list to keep in sync.
const ALL_TISSUE_TYPES = Object.entries(smahtTissueColors).map(([tpcCode, entry]) => {
    const fullName = formatAdvancedTissueFullName(entry.full_name);
    const rawCategory = tissueCategoryByTpcCode[tpcCode];
    return {
        tpcCode,
        internalCode: entry.smaht_code,
        fullName,
        category: ADVANCED_GERM_LAYER_CATEGORY_DISPLAY_NAME[rawCategory] || rawCategory,
        // Same "<TPC code> - <name>" shape real tissue_type facet values
        // use, so getTissueIconSrc/getTissueColorHex/getTissueTypeUrlCode
        // (which all parse that shape via getTissueInternalCodeFromFacetTerm)
        // resolve this tissue's icon/color/URL code the same way they do
        // for a real facet term.
        facetTermValue: `${tpcCode} - ${fullName}`,
    };
});

const getAdvancedTissueTypesForGermLayer = (germLayer) =>
    ALL_TISSUE_TYPES.filter((tissueType) => tissueType.category === germLayer).sort((a, b) =>
        a.fullName.localeCompare(b.fullName, undefined, { numeric: true })
    );

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

const TissueAdvancedGermLayerPanel = ({ fileFilters, session }) => {
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

    return (
        <div className="tissue-advanced-germ-layer-panel">
            {ADVANCED_GERM_LAYER_COLUMNS.map(({ key, germLayers, cardColumns }) => (
                <div
                    className={`tissue-advanced-germ-layer-column tissue-advanced-germ-layer-column--cols-${cardColumns}`}
                    key={key}>
                    {germLayers.map((germLayer) => (
                        <div className="tissue-advanced-germ-layer-section" key={germLayer}>
                            <h4 className="tissue-advanced-germ-layer-title">{germLayer} Tissues</h4>
                            <div
                                className={`tissue-advanced-germ-layer-cards tissue-advanced-germ-layer-cards--cols-${cardColumns}`}>
                                {getAdvancedTissueTypesForGermLayer(germLayer).map((tissueType) => {
                                    const donorCount = donorCountByInternalCode[tissueType.internalCode] || 0;
                                    // Disabled while a count hasn't loaded yet would
                                    // incorrectly flash every card as disabled, so
                                    // only 0 donors *after* loading finishes counts.
                                    const isDisabled = !loading && donorCount === 0;
                                    const iconSrc = getTissueIconSrc(tissueType.facetTermValue);

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
                                            aria-disabled="true">
                                            {cardContent}
                                        </div>
                                    ) : (
                                        <a
                                            className="tissue-advanced-card"
                                            key={tissueType.internalCode}
                                            href={`/tissue-overview/?tissue_type=${formUrlEncode(getTissueTypeUrlCode(tissueType.facetTermValue))}`}>
                                            {cardContent}
                                        </a>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
};

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
    const { href, session, windowWidth, toggleViewIndex, setToggleViewIndex, tissueDetailModeIndex } = props;
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

    // Shared by TissueGermLayerPanel and TissueCohortCharts -- both need the
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
                        <TissueGermLayerPanel fileFilters={fileFilters} session={session} />
                    </div>
                    <div className={tissueDetailModeIndex === 1 ? '' : 'd-none'}>
                        <TissueAdvancedGermLayerPanel fileFilters={fileFilters} session={session} />
                    </div>
                </div>
                <div className={toggleViewIndex === 1 ? '' : 'd-none'}>
                    <TissueCohortCharts fileFilters={fileFilters} session={session} />
                </div>
            </div>
        </div>
    );
};
