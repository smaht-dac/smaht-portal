'use strict';

import React, { useEffect, useMemo, useState } from 'react';
import ReactTooltip from 'react-tooltip';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import {
    DotRouter,
    DotRouterTab,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/DotRouter';
import { GERM_LAYER_COLORS } from '../../util/germ-layer-colors';
import { getTissueInternalCodeFromFacetTerm } from '../../util/data';

// Ascending order of Tissue.pathology_summary.target_tissue_percentage bands,
// mirrored from item_utils/pathology_report.py::TARGET_TISSUE_PERCENTAGE_ORDER.
const TARGET_TISSUE_PERCENTAGE_ORDER = ['0', '[0-10]', '[11-25]', '[26-49]', '[50-100]'];

// The 5 region-specific brain internal codes (see util/data.js's tissue-code
// table) -- a donor's brain Tissue record sometimes carries the generic
// "Brain" ontology term instead of one of these (confirmed against real
// production data: e.g. donor SMHT001 has ischemic_time only under plain
// "Brain", while its BRCE/BRFL/... columns have none of their own). See
// buildTissueMetricMatrix below for how that generic value gets used.
const BRAIN_REGION_INTERNAL_CODES = ['BRCE', 'BRFL', 'BRHL', 'BRHR', 'BRTL'];

// Column group order, by the same `category` values item_utils/tissue.py's
// get_category() computes on each Tissue. Colors come from the shared
// GERM_LAYER_COLORS palette (also used by viz/Matrix/DataMatrix.js) so this
// table's germ-layer grouping reads as the same palette as that matrix.
const GERM_LAYER_GROUP_ORDER = ['Ectoderm', 'Mesoderm', 'Endoderm', 'Germ Cells', 'Clinically Accessible'];
const GERM_LAYER_GROUP_STYLES = GERM_LAYER_GROUP_ORDER.reduce((acc, category, order) => {
    acc[category] = { order, label: category, ...GERM_LAYER_COLORS[category] };
    return acc;
}, {});
const OTHER_GROUP_STYLE = { order: 99, label: 'Other', backgroundColor: '#E7EDF3', textColor: '#343741' };

// tissueTypes is already sorted into contiguous germ-layer runs by
// buildTissueMetricMatrix, so a single pass collapsing consecutive same-group
// columns is enough to get each group's span.
function buildColumnGroups(tissueTypes, tissueTypeCategories) {
    const groups = [];
    tissueTypes.forEach((tissueType) => {
        const style = GERM_LAYER_GROUP_STYLES[tissueTypeCategories[tissueType]] || OTHER_GROUP_STYLE;
        const lastGroup = groups[groups.length - 1];
        if (lastGroup && lastGroup.style === style) {
            lastGroup.span += 1;
        } else {
            groups.push({ style, span: 1 });
        }
    });
    return groups;
}

// Snovault's canonical_redirect (snovault/renderers.py) 302s a request
// whenever its query string doesn't literally match the search response's
// own recomputed '@id' query string -- which Python's urlencode renders
// with '+' for spaces (application/x-www-form-urlencoded), not
// encodeURIComponent's '%20'. tissue_type values contain spaces (e.g.
// "3M - Adrenal Gland, R"), so without this the heatmap's own link would
// always trigger a visible redirect on click. Mirrors urlencode's default
// quote_via=quote_plus encoding for exactly that one character class.
export const formUrlEncode = (value) => encodeURIComponent(value).replace(/%20/g, '+');

// Exported for unit testing. Pivots raw Tissue search results into a
// donor (external_id) x tissue_type matrix of values (as picked by
// `getValue`), plus a tissue_type -> Tissue Overview page href map, used to
// link column headers to /tissue-overview/?tissue_type=<value> (a real
// tissue_type-keyed page, backed by encoded/tissue_overview.py -- unlike
// the legacy /tissues/<uuid>/ page, which is keyed on a single Tissue
// instance, not on tissue_type). type=Tissue, limit=all, and the
// donor.study/donor.tags population filter are deliberately NOT in this
// href -- tissue_overview.py forces all of them server-side, so the
// address bar stays down to just tissue_type.
//
// When a donor has multiple Tissue records for the same tissue_type, the
// one with a populated pathology_summary is preferred over an arbitrary
// "last encountered" pick, matching the selection rule used by
// TissueView.js's dedupeTissuesByDonor.
//
// `distributeGenericBrainValue` -- see the comment further down where it's
// used: the generic "Brain" column is always hidden, but copying its value
// into the region-specific columns first is an Ischemic Time-only treatment
// (per explicit request), not something Autolysis Score/Target Tissue %
// should also do -- those two just hide the column and leave each region's
// own cell exactly as it already was (its own real value, or n/a).
export const buildTissueMetricMatrix = (tissueResults = [], getValue, distributeGenericBrainValue = false) => {
    const tissueTypes = [];
    const donors = [];
    const cellsByDonorAndTissue = {};
    const tissueByDonorAndTissue = {};
    const tissueTypeHrefs = {};
    const tissueTypeCategories = {};

    tissueResults.forEach((t) => {
        const donorId = t?.donor?.external_id;
        const tissueType = t?.tissue_type;
        if (!donorId || !tissueType) return;
        if (!donors.includes(donorId)) donors.push(donorId);
        if (!tissueTypes.includes(tissueType)) tissueTypes.push(tissueType);
        if (!tissueTypeHrefs[tissueType]) {
            tissueTypeHrefs[tissueType] = `/tissue-overview/?tissue_type=${formUrlEncode(tissueType)}`;
        }
        if (!tissueTypeCategories[tissueType] && t.category) tissueTypeCategories[tissueType] = t.category;

        const key = `${donorId} ${tissueType}`;
        const existing = tissueByDonorAndTissue[key];
        if (!existing || (!existing.pathology_summary && t.pathology_summary)) {
            tissueByDonorAndTissue[key] = t;
            cellsByDonorAndTissue[key] = getValue(t) ?? null;
        }
    });

    // A generic "Brain" tissue_type carries no region of its own, so its own
    // column is always hidden here, on every tab. Copying its value into
    // whichever of the 5 region-specific columns (BRCE/BRFL/BRHL/BRHR/BRTL)
    // don't already have their own real value for that donor -- because
    // ischemic time is a collection-event measurement, not specific to which
    // region was later dissected out, so the generic value is an equally
    // valid stand-in there -- is Ischemic Time-only (distributeGenericBrainValue).
    // Autolysis Score/Target Tissue % don't make that same assumption: they
    // hide the column but leave each region's own cell as-is.
    const genericBrainTissueType = tissueTypes.find((t) => t.trim() === 'Brain');
    const brainRegionTissueTypes = tissueTypes.filter((t) =>
        BRAIN_REGION_INTERNAL_CODES.includes(getTissueInternalCodeFromFacetTerm(t))
    );
    if (genericBrainTissueType) {
        if (distributeGenericBrainValue) {
            donors.forEach((donorId) => {
                const genericValue = cellsByDonorAndTissue[`${donorId} ${genericBrainTissueType}`];
                if (genericValue === null || typeof genericValue === 'undefined') return;
                brainRegionTissueTypes.forEach((regionTissueType) => {
                    const key = `${donorId} ${regionTissueType}`;
                    if (cellsByDonorAndTissue[key] === null || typeof cellsByDonorAndTissue[key] === 'undefined') {
                        cellsByDonorAndTissue[key] = genericValue;
                    }
                });
            });
        }
        tissueTypes.splice(tissueTypes.indexOf(genericBrainTissueType), 1);
        delete tissueTypeHrefs[genericBrainTissueType];
        delete tissueTypeCategories[genericBrainTissueType];
    }

    donors.sort();
    // Group by germ layer/category first (Ectoderm, Mesoderm, Endoderm, Germ
    // Cells, Clinically Accessible), alphabetical by display label within
    // each group -- matches DataMatrix.js's DEFAULT_ROW_GROUPS_EXTENDED order.
    tissueTypes.sort((a, b) => {
        const orderA = (GERM_LAYER_GROUP_STYLES[tissueTypeCategories[a]] || OTHER_GROUP_STYLE).order;
        const orderB = (GERM_LAYER_GROUP_STYLES[tissueTypeCategories[b]] || OTHER_GROUP_STYLE).order;
        if (orderA !== orderB) return orderA - orderB;
        return formatTissueTypeLabel(a).localeCompare(formatTissueTypeLabel(b));
    });

    const matrix = donors.map((donor) => {
        return {
            donor,
            cells: tissueTypes.map((tissueType) => cellsByDonorAndTissue[`${donor} ${tissueType}`] ?? null),
        };
    });

    return {
        tissueTypes,
        tissueTypeHrefs,
        tissueTypeCategories,
        matrix,
        // Columns eligible to have consecutive equal-valued cells in the
        // same row merged into one spanning cell (MetricHeatmapTable) --
        // just the brain regions the generic "Brain" value above may have
        // been copied into, so this stays a targeted de-duplication of that
        // specific distributed-value case rather than a general "collapse
        // any two adjacent columns that happen to match" behavior (which
        // would misleadingly merge unrelated tissues that coincidentally
        // share a value, e.g. two different organs both reading "n/a").
        // Empty when nothing was actually distributed (distributeGenericBrainValue
        // false, or there was no generic "Brain" column to begin with).
        mergeableTissueTypes: distributeGenericBrainValue
            ? new Set(brainRegionTissueTypes)
            : EMPTY_MERGEABLE_TISSUE_TYPES,
    };
};

const getIschemicTimeValue = (t) => t?.ischemic_time ?? null;
const getAutolysisScoreValue = (t) => t?.pathology_summary?.autolysis_score ?? null;
const getTargetTissuePercentageValue = (t) => t?.pathology_summary?.target_tissue_percentage ?? null;

// Same "label + info-circle with a data-tip" pattern as Browse by Donor's
// Age column header (BrowseDonorBase.js) -- react-tooltip's static-attribute
// API, picked up by the app-level <ReactTooltip/> mount (see app.js).
function TabTitleWithInfo({ label, tooltip }) {
    return (
        <span>
            {label}
            <i
                className="icon icon-fw icon-info-circle fas"
                style={{ marginLeft: 6 }}
                data-tip={tooltip}
            />
        </span>
    );
}

function formatIschemicTime(value) {
    if (value === null || typeof value === 'undefined') return 'n/a';
    return `${value}`;
}

function getIschemicTimeScoreClass(value) {
    if (value === null || typeof value === 'undefined') return 'na';
    if (value <= 6) return 'score-0';
    if (value <= 12) return 'score-1';
    if (value <= 18) return 'score-2';
    return 'score-3';
}

function formatAutolysisScore(value) {
    if (value === null || typeof value === 'undefined') return 'n/a';
    return String(value);
}

function getAutolysisScoreClass(value) {
    if (value === null || typeof value === 'undefined') return 'na';
    return `score-${Math.min(value, 3)}`;
}

function formatTargetTissuePercentage(value) {
    if (value === null || typeof value === 'undefined') return 'n/a';
    return value === '0' ? '0%' : value;
}

// `tissue_type` is stored/sorted as "<protocol code> - <name>" (e.g.
// "3AK - Brain, Frontal Lobe") so the code stays part of the value used for
// column identity/lookup, but showing that code in the header is meaningless
// to someone browsing by tissue -- strip it for display only. Also doubles
// as the sort key (below), so this always stays the full descriptive name,
// not the short header label (formatTissueTypeHeaderLabel) -- switching
// *this* one to the 4-letter code would silently reorder columns
// alphabetically by code instead of by the name a person actually reads.
function formatTissueTypeLabel(tissueType) {
    if (!tissueType) return tissueType;
    return tissueType.replace(/^\S+\s-\s*/, '');
}

// The header label itself: prefers the stable 4-letter internal code (e.g.
// "BRFL", via the same tissue-code table the icon/depth lookups elsewhere
// already use) so columns stay compact, falling back to the full name
// (formatTissueTypeLabel) for any tissue_type that table doesn't cover. The
// full "<code> - <name>" string is still the header's `title` tooltip.
function formatTissueTypeHeaderLabel(tissueType) {
    if (!tissueType) return tissueType;
    return getTissueInternalCodeFromFacetTerm(tissueType) || formatTissueTypeLabel(tissueType);
}

function getTargetTissuePercentageScoreClass(value) {
    if (value === null || typeof value === 'undefined') return 'na';
    const index = TARGET_TISSUE_PERCENTAGE_ORDER.indexOf(value);
    if (index === -1) return 'na';
    // Higher target-tissue presence is "better", so invert the band index
    // (highest band -> score-0) to match the Ischemic Time convention.
    return `score-${TARGET_TISSUE_PERCENTAGE_ORDER.length - 1 - index}`;
}

function heatmapCellClassName(value, getScoreClass, enableConditionalColor) {
    return (
        'tissue-heatmap-cell' +
        (enableConditionalColor ? ` ${getScoreClass(value)}` : '') +
        // Muted styling for "no data" cells is plain typography (grey vs.
        // dark text), not the score-band heatmap coloring
        // enableConditionalColor gates -- keeps real values legible against
        // empty ones either way.
        (value === null || typeof value === 'undefined' ? ' is-empty' : '')
    );
}

// One row's cells, merging a consecutive run of `mergeableTissueTypes`
// columns that share the exact same value (e.g. the brain regions a
// generic "Brain" value was distributed into, see buildTissueMetricMatrix)
// into a single spanning <td> instead of repeating that value once per
// column -- column headers stay one-per-tissue-type regardless (only body
// cells merge), so which specific columns a merged cell covers is still
// visible by lining it up with the header row above.
function renderRowCells(cells, tissueTypes, mergeableTissueTypes, formatValue, getScoreClass, enableConditionalColor) {
    const nodes = [];
    let i = 0;
    while (i < cells.length) {
        const tissueType = tissueTypes[i];
        const value = cells[i];
        let span = 1;
        if (mergeableTissueTypes.has(tissueType)) {
            while (
                i + span < cells.length &&
                mergeableTissueTypes.has(tissueTypes[i + span]) &&
                cells[i + span] === value
            ) {
                span += 1;
            }
        }
        nodes.push(
            <td
                key={tissueType}
                colSpan={span > 1 ? span : undefined}
                className={heatmapCellClassName(value, getScoreClass, enableConditionalColor)}>
                {formatValue(value)}
            </td>
        );
        i += span;
    }
    return nodes;
}

// Memoized so that clicking between tabs -- which re-renders the whole
// BrowseTissueHeatmapTable (DotRouterTab's onClick updates the page href,
// which flows back down as a new `href` prop) -- doesn't also re-render
// and repaint the two other, currently-hidden tables (all three stay
// mounted simultaneously via DotRouterTab's `cache` prop, only toggled via a
// `d-none` class). Each of these tables' props are individually stable
// (memoized upstream in BrowseTissueHeatmapTable), so shallow prop equality
// correctly bails out here instead of redoing this work for tables whose
// tab isn't even visible.
const EMPTY_MERGEABLE_TISSUE_TYPES = new Set();

const MetricHeatmapTable = React.memo(function MetricHeatmapTable({
    tissueTypes,
    tissueTypeHrefs,
    tissueTypeCategories,
    matrix,
    formatValue,
    getScoreClass,
    // Gates the score-band background coloring (score-0..score-3, applied
    // below) on each cell -- off by default per request, flip back on to
    // restore the previous always-on heatmap coloring.
    enableConditionalColor = false,
    // See renderRowCells -- which columns are eligible to have consecutive
    // equal-valued cells in the same row merged into one spanning cell.
    mergeableTissueTypes = EMPTY_MERGEABLE_TISSUE_TYPES,
}) {
    const columnGroups = useMemo(
        () => buildColumnGroups(tissueTypes, tissueTypeCategories),
        [tissueTypes, tissueTypeCategories]
    );
    return (
        <div className="tissue-heatmap-table-wrap">
            <table className="tissue-heatmap-table">
                <thead>
                    <tr className="tissue-heatmap-group-row">
                        <th className="tissue-heatmap-order-header" rowSpan={2} />
                        <th className="tissue-heatmap-donor-header" rowSpan={2} />
                        {columnGroups.map((group, i) => (
                            <th
                                key={i}
                                colSpan={group.span}
                                className="tissue-heatmap-group-label"
                                title={group.style.label}
                                style={{
                                    backgroundColor: group.style.backgroundColor,
                                    color: group.style.textColor,
                                }}>
                                {group.style.label}
                            </th>
                        ))}
                    </tr>
                    <tr>
                        {tissueTypes.map((tissueType) => (
                            <th key={tissueType} title={tissueType}>
                                {tissueTypeHrefs[tissueType] ? (
                                    <a href={tissueTypeHrefs[tissueType]}>
                                        {formatTissueTypeHeaderLabel(tissueType)}
                                    </a>
                                ) : (
                                    formatTissueTypeHeaderLabel(tissueType)
                                )}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {matrix.map(({ donor, cells }, rowIndex) => (
                        <tr key={donor}>
                            {rowIndex === 0 ? (
                                <td className="tissue-heatmap-order-label" rowSpan={matrix.length}>
                                    <span>Donor Distribution Order</span>
                                </td>
                            ) : null}
                            <td className="tissue-heatmap-donor-id">{donor}</td>
                            {renderRowCells(
                                cells,
                                tissueTypes,
                                mergeableTissueTypes,
                                formatValue,
                                getScoreClass,
                                enableConditionalColor
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
});

export const BrowseTissueHeatmapTable = (props) => {
    // Gates the score-band cell coloring in all three tabs' tables -- see
    // MetricHeatmapTable's identical prop. Off by default per request.
    const { href, session, enableConditionalColor = false } = props;
    const [loading, setLoading] = useState(true);
    const [tissueResults, setTissueResults] = useState([]);

    // The tab titles' info-circle icons (TabTitleWithInfo) are static-attribute
    // react-tooltip targets (data-tip) -- app.js's global <ReactTooltip/> only
    // picks up nodes present at its own last build, and this component can
    // mount after that (e.g. scrolled/tabbed into view later), so it needs an
    // explicit rebuild once mounted, same as BrowseTissueVizWrapper.js's
    // germ-layer bubbles.
    useEffect(() => {
        ReactTooltip.rebuild();
    }, []);

    // `session` in the dependency array so logging in/out re-fetches --
    // permission-filtered fields (e.g. protected donor data) can change
    // without `href` itself changing, and this component previously had no
    // way to notice that short of a full page reload.
    useEffect(() => {
        setLoading(true);
        ajax.load(
            // Matches Browse by Donor/Browse by File's donor population
            // (Production study, has_released_files tag) so this table
            // doesn't list donors that don't have released files yet (e.g.
            // benchmarking-only donors) -- see donor.study/donor.tags in
            // types/tissue.py's embedded_list.
            '/search/?type=Tissue&donor.study=Production&donor.tags=has_released_files&limit=all',
            (resp) => {
                setTissueResults(resp?.['@graph'] || []);
                setLoading(false);
            },
            'GET',
            () => {
                setTissueResults([]);
                setLoading(false);
            }
        );
    }, [session]);

    const ischemicTime = useMemo(
        () => buildTissueMetricMatrix(tissueResults, getIschemicTimeValue, true),
        [tissueResults]
    );
    const autolysisScore = useMemo(
        () => buildTissueMetricMatrix(tissueResults, getAutolysisScoreValue),
        [tissueResults]
    );
    const targetTissuePercentage = useMemo(
        () => buildTissueMetricMatrix(tissueResults, getTargetTissuePercentageValue),
        [tissueResults]
    );

    return (
        <div className="tissue-heatmap-card">
            <DotRouter
                href={href}
                navClassName="tissue-heatmap-tabs"
                contentsClassName=""
                isActive={true}
                prependDotPath="tissue-heatmap">
                <DotRouterTab
                    dotPath=".ischemic-time"
                    tabTitle={
                        <TabTitleWithInfo
                            label="Ischemic Time (h)"
                            tooltip="Time interval between death, presumed death, or cross-clamp application and beginning of tissue collection (hours)"
                        />
                    }
                    arrowTabs={false}
                    cache={true}
                    default>
                    {loading ? (
                        <div className="tissue-heatmap-loading">
                            <i className="icon icon-circle-notch icon-spin fas" />
                        </div>
                    ) : (
                        <MetricHeatmapTable
                            {...ischemicTime}
                            formatValue={formatIschemicTime}
                            getScoreClass={getIschemicTimeScoreClass}
                            enableConditionalColor={enableConditionalColor}
                        />
                    )}
                </DotRouterTab>
                <DotRouterTab
                    dotPath=".autolysis-score"
                    tabTitle={
                        <TabTitleWithInfo
                            label="Autolysis Score"
                            tooltip="Tissue autolysis score of the sample or region: 0=None, 1=mild, 2=moderate, 3=severe"
                        />
                    }
                    arrowTabs={false}
                    cache={true}>
                    {loading ? (
                        <div className="tissue-heatmap-loading">
                            <i className="icon icon-circle-notch icon-spin fas" />
                        </div>
                    ) : (
                        <MetricHeatmapTable
                            {...autolysisScore}
                            formatValue={formatAutolysisScore}
                            getScoreClass={getAutolysisScoreClass}
                            enableConditionalColor={enableConditionalColor}
                            // Merging same-value brain-region cells is an
                            // Ischemic Time-only treatment (per request) --
                            // the generic "Brain" -> region distribution and
                            // column hiding above still apply here, each
                            // region's own (distributed or real) value just
                            // renders in its own cell, never merged.
                            mergeableTissueTypes={EMPTY_MERGEABLE_TISSUE_TYPES}
                        />
                    )}
                </DotRouterTab>
                <DotRouterTab
                    dotPath=".target-tissue"
                    tabTitle={
                        <TabTitleWithInfo
                            label="Target Tissue %"
                            tooltip="Percentage range of the sample that was the target tissue subtype"
                        />
                    }
                    arrowTabs={false}
                    cache={true}>
                    {loading ? (
                        <div className="tissue-heatmap-loading">
                            <i className="icon icon-circle-notch icon-spin fas" />
                        </div>
                    ) : (
                        <MetricHeatmapTable
                            {...targetTissuePercentage}
                            formatValue={formatTargetTissuePercentage}
                            getScoreClass={getTargetTissuePercentageScoreClass}
                            enableConditionalColor={enableConditionalColor}
                            // See the Autolysis Score tab's identical prop above.
                            mergeableTissueTypes={EMPTY_MERGEABLE_TISSUE_TYPES}
                        />
                    )}
                </DotRouterTab>
            </DotRouter>
        </div>
    );
};
