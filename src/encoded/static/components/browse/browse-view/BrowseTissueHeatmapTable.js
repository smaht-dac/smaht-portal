'use strict';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactTooltip from 'react-tooltip';
import { ajax, JWT } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
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
// "Brain" ontology term instead of one of these, with its own metric values
// (e.g. ischemic_time) and none on the region-specific columns. See
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

// A tissue_type maps back to a single anatomical location, but a donor
// commonly has *two* Tissue records there -- one Fixed, one Frozen/Snap
// Frozen, both sharing that same tissue_type (see get_tissue_type's own
// ontology-term-based resolution, which doesn't distinguish preservation
// type). Real production data confirms these two records' own ischemic_time
// values genuinely differ, and not just by noise: for a given donor, the
// Frozen value is typically identical across every one of that donor's
// organs (a single donor-level timestamp -- e.g. time to the start of the
// frozen-collection batch -- duplicated onto each Frozen record), while
// the Fixed value varies per organ (a real, organ-specific measurement).
// Fixed is therefore the more informative one to surface when both exist;
// only falls back to whichever record actually has a value when one
// doesn't. Exported for unit testing.
export function pickPrimaryTissueRecord(candidates, getValue) {
    const withValue = candidates.filter((t) => {
        const value = getValue(t);
        return value !== null && typeof value !== 'undefined';
    });
    const pool = withValue.length > 0 ? withValue : candidates;
    return pool.find((t) => t.preservation_type === 'Fixed') || pool[0];
}

// "Fixed" vs everything else ("Snap Frozen", "Fresh", ...) is the same
// two-way distinction AliquotVisualization.js's own slice coloring uses.
function formatPreservationTypeLabel(preservationType) {
    return preservationType === 'Fixed' ? 'Fixed' : 'Frozen';
}

// Exported for unit testing. Pivots raw Tissue search results into a
// donor (external_id) x tissue_type matrix of values (as picked by
// `getValue`), plus a tissue_type -> Tissue Overview page href map (see the
// inline comment at its own build site below for that part's own rationale).
//
// `distributeGenericBrainValue` -- the generic "Brain" column is always
// hidden, but copying its value into the region-specific columns first (and
// merging same-value region columns in the row) is set `true` on all three
// tabs:
// - Ischemic Time/Autolysis Score are collection-event-level measurements
//   (assessed once per whole brain at procurement, not independently per
//   dissected region), so the generic value is an equally valid stand-in
//   and same-value regions merge for real.
// - Target Tissue % has nothing to distribute (BrainPathologyReport has no
//   target_tissues field at all -- see get_target_tissue_percentage's own
//   docstring -- so every brain region, generic column included, is
//   unconditionally null), but `true` still collapses what would otherwise
//   be 5 repeated "n/a" cells into one.
export const buildTissueMetricMatrix = (tissueResults = [], getValue, distributeGenericBrainValue = false) => {
    const tissueTypes = [];
    const donors = [];
    const cellsByDonorAndTissue = {};
    // Every candidate Tissue record's own {value, label, isPrimary} for a
    // (donor, tissue_type) key with more than one record -- absent
    // entirely for the (typical) single-record case, so a cell only pays
    // for the multi-value indicator/popover (see renderRowCells) when
    // there's actually something to disambiguate.
    const cellEntriesByDonorAndTissue = {};
    // A fixed [Fixed entry | null, Frozen entry | null] pair per (donor,
    // tissue_type) key with at least 1 real value -- unlike cellEntries
    // above (only as many entries as there are real, distinct-or-not
    // values, used for the popover/'inline' display), this always has
    // exactly 2 slots so a split cell (renderRowCells, splitByPreservationType)
    // can show "Fixed" and "Frozen" in the same fixed position every time,
    // one side reading "n/a" rather than the whole cell silently reverting
    // to a single value whenever only 1 preservation_type is actually
    // represented -- per explicit request that Fixed/Frozen's own
    // positions stay visually stable whether or not both sides have data.
    const cellSlotsByDonorAndTissue = {};
    const tissuesByKey = {};
    const tissueTypeHrefs = {};
    const tissueTypeCategories = {};

    tissueResults.forEach((t) => {
        const donorId = t?.donor?.external_id;
        const tissueType = t?.tissue_type;
        if (!donorId || !tissueType) return;
        if (!donors.includes(donorId)) donors.push(donorId);
        if (!tissueTypes.includes(tissueType)) tissueTypes.push(tissueType);
        if (!tissueTypeHrefs[tissueType]) {
            // The stable 4-letter internal code (e.g. "HART") reads as a real
            // identifier and makes a much shorter URL than the full raw
            // "<TPC code> - <name>" string -- falls back to the raw value
            // when no code is known (e.g. the generic "Brain" placeholder),
            // which tissue_overview.py still resolves via the legacy exact
            // match on `tissue_type`.
            const urlCode = getTissueInternalCodeFromFacetTerm(tissueType) || tissueType;
            tissueTypeHrefs[tissueType] = `/tissue-overview/?tissue_type=${formUrlEncode(urlCode)}`;
        }
        if (!tissueTypeCategories[tissueType] && t.category) tissueTypeCategories[tissueType] = t.category;

        const key = `${donorId} ${tissueType}`;
        (tissuesByKey[key] || (tissuesByKey[key] = [])).push(t);
    });

    Object.entries(tissuesByKey).forEach(([key, candidates]) => {
        const primary = pickPrimaryTissueRecord(candidates, getValue);
        cellsByDonorAndTissue[key] = getValue(primary) ?? null;
        // A record with no value for this metric isn't a real alternative
        // to disambiguate (just an empty record), so it's dropped here
        // rather than surfaced as "Frozen: n/a" noise -- but the single-
        // record case still gets an entry (shown on hover as a detail
        // popover, just without the corner flag, which is reserved for the
        // genuinely-competing-values case; see renderRowCells).
        const entriesWithValue = candidates
            .map((t) => {
                return {
                    value: getValue(t) ?? null,
                    label: formatPreservationTypeLabel(t.preservation_type),
                    isPrimary: t === primary,
                    externalId: t.external_id || null,
                };
            })
            .filter((entry) => entry.value !== null);
        if (entriesWithValue.length > 0) {
            // Primary listed first -- the popover otherwise reads in
            // whatever order these records happened to come back from the
            // search, not necessarily matching the cell's own shown value.
            cellEntriesByDonorAndTissue[key] = entriesWithValue.sort(
                (a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0)
            );
            cellSlotsByDonorAndTissue[key] = [
                entriesWithValue.find((entry) => entry.label === 'Fixed') || null,
                entriesWithValue.find((entry) => entry.label === 'Frozen') || null,
            ];
        }
    });

    // A generic "Brain" tissue_type carries no region of its own, so its own
    // column is always hidden here, on every tab. When distributeGenericBrainValue
    // is true (see the comment above where it's passed in), its value is
    // copied into whichever of the 5 region-specific columns
    // (BRCE/BRFL/BRHL/BRHR/BRTL) don't already have their own real value.
    const genericBrainTissueType = tissueTypes.find((t) => t.trim() === 'Brain');
    const brainRegionTissueTypes = tissueTypes.filter((t) =>
        BRAIN_REGION_INTERNAL_CODES.includes(getTissueInternalCodeFromFacetTerm(t))
    );
    if (genericBrainTissueType) {
        if (distributeGenericBrainValue) {
            donors.forEach((donorId) => {
                const genericKey = `${donorId} ${genericBrainTissueType}`;
                const genericValue = cellsByDonorAndTissue[genericKey];
                if (genericValue === null || typeof genericValue === 'undefined') return;
                brainRegionTissueTypes.forEach((regionTissueType) => {
                    const key = `${donorId} ${regionTissueType}`;
                    if (cellsByDonorAndTissue[key] === null || typeof cellsByDonorAndTissue[key] === 'undefined') {
                        cellsByDonorAndTissue[key] = genericValue;
                        if (cellEntriesByDonorAndTissue[genericKey]) {
                            cellEntriesByDonorAndTissue[key] = cellEntriesByDonorAndTissue[genericKey];
                        }
                        if (cellSlotsByDonorAndTissue[genericKey]) {
                            cellSlotsByDonorAndTissue[key] = cellSlotsByDonorAndTissue[genericKey];
                        }
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
            cellEntries: tissueTypes.map(
                (tissueType) => cellEntriesByDonorAndTissue[`${donor} ${tissueType}`] || null
            ),
            cellSlots: tissueTypes.map(
                (tissueType) => cellSlotsByDonorAndTissue[`${donor} ${tissueType}`] || null
            ),
        };
    });

    // Whether the brain region columns merge into one value on *every* row,
    // not just some -- gates whether the header itself collapses into one
    // "Brain" dropdown cell (BrainRegionHeaderCell) or stays 5 separate,
    // individually-headed columns (see renderColumnHeaderRows). A single
    // shared table header can't follow a per-row decision the way body
    // cells do, so it has to pick one or the other for the whole column
    // run -- and defaults to NOT merging (leaving every region separately
    // identifiable) unless every row actually agrees, since a merged
    // header over even one row of genuinely differing values would hide
    // which value belongs to which region.
    const brainColumnIndexes = brainRegionTissueTypes
        .map((tissueType) => tissueTypes.indexOf(tissueType))
        .filter((index) => index !== -1);
    const brainColumnsFullyMergeable =
        brainColumnIndexes.length > 1 &&
        matrix.every((row) => {
            const firstValue = row.cells[brainColumnIndexes[0]] ?? null;
            return brainColumnIndexes.every((index) => (row.cells[index] ?? null) === firstValue);
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
        brainColumnsFullyMergeable,
    };
};

const getIschemicTimeValue = (t) => t?.ischemic_time ?? null;
const getAutolysisScoreValue = (t) => t?.pathology_summary?.autolysis_score ?? null;
const getTargetTissuePercentageValue = (t) => t?.pathology_summary?.target_tissue_percentage ?? null;


function formatIschemicTime(value) {
    if (value === null || typeof value === 'undefined') return 'n/a';
    return `${value}`;
}

// Equal-width banding splits whatever Ischemic Time values are actually in
// this table into `bandCount` equal-width value ranges (not equal-*count*
// groups -- an earlier quantile-based version of this did that, but was
// switched away from after real use turned up the obvious complaint: two
// bands' colors can look identical in "how much darker" terms while one
// covers a 1-unit range and the other a 6-unit range, reading as an
// arbitrary/unfair cutoff rather than a real difference). This still keeps
// the color spread relative to this table's own actual values rather than a
// fixed, clinical-sounding threshold (real values cluster tightly, so a
// fixed scale leaves the heatmap showing little variation) -- it's just the
// *width* of each band, not the count of values in it, that's now equal.
//
// The width itself is computed off the `clipFraction`..`1 - clipFraction`
// quantiles, not the true min/max -- confirmed against real production data
// that a plain equal-width split has its own opposite failure mode: one
// genuine outlier (an apparent data-entry anomaly far below the rest) plus
// one small but genuinely-higher cluster (this table's own brain-region
// values) between them stretch the *whole* scale wide enough that the
// entire ordinary middle of the data -- the large majority of real
// cells -- collapses into a single band, reading as flatter/less
// informative than the original quantile version it replaced. Clipping the
// ends means the bulk of ordinary values still spread across the *whole*
// palette; the outer 2 bands become "below/above the Nth percentile"
// catch-alls instead of a single band each getting stretched by one
// far-out value. 5 bands (not 4) -- with only 4, the two darkest of them
// together always cover half the (clipped) value range by construction,
// reading as a heavier/darker table than the underlying spread actually
// warrants; a 5th band spreads that same total darkness across more,
// individually lighter steps.
//
// Exported for unit testing. Returns `classify` (the per-value -> CSS-class
// function every getScoreClass caller expects) alongside `thresholds` (the
// band boundary values themselves, ascending, `bandCount - 1` of them, each
// a clipped-quantile-derived value, not one of the raw data points) and the
// table's own true (unclipped) `min`/`max` -- not `thresholds`' own first/
// last entries -- so a caller rendering a legend states each outer band's
// real extent (down to/up to what's actually in the table), not just where
// its own clipped boundary happens to fall. Unlike Autolysis Score/Target
// Tissue %'s own fixed, self-explanatory bands, these are computed fresh
// from whatever's in the table and would otherwise be opaque.
export function buildRangeScoreClassifier(values, bandCount = 5, clipFraction = 0.05) {
    const sorted = values
        .filter((value) => typeof value === 'number' && Number.isFinite(value))
        .slice()
        .sort((a, b) => a - b);
    if (sorted.length === 0) {
        return { classify: () => 'na', thresholds: [] };
    }
    // Linear-interpolated quantile (same convention as numpy's default) --
    // exact index most of the time here since Ischemic Time datasets are
    // small, but avoids picking an arbitrary neighbor on datasets where it
    // doesn't land on a whole index.
    const quantile = (p) => {
        const index = (sorted.length - 1) * p;
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        if (lower === upper) return sorted[lower];
        return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
    };
    const clippedMin = quantile(clipFraction);
    const clippedMax = quantile(1 - clipFraction);
    const span = clippedMax - clippedMin;
    const thresholds = Array.from(
        { length: bandCount - 1 },
        (unused, i) => clippedMin + (span * (i + 1)) / bandCount
    );
    const classify = (value) => {
        if (value === null || typeof value === 'undefined') return 'na';
        // A value at or below clippedMin (or above every threshold, at or
        // beyond clippedMax) still lands correctly in the first/last band
        // here -- no separate clamping needed, since every threshold from
        // clippedMin up is already >= it, so the very first comparison
        // already succeeds.
        const bandIndex = thresholds.findIndex((threshold) => value <= threshold);
        return `score-${bandIndex === -1 ? bandCount - 1 : bandIndex}`;
    };
    return { classify, thresholds, min: sorted[0], max: sorted[sorted.length - 1] };
}

// Number formatting for legend range labels -- values here are already
// numbers (unlike the table's own formatValue, which also has to handle
// n/a), just trimmed to 1 decimal so a float-math threshold like
// 19.600000000000001 doesn't leak into the UI.
function formatScoreLegendValue(value) {
    return Number(value.toFixed(1)).toString();
}

// One legend entry per band -- {className, label} -- built from
// buildRangeScoreClassifier's own thresholds/min/max, empty when there
// were no real values to band in the first place (thresholds.length === 0
// covers both the "no data at all" and "bandCount <= 1" cases). Bounds
// each band by the table's own real min/max at the open ends instead of
// leaving them as "<= X"/"> Y", since a reader has no other way to tell
// whether that end is a hard cutoff or just wherever this table's data
// happened to stop.
function buildScoreLegend(scoring) {
    const { thresholds, min, max } = scoring;
    if (!thresholds || thresholds.length === 0) return [];
    const bounds = [min, ...thresholds, max];
    return bounds.slice(0, -1).map((lower, i) => {
        const upper = bounds[i + 1];
        return {
            className: `score-${i}`,
            label:
                lower === upper
                    ? formatScoreLegendValue(lower)
                    : `${formatScoreLegendValue(lower)}–${formatScoreLegendValue(upper)}`,
        };
    });
}

// A color swatch + its own value range per band, for a metric (like
// Ischemic Time) whose band boundaries are computed from the table's own
// data rather than a fixed, already-explained scale -- see
// buildScoreLegend. Renders nothing for a fixed-scale metric that doesn't
// pass one in.
export function ScoreLegend({ entries }) {
    if (!entries || entries.length === 0) return null;
    return (
        <div className="tissue-heatmap-score-legend">
            {entries.map((entry) => (
                <span className="tissue-heatmap-score-legend-item" key={entry.className}>
                    <span className={`tissue-heatmap-score-legend-swatch ${entry.className}`} />
                    {entry.label}
                </span>
            ))}
        </div>
    );
}

// A compact swatch-per-band scale for a metric whose bands are a small,
// fixed, already-self-explanatory set (Autolysis Score's 0=None..3=Severe;
// Target Tissue %'s own named percentage ranges) rather than data-driven
// quantiles computed fresh from this table's own values (see ScoreLegend
// above for that case). `leftCaption`/`rightCaption` label the scale's own
// two ends (e.g. "Minimal"/"Severe") for a metric whose bare band labels
// (plain numbers) wouldn't otherwise say which end means what; Target Tissue
// %'s own labels are already full percentage ranges, so it passes neither.
function FixedScoreLegend({ entries, leftCaption = null, rightCaption = null }) {
    if (!entries || entries.length === 0) return null;
    return (
        <div className="tissue-heatmap-fixed-legend">
            {leftCaption ? (
                <span className="tissue-heatmap-fixed-legend-caption">{leftCaption}</span>
            ) : null}
            <div className="tissue-heatmap-fixed-legend-scale">
                {entries.map((entry) => (
                    <span
                        key={entry.className}
                        className={`tissue-heatmap-fixed-legend-swatch ${entry.className}`}>
                        {entry.label}
                    </span>
                ))}
            </div>
            {rightCaption ? (
                <span className="tissue-heatmap-fixed-legend-caption">{rightCaption}</span>
            ) : null}
        </div>
    );
}

// Ischemic Time's own cells split into a Fixed half and a Frozen half (see
// splitByPreservationType/cellSlots in renderRowCells) instead of a single
// value -- unlike FixedScoreLegend below, there's no severity scale to
// explain here (each half is still colored by its own value's band, same
// score-0..4 palette as everywhere else), just which half of a split cell
// is which specimen type, so a reader knows before ever hovering one.
function SplitCellLegend() {
    return (
        <div className="tissue-heatmap-split-legend">
            <span className="tissue-heatmap-split-legend-swatch">
                <span className="tissue-heatmap-split-legend-half tissue-heatmap-split-legend-half-a">
                    Fixed
                </span>
                <span className="tissue-heatmap-split-legend-half tissue-heatmap-split-legend-half-b">
                    Frozen
                </span>
            </span>
        </div>
    );
}

// Same score-0..3 swatch colors getAutolysisScoreClass applies to the cells
// themselves.
const AUTOLYSIS_SCORE_LEGEND_ENTRIES = [0, 1, 2, 3].map((value) => {
    return { className: `score-${value}`, label: String(value) };
});

// Target Tissue %'s own fixed bands (TARGET_TISSUE_PERCENTAGE_ORDER),
// reordered lightest-to-darkest to match getTargetTissuePercentageScoreClass's
// inverted band index -- higher target-tissue presence reads as the
// lighter, "better" end of the scale, same direction Autolysis Score's
// 0=None does. Labels match formatTargetTissuePercentage's own formatting
// exactly, so the legend's swatches read as the same vocabulary as the
// cells they're explaining.
const TARGET_TISSUE_PERCENTAGE_LEGEND_ENTRIES = TARGET_TISSUE_PERCENTAGE_ORDER.map(
    (label, index) => {
        return {
            className: `score-${TARGET_TISSUE_PERCENTAGE_ORDER.length - 1 - index}`,
            label: label === '0' ? '0%' : label,
        };
    }
).reverse();

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

// Target Tissue % cell values are ordered band strings (e.g. "[26-49]"),
// not numbers -- MetricHeatmapTable's default sort-value extractor
// (defaultGetSortValue) only handles plain numbers, so this tab needs its
// own override ranking bands by their real order (not alphabetically).
function getTargetTissuePercentageSortValue(value) {
    const index = TARGET_TISSUE_PERCENTAGE_ORDER.indexOf(value);
    return index === -1 ? null : index;
}

// --- Experimental: user-customizable conditional-color palette ---------
// Lets anyone pick a base color (a curated preset or a free color-wheel
// pick) and generates a 4-step light->dark sequential scale from it.
// Deliberately not persisted anywhere -- a pick only lasts for the current
// page view and always starts back at the default on the next load; it's
// in-memory-only, so it can't affect what other users see. "Reset" clears
// the override and falls back to the hardcoded default scale in
// _search.scss.

// Each preset is just a single base hue -- buildSequentialPaletteFromHex
// below turns it into the actual 4-step scale, same as a free color-wheel
// pick, so every preset is guaranteed to follow the same light->dark
// construction (no hand-tuned-then-drifted swatches to keep in sync).
export const HEATMAP_COLOR_PRESETS = [
    // Default scale (see _search.scss's .score-0..4 fallback values) --
    // listed here too so it's reachable by name after picking something else.
    // "Sky" is RGB(77, 207, 255), converted to hex, per explicit request.
    // ("Steel", "Indigo", "Teal", "Slate" and "Ocean" were each the default
    // before this; kept reachable below for anyone who preferred one of them.)
    { name: 'Sky', hex: '#4DCFFF' },
    { name: 'Steel', hex: '#4D7C8D' },
    { name: 'Indigo', hex: '#464AA0' },
    { name: 'Teal', hex: '#2F8F83' },
    { name: 'Slate', hex: '#5B6670' },
    { name: 'Ocean', hex: '#22528E' },
    { name: 'Purple', hex: '#7C6BA6' },
    { name: 'Amber', hex: '#C08A2E' },
    { name: 'Rose', hex: '#B5657A' },
    { name: 'Forest', hex: '#4F7A5B' },
];

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex) {
    const clean = String(hex || '').replace('#', '');
    return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
}

function rgbToHex([r, g, b]) {
    return `#${[r, g, b]
        .map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0'))
        .join('')}`;
}

function rgbToHsl([r, g, b]) {
    const rN = r / 255;
    const gN = g / 255;
    const bN = b / 255;
    const max = Math.max(rN, gN, bN);
    const min = Math.min(rN, gN, bN);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    const d = max - min;
    if (d !== 0) {
        s = d / (1 - Math.abs(2 * l - 1));
        if (max === rN) h = ((gN - bN) / d) % 6;
        else if (max === gN) h = (bN - rN) / d + 2;
        else h = (rN - gN) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    return [h, s * 100, l * 100];
}

function hslToRgb(h, s, l) {
    const sN = s / 100;
    const lN = l / 100;
    const c = (1 - Math.abs(2 * lN - 1)) * sN;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lN - c / 2;
    let seg = [0, 0, 0];
    if (h < 60) seg = [c, x, 0];
    else if (h < 120) seg = [x, c, 0];
    else if (h < 180) seg = [0, c, x];
    else if (h < 240) seg = [0, x, c];
    else if (h < 300) seg = [x, 0, c];
    else seg = [c, 0, x];
    return seg.map((v) => (v + m) * 255);
}

// Lightness stops per band count -- 4 for a fixed-scale metric (Autolysis
// Score's own 0-3 levels, and TissueTypeView's identical-shaped Donor
// Details palette), 5 for Target Tissue %'s 5 real bands (TARGET_TISSUE_
// PERCENTAGE_ORDER) and Ischemic Time's own quintile split
// (buildRangeScoreClassifier) -- kept as explicit per-count arrays
// (not one interpolated formula) so the existing 4-stop palette's exact
// values -- already the CSS default fallback and every earlier preset pick
// -- don't shift by rounding error just because a 5-stop caller exists now.
const LIGHTNESS_STEPS_BY_BAND_COUNT = {
    4: [88, 72, 50, 32],
    // Originally 90/75/60/45/30 (uniform 15pt gaps) -- raised to a lighter
    // floor after real Ischemic Time data showed a table can be genuinely
    // dominated by values landing in the 2 darkest bands (many tissue
    // types cluster there for most donors), reading as an overly dark/
    // heavy table even though the banding itself was working as designed.
    // An earlier attempt only lightened the last 2 stops (leaving 90/75/60
    // alone), which uniformly-spaced-eyeball this isn't: it *shrank* the
    // gap between the 2 darkest bands specifically (down to 10-12pts vs.
    // 15pt everywhere else), making exactly those 2 -- the ones a skewed
    // table shows the most of -- the hardest pair to tell apart. Kept
    // uniform 12pt gaps across all 5 stops instead, so every band-to-band
    // step reads as an equally perceptible jump; this doesn't change which
    // band a value falls into, just how dark that band's color reads.
    5: [90, 78, 66, 54, 42],
};

// Exported for unit testing. Fixed saturation curve (clamped so a very
// dull or very neon input hue still lands in a reasonable range) -- only
// the hue actually comes from `baseHex`, so every generated scale keeps
// the same light->dark "feel" regardless of which color was picked.
export function buildSequentialPaletteFromHex(baseHex, bandCount = 4) {
    const [h, rawSaturation] = rgbToHsl(hexToRgb(baseHex));
    const saturation = clamp(rawSaturation, 28, 46);
    const lightnessSteps = LIGHTNESS_STEPS_BY_BAND_COUNT[bandCount] || LIGHTNESS_STEPS_BY_BAND_COUNT[4];
    return lightnessSteps.map((lightness) => {
        const bg = rgbToHex(hslToRgb(h, saturation, lightness));
        // Same threshold direction as the hardcoded default scale (light
        // bands get dark text, the darkest band or two get white text).
        const text = lightness > 58 ? '#28323C' : '#FFFFFF';
        return { bg, text };
    });
}

// Presets + native color-wheel + reset -- the actual picker UI, with no
// button/open-state of its own (the caller renders and owns that, and
// decides what closing means -- see HeatmapColorPicker below, reused
// standalone by TissueTypeView.js's own Donor Details table, and
// HeatmapAdminSettings' combined panel further down, which folds this in
// alongside the cell-value-display toggle instead of giving it a second,
// separate toggle button in the same toolbar).
function ColorPickerPanelBody({ baseHex, onPick, onReset, onDone }) {
    return (
        <>
            <p className="tissue-heatmap-color-picker-note">
                Experimental -- resets to default on page reload,
                and doesn&rsquo;t change what other users see.
            </p>
            <div className="tissue-heatmap-color-picker-presets">
                {HEATMAP_COLOR_PRESETS.map((preset) => (
                    <button
                        type="button"
                        key={preset.name}
                        className={
                            'tissue-heatmap-color-picker-preset' +
                            (baseHex === preset.hex ? ' is-active' : '')
                        }
                        style={{ backgroundColor: preset.hex }}
                        title={preset.name}
                        aria-label={preset.name}
                        onClick={() => {
                            onPick(preset.hex);
                            onDone();
                        }}
                    />
                ))}
                <label
                    className="tissue-heatmap-color-picker-preset tissue-heatmap-color-picker-custom"
                    title="Pick a custom color">
                    <input
                        type="color"
                        value={baseHex || '#4DCFFF'}
                        // eslint-disable-next-line react/jsx-no-bind
                        onChange={(event) => onPick(event.target.value)}
                    />
                </label>
            </div>
            <button
                type="button"
                className="tissue-heatmap-color-picker-reset"
                onClick={() => {
                    onReset();
                    onDone();
                }}>
                Reset to default
            </button>
        </>
    );
}

// A small button + panel for picking the base color above -- presets on
// the left, a native color-wheel input for anything else, and a reset back
// to the built-in default. Closes on an outside click/Escape like any
// other lightweight dropdown; deliberately not react-bootstrap's Overlay
// machinery since this doesn't need to track a scrolling anchor.
export function HeatmapColorPicker({ baseHex, onPick, onReset }) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return undefined;
        function handleOutsideEvent(event) {
            if (event.type === 'keydown' && event.key !== 'Escape') return;
            if (event.type === 'mousedown' && containerRef.current?.contains(event.target)) {
                return;
            }
            setIsOpen(false);
        }
        document.addEventListener('mousedown', handleOutsideEvent);
        document.addEventListener('keydown', handleOutsideEvent);
        return () => {
            document.removeEventListener('mousedown', handleOutsideEvent);
            document.removeEventListener('keydown', handleOutsideEvent);
        };
    }, [isOpen]);

    return (
        <div className="tissue-heatmap-color-picker" ref={containerRef}>
            <button
                type="button"
                className="tissue-heatmap-color-picker-toggle"
                onClick={() => setIsOpen((prev) => !prev)}
                aria-expanded={isOpen}
                title="Customize conditional color (this browser only)">
                <span
                    className="tissue-heatmap-color-picker-swatch"
                    style={baseHex ? { backgroundColor: baseHex } : undefined}
                />
                Colors
            </button>
            {isOpen ? (
                <div className="tissue-heatmap-color-picker-panel">
                    <ColorPickerPanelBody
                        baseHex={baseHex}
                        onPick={onPick}
                        onReset={onReset}
                        // eslint-disable-next-line react/jsx-no-bind
                        onDone={() => setIsOpen(false)}
                    />
                </div>
            ) : null}
        </div>
    );
}

// The 4 ways a multi-value cell can be shown -- all reachable from the same
// admin toggle (HeatmapAdminSettings below) so test users can be switched
// between them to compare, per explicit request after the plain "/"-joined
// text (`inline`) wasn't well received on its own. `inline` stays the
// fallback for any cell a split mode (`diagonal`/`vertical`) can't actually
// render as a split -- see renderRowCells' `isSplitMode` -- so every mode
// still satisfies the original review requirement (every real value visible
// with no hover/click) except `hover`, which deliberately opts back into
// the pre-review corner-flag + popover behavior for whoever prefers it.
const CELL_VALUE_DISPLAY_MODES = [
    { key: 'inline', label: 'All values' },
    { key: 'diagonal', label: 'Diagonal split' },
    { key: 'vertical', label: 'Vertical split' },
    { key: 'hover', label: 'On hover' },
];

// BrowseTissueHeatmapTable's own toolbar bundles 2 admin-only, experimental,
// browser-only display overrides -- which values a multi-record cell shows
// (CELL_VALUE_DISPLAY_MODES above) and the conditional-color palette
// (ColorPickerPanelBody/HeatmapColorPicker above). Two separate always-
// visible toggle rows read as visual clutter in the tab row (see the review
// screenshot this responds to), so both live behind one gear button/panel
// instead -- same "icon-gear" FontAwesome glyph DataMatrixConfigurator.js
// already uses for its own admin-only control.
function HeatmapAdminSettings({
    cellValueDisplayMode,
    onChangeCellValueDisplayMode,
    baseHex,
    onPickColor,
    onResetColor,
}) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return undefined;
        function handleOutsideEvent(event) {
            if (event.type === 'keydown' && event.key !== 'Escape') return;
            if (event.type === 'mousedown' && containerRef.current?.contains(event.target)) {
                return;
            }
            setIsOpen(false);
        }
        document.addEventListener('mousedown', handleOutsideEvent);
        document.addEventListener('keydown', handleOutsideEvent);
        return () => {
            document.removeEventListener('mousedown', handleOutsideEvent);
            document.removeEventListener('keydown', handleOutsideEvent);
        };
    }, [isOpen]);

    return (
        <div className="tissue-heatmap-admin-settings" ref={containerRef}>
            <button
                type="button"
                className="tissue-heatmap-admin-settings-toggle"
                onClick={() => setIsOpen((prev) => !prev)}
                aria-expanded={isOpen}
                title="Admin display settings (this browser only)">
                <i className="icon icon-fw icon-gear fas" />
            </button>
            {isOpen ? (
                <div className="tissue-heatmap-admin-settings-panel">
                    <div className="tissue-heatmap-admin-settings-section">
                        <p className="tissue-heatmap-admin-settings-label">Cell values</p>
                        <div
                            className="tissue-heatmap-value-display-toggle"
                            role="group"
                            aria-label="Multi-value cell display">
                            {CELL_VALUE_DISPLAY_MODES.map((mode) => (
                                <button
                                    type="button"
                                    key={mode.key}
                                    className={
                                        'tissue-heatmap-value-display-toggle-option' +
                                        (cellValueDisplayMode === mode.key ? ' is-active' : '')
                                    }
                                    // eslint-disable-next-line react/jsx-no-bind
                                    onClick={() => onChangeCellValueDisplayMode(mode.key)}>
                                    {mode.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="tissue-heatmap-admin-settings-divider" />
                    <div className="tissue-heatmap-admin-settings-section">
                        <p className="tissue-heatmap-admin-settings-label">Conditional color</p>
                        <ColorPickerPanelBody
                            baseHex={baseHex}
                            onPick={onPickColor}
                            onReset={onResetColor}
                            // eslint-disable-next-line react/jsx-no-bind
                            onDone={() => setIsOpen(false)}
                        />
                    </div>
                </div>
            ) : null}
        </div>
    );
}

// True only when this cell's entries actually disagree on value -- most
// multi-record cells turn out to be several physical records (e.g. a Fixed
// and a Frozen specimen) that just happen to carry the identical number
// (often a single donor-level constant duplicated per organ). Flagging
// those too meant the corner indicator lit up on nearly every cell in a
// real table, which is exactly the "too many things demanding attention at
// once" complaint it was meant to solve, not help with -- so the flag is
// reserved for cells where hovering would actually surface a different
// number, not just a different source record for the same one.
function hasDistinctAltValues(entries) {
    if (!entries || entries.length < 2) return false;
    return entries.some((entry) => entry.value !== entries[0].value);
}

// De-duplicated entry values, primary-first order preserved (Set keeps
// first-occurrence order, and entries are already sorted primary-first --
// see buildTissueMetricMatrix) -- e.g. an organ with a Fixed and a Frozen
// record that happen to carry the identical number shows once ("23.5"),
// not as a redundant "23.5 / 23.5". A real, informative disagreement (the
// donor-level Frozen ischemic_time constant differing from an organ-
// specific Fixed value) still shows both.
function distinctEntryValues(entries) {
    if (!entries) return [];
    const seen = new Set();
    const result = [];
    entries.forEach((entry) => {
        if (seen.has(entry.value)) return;
        seen.add(entry.value);
        result.push(entry.value);
    });
    return result;
}

function heatmapCellClassName(value, getScoreClass, enableConditionalColor, isRowSegment, isColumnSegment, entries) {
    return (
        'tissue-heatmap-cell' +
        (enableConditionalColor ? ` ${getScoreClass(value)}` : '') +
        // Muted styling for "no data" cells is plain typography (grey vs.
        // dark text), not the score-band heatmap coloring
        // enableConditionalColor gates -- keeps real values legible against
        // empty ones either way.
        (value === null || typeof value === 'undefined' ? ' is-empty' : '') +
        // See renderRowCells' own comment on hoveredCellPosition for what
        // these 2 mean and why they're 2 separate classes, not 1.
        (isRowSegment ? ' is-row-highlight' : '') +
        (isColumnSegment ? ' is-column-highlight' : '') +
        // Excel-style corner flag -- reserved for cells where the alternate
        // record(s) actually carry a different value (see
        // hasDistinctAltValues above), not just any multi-record cell. A
        // same-value multi-record cell still shows the full detail popover
        // on hover (MetricHeatmapTable's hoverDetail) -- it's just not
        // flagged, since there's nothing there worth drawing the eye to.
        (hasDistinctAltValues(entries) ? ' has-alt-values' : '')
    );
}

// A rough upper bound on the popover's own rendered height (header + up to
// a couple of entry rows in the common case) -- just needs to be generous
// enough that flipping the decision based on it never lands the popover
// past the viewport edge it was trying to avoid in the first place; a few
// px of unused space above/below on an unusually short popover is harmless.
const DETAIL_POPOVER_ESTIMATED_HEIGHT = 160;

// `position: fixed` inline style for the detail popover, anchored off the
// hovered cell's own live `getBoundingClientRect()` (see MetricHeatmapTable's
// handleShowDetail) -- opens below-right of the cell by default, flipping
// to open upward when there isn't estimated room below in the *viewport*
// (not just the table), same reasoning `.tissue-heatmap-sticky-header`
// already applies to the header itself. Returns `isFlippedUp` alongside
// the style so the caller can also flip the popover's own arrow to match.
function getDetailPopoverStyle(rect) {
    const isFlippedUp = rect.bottom + DETAIL_POPOVER_ESTIMATED_HEIGHT + 10 > window.innerHeight;
    return {
        isFlippedUp,
        style: {
            position: 'fixed',
            right: window.innerWidth - rect.right,
            ...(isFlippedUp
                ? { bottom: window.innerHeight - rect.top + 10 }
                : { top: rect.bottom + 10 }),
        },
    };
}

// Backing Tissue record(s) for the currently-hovered cell -- see
// buildTissueMetricMatrix's cellEntries and MetricHeatmapTable's
// hoverDetail/handleShowDetail for why this renders `position: fixed` at a
// JS-computed spot rather than as a plain CSS :hover-revealed descendant of
// the cell. The header names the column's own tissue_type (e.g. "Brain,
// Cerebellum") rather than a generic "Tissue record" -- this can pop up
// under a merged "Brain" header (see renderHeaderCells) where no other
// visible label ties a given column back to which region it actually is.
// `metricLabel` (the current tab's own name, e.g. "Autolysis Score") is
// shown too -- the value itself is otherwise unlabeled here, and this same
// popover renders identically across all 3 tabs, so nothing else in it
// says which metric a bare "2" is even measuring.
function renderCellAltValues(entries, tissueType, metricLabel, formatValue, style, isFlippedUp) {
    if (!entries) return null;
    return (
        <div
            className={'tissue-heatmap-cell-alt-values' + (isFlippedUp ? ' is-flipped-up' : '')}
            style={style}>
            <div className="tissue-heatmap-cell-alt-values-header">
                <div className="tissue-heatmap-cell-alt-values-tissue">
                    {formatTissueTypeLabel(tissueType)}
                </div>
                {metricLabel ? (
                    <div className="tissue-heatmap-cell-alt-values-metric">{metricLabel}</div>
                ) : null}
            </div>
            {entries.map((entry, i) => (
                <div
                    key={i}
                    className={'tissue-heatmap-cell-alt-values-row' + (entry.isPrimary ? ' is-primary' : '')}>
                    <span className="tissue-heatmap-cell-alt-values-id">
                        {entry.label ? (
                            <span className="tissue-heatmap-cell-alt-values-tag">{entry.label}</span>
                        ) : null}
                        {entry.externalId ? (
                            <span className="tissue-heatmap-cell-alt-values-extid">{entry.externalId}</span>
                        ) : null}
                    </span>
                    <span className="tissue-heatmap-cell-alt-values-value">{formatValue(entry.value)}</span>
                </div>
            ))}
        </div>
    );
}

// One row's cells, merging a consecutive run of `mergeableTissueTypes`
// columns that share the exact same value (e.g. the brain regions a
// generic "Brain" value was distributed into, see buildTissueMetricMatrix)
// into a single spanning <td> instead of repeating that value once per
// column -- but ONLY when `brainColumnsFullyMergeable` says *every* row in
// the whole table agrees, matching the header's own merge condition
// exactly (renderHeaderCells). An earlier version merged per-row instead
// (any row whose own values happened to be equal, regardless of whether
// every other row did too), which -- confirmed against a real donor whose
// brain regions genuinely differ (e.g. distinct per-region Autolysis
// Score) -- read as an arbitrary mix of merged and unmerged rows all under
// the same *unmerged* header, since 1 disagreeing row was enough to keep
// the header itself split. Gating both on the same table-wide flag means
// it's now all-or-nothing: either every row's brain columns merge under a
// merged header, or none of them do and every row shows all 5 regions
// individually, even a row whose own values happen to coincide.
//
// `hoveredColumn`/`hoveredCellPosition`/`onHoverCell` -- "L-shaped" hover
// guides (per explicit request): hovering a cell highlights only the
// portion of its row to its left/at it, and the portion of its column
// above/at it -- not the *entire* row and *entire* column, which read as a
// distracting "+" cross running through the hovered cell. `hoveredColumn`
// (a tissue_type, matched via `columnTissueTypes.includes`, unchanged from
// before) still identifies which column is active at all, including from
// the *header* itself (which has no row to draw an "L" from -- hovering a
// header still lights up its whole column, top to bottom, same as always).
// `hoveredCellPosition` (`{ rowIndex, columnIndex } | null`, set only when
// the hover actually originates from a *body* cell, see
// MetricHeatmapTable's handleHoverBodyCell) is what turns that into an L
// instead of a cross for that case specifically:
// - Row segment: only cells in `hoveredCellPosition.rowIndex`'s own row,
//   at or before `hoveredCellPosition.columnIndex`.
// - Column segment: only cells in the hovered column, at or before
//   `hoveredCellPosition.rowIndex` -- or every row, when
//   `hoveredCellPosition` is null (a header hover), preserving that
//   whole-column behavior.
// The row's own left "edge" -- .tissue-heatmap-donor-id -- doesn't need
// any of this: it's always positioned before every data column, so it's
// always part of the row segment once its own row is hovered at all,
// which a plain `tbody tr:hover` (_search.scss) already covers with no JS.
//
// `cellValueDisplayMode` -- see CELL_VALUE_DISPLAY_MODES/HeatmapAdminSettings.
// `'inline'` (the default) writes every real value for a multi-record cell
// inline, "/"-separated (entries are already primary-first, see
// buildTissueMetricMatrix), no corner flag. `'diagonal'`/`'vertical'` render
// a genuinely split cell instead -- one half per value. `'hover'` shows
// only the primary value plus the corner flag instead. In every mode, the
// detail popover (renderCellAltValues, wired up by the caller via
// onShowDetail/onHideDetail) still opens on hover -- with every value
// already visible without hovering in every mode but `'hover'` itself,
// this is just an optional way to see which record each value actually
// came from, not a requirement to see the data.
//
// `cellSlots`/`splitByPreservationType` -- per explicit request, Ischemic
// Time's split modes always show a Fixed half and a Frozen half in the
// same fixed position, even when only 1 of the 2 actually has a value
// (the other reads "n/a") -- unlike the general case below (distinct
// *values*, not fixed *slots*), where a cell with only 1 real value can't
// split at all, and one with 3+ distinct values (e.g. Autolysis Score's
// own real 3-target-cell-subtype case) has nowhere to put a 3rd half, so
// both fall back to the same "/"-joined text `'inline'` uses rather than
// silently dropping a value. `splitByPreservationType` (true only for
// Ischemic Time, see BrowseTissueHeatmapTable) switches which of those 2
// rules a `'diagonal'`/`'vertical'` cell follows; `cellSlots` (built by
// buildTissueMetricMatrix, always exactly
// `[Fixed entry | null, Frozen entry | null]`) is only read when it does.
function renderRowCells(cells, cellEntries, cellSlots, tissueTypes, mergeableTissueTypes, brainColumnsFullyMergeable, formatValue, getScoreClass, enableConditionalColor, rowIndex, hoveredColumn, hoveredCellPosition, onHoverCell, onHoverEnd, onShowDetail, onHideDetail, cellValueDisplayMode, splitByPreservationType) {
    const nodes = [];
    let i = 0;
    while (i < cells.length) {
        const tissueType = tissueTypes[i];
        const value = cells[i];
        const entries = cellEntries?.[i] || null;
        const columnIndex = i;
        let span = 1;
        // Merging this row's own run of equal-valued brain columns only
        // when `brainColumnsFullyMergeable` says *every* row agrees keeps
        // this consistent with the header's own merge decision
        // (renderHeaderCells) -- without this gate, a row that happens to
        // have equal values merges into one wide cell even while the
        // header (and other rows that disagree, e.g. one donor's real
        // per-region autolysis scores) stays split into individual
        // columns, which reads as an inconsistent, seemingly arbitrary mix
        // of merged and unmerged rows under the same unmerged header.
        if (brainColumnsFullyMergeable && mergeableTissueTypes.has(tissueType)) {
            while (
                i + span < cells.length &&
                mergeableTissueTypes.has(tissueTypes[i + span]) &&
                cells[i + span] === value
            ) {
                span += 1;
            }
        }
        const columnTissueTypes = tissueTypes.slice(i, i + span);
        const isHoverMode = cellValueDisplayMode === 'hover';
        const distinctValues = isHoverMode ? [] : distinctEntryValues(entries);
        const isSplitLayout = cellValueDisplayMode === 'diagonal' || cellValueDisplayMode === 'vertical';
        const slots = splitByPreservationType ? cellSlots?.[i] || null : null;
        const isSplitMode = isSplitLayout && (splitByPreservationType ? slots !== null : distinctValues.length === 2);
        // Fixed-first, matching cellEntries' own primary-first ordering
        // (buildTissueMetricMatrix prefers Fixed as primary) -- either
        // side can be `null` here (shown as "n/a" below) when
        // splitByPreservationType and only 1 side has a real value.
        const splitValues = splitByPreservationType
            ? [slots?.[0]?.value ?? null, slots?.[1]?.value ?? null]
            : distinctValues;
        const showsAllValuesInline = !isHoverMode && !isSplitMode && distinctValues.length > 1;
        const isRowSegment =
            hoveredCellPosition !== null &&
            hoveredCellPosition.rowIndex === rowIndex &&
            columnIndex <= hoveredCellPosition.columnIndex;
        const isColumnSegment =
            columnTissueTypes.includes(hoveredColumn) &&
            (hoveredCellPosition === null || rowIndex <= hoveredCellPosition.rowIndex);

        const className = isSplitMode
            ? 'tissue-heatmap-cell tissue-heatmap-cell-split' +
              ` tissue-heatmap-cell-split-${cellValueDisplayMode}` +
              (isRowSegment ? ' is-row-highlight' : '') +
              (isColumnSegment ? ' is-column-highlight' : '')
            : heatmapCellClassName(
                value,
                getScoreClass,
                enableConditionalColor,
                isRowSegment,
                isColumnSegment,
                isHoverMode ? entries : null
            );

        nodes.push(
            <td
                key={tissueType}
                colSpan={span > 1 ? span : undefined}
                className={className}
                // eslint-disable-next-line react/jsx-no-bind
                onMouseEnter={(event) => {
                    onHoverCell(tissueType, rowIndex, columnIndex);
                    onShowDetail(event.currentTarget, entries, tissueType);
                }}
                // eslint-disable-next-line react/jsx-no-bind
                onMouseLeave={() => {
                    onHoverEnd();
                    onHideDetail();
                }}>
                {isSplitMode ? (
                    <>
                        <span
                            className={
                                'tissue-heatmap-cell-split-half tissue-heatmap-cell-split-half-a' +
                                (splitValues[0] === null
                                    ? ' is-empty'
                                    : enableConditionalColor
                                        ? ` ${getScoreClass(splitValues[0])}`
                                        : '')
                            }>
                            {formatValue(splitValues[0])}
                        </span>
                        <span
                            className={
                                'tissue-heatmap-cell-split-half tissue-heatmap-cell-split-half-b' +
                                (splitValues[1] === null
                                    ? ' is-empty'
                                    : enableConditionalColor
                                        ? ` ${getScoreClass(splitValues[1])}`
                                        : '')
                            }>
                            {formatValue(splitValues[1])}
                        </span>
                        {cellValueDisplayMode === 'diagonal' ? (
                            // A CSS `linear-gradient(to bottom right, ...)`
                            // hard-stop was tried here first for the
                            // dividing line -- it looked like a mismatched
                            // double line/zigzag against a real (non-
                            // square) column width. Root cause: a "to
                            // corner" gradient's hard-stop is a line
                            // perpendicular to the TL->BR axis through the
                            // box's center, not the literal TL/BR-corner
                            // diagonal itself -- those 2 lines only
                            // coincide when the box is a square. The 2
                            // <span> halves' own `clip-path` polygons don't
                            // have this problem (percentage vertices
                            // stretch with the box exactly like this SVG's
                            // `preserveAspectRatio="none"` viewBox does),
                            // so this SVG line -- not a gradient -- is what
                            // actually traces the same diagonal the 2
                            // halves are cut along, at any column width.
                            <svg
                                className="tissue-heatmap-cell-split-divider"
                                viewBox="0 0 100 100"
                                preserveAspectRatio="none"
                                aria-hidden="true">
                                <line x1="0" y1="100" x2="100" y2="0" vectorEffect="non-scaling-stroke" />
                            </svg>
                        ) : null}
                    </>
                ) : showsAllValuesInline ? (
                    distinctValues.map((v) => formatValue(v)).join(' / ')
                ) : (
                    formatValue(value)
                )}
            </td>
        );
        i += span;
    }
    return nodes;
}

// Shared by every individual tissue_type column header -- ordinary columns
// always, brain regions too whenever they're not merged into one "Brain"
// header (see renderHeaderCells/BrainRegionHeaderCell) -- so a region still
// gets this same code+name link and sort button on its own whenever its
// value can't be safely summarized under the shared label.
function IndividualTissueTypeHeaderLabel({ tissueType, tissueTypeHrefs, sortState, handleHeaderClick }) {
    return (
        <>
            {tissueTypeHrefs[tissueType] ? (
                <a href={tissueTypeHrefs[tissueType]}>{formatTissueTypeHeaderLabel(tissueType)}</a>
            ) : (
                formatTissueTypeHeaderLabel(tissueType)
            )}
            <SortableHeaderLabel
                label=""
                sortDirection={sortState?.key === tissueType ? sortState.direction : null}
                // eslint-disable-next-line react/jsx-no-bind
                onClick={() => handleHeaderClick(tissueType)}
            />
        </>
    );
}

// Header cell for a run of merged brain-region columns -- only rendered
// when buildTissueMetricMatrix's brainColumnsFullyMergeable says every
// row's regions actually agree (see renderHeaderCells); a merged header
// over even one row of genuinely differing values would hide which value
// belongs to which region. This is a *synthetic* "Brain" label, distinct
// from the real (always-hidden) generic "Brain" tissue_type column
// buildTissueMetricMatrix drops -- there's no single tissue_type this
// header could link to, so clicking it opens a small picker of the real
// regions instead of navigating directly, trading one click for still
// reaching a real tissue-overview page. Same outside-click-to-close
// pattern as HeatmapColorPicker above.
function BrainRegionHeaderCell({ regionTissueTypes, tissueTypeHrefs, sortState, handleHeaderClick }) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);
    // Every row's regions agree here (that's what made this mergeable), so
    // sorting by any one of the 5 is equivalent to sorting by "Brain" as a
    // whole -- the first region is an arbitrary but stable choice.
    const [sortKey] = regionTissueTypes;

    useEffect(() => {
        if (!isOpen) return undefined;
        function handleOutsideEvent(event) {
            if (event.type === 'keydown' && event.key !== 'Escape') return;
            if (event.type === 'mousedown' && containerRef.current?.contains(event.target)) {
                return;
            }
            setIsOpen(false);
        }
        document.addEventListener('mousedown', handleOutsideEvent);
        document.addEventListener('keydown', handleOutsideEvent);
        return () => {
            document.removeEventListener('mousedown', handleOutsideEvent);
            document.removeEventListener('keydown', handleOutsideEvent);
        };
    }, [isOpen]);

    return (
        <div className="tissue-heatmap-brain-picker" ref={containerRef}>
            <button
                type="button"
                className="tissue-heatmap-brain-picker-toggle"
                onClick={() => setIsOpen((prev) => !prev)}
                aria-expanded={isOpen}
                title="Brain -- pick a region to view its own Tissue Overview page">
                Brain
                <i className={`icon icon-fw fas ${isOpen ? 'icon-caret-up' : 'icon-caret-down'}`} />
            </button>
            <SortableHeaderLabel
                label=""
                sortDirection={sortState?.key === sortKey ? sortState.direction : null}
                // eslint-disable-next-line react/jsx-no-bind
                onClick={() => handleHeaderClick(sortKey)}
            />
            {isOpen ? (
                <ul className="tissue-heatmap-brain-picker-panel">
                    {regionTissueTypes.map((tissueType) => {
                        // Same 4-letter code convention every other column
                        // header already shows (formatTissueTypeHeaderLabel) --
                        // added here too so a region picked from this list
                        // reads as the same identity as its own (now-hidden,
                        // merged-away) column would have.
                        const code = getTissueInternalCodeFromFacetTerm(tissueType);
                        const label = (
                            <>
                                {code ? <span className="tissue-heatmap-brain-picker-code">{code}</span> : null}
                                {formatTissueTypeLabel(tissueType)}
                            </>
                        );
                        return (
                            <li key={tissueType}>
                                {tissueTypeHrefs[tissueType] ? (
                                    <a href={tissueTypeHrefs[tissueType]}>{label}</a>
                                ) : (
                                    label
                                )}
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </div>
    );
}

// Header-row counterpart to renderRowCells above. A run of
// `mergeableTissueTypes` columns (the 5 brain regions) only collapses into
// one shared "Brain" header (BrainRegionHeaderCell) when
// `mergeBrainHeader` says every row's regions actually agree (see
// buildTissueMetricMatrix's brainColumnsFullyMergeable) -- otherwise each
// region keeps its own individual header (IndividualTissueTypeHeaderLabel),
// same as any other column, so a value can always be traced back to the
// region it belongs to.
function renderHeaderCells(tissueTypes, mergeableTissueTypes, mergeBrainHeader, tissueTypeHrefs, sortState, handleHeaderClick, hoveredColumn, onHoverColumn) {
    const nodes = [];
    let i = 0;
    while (i < tissueTypes.length) {
        const tissueType = tissueTypes[i];
        if (mergeableTissueTypes.has(tissueType) && mergeBrainHeader) {
            const regionTissueTypes = [tissueType];
            let span = 1;
            while (
                i + span < tissueTypes.length &&
                mergeableTissueTypes.has(tissueTypes[i + span])
            ) {
                regionTissueTypes.push(tissueTypes[i + span]);
                span += 1;
            }
            nodes.push(
                <th
                    key={tissueType}
                    colSpan={span > 1 ? span : undefined}
                    title="Brain"
                    className={regionTissueTypes.includes(hoveredColumn) ? 'is-column-highlight' : undefined}
                    // eslint-disable-next-line react/jsx-no-bind
                    onMouseEnter={() => onHoverColumn(tissueType)}
                    // eslint-disable-next-line react/jsx-no-bind
                    onMouseLeave={() => onHoverColumn(null)}>
                    <BrainRegionHeaderCell
                        regionTissueTypes={regionTissueTypes}
                        tissueTypeHrefs={tissueTypeHrefs}
                        sortState={sortState}
                        handleHeaderClick={handleHeaderClick}
                    />
                </th>
            );
            i += span;
            continue;
        }
        nodes.push(
            <th
                key={tissueType}
                title={tissueType}
                className={hoveredColumn === tissueType ? 'is-column-highlight' : undefined}
                // eslint-disable-next-line react/jsx-no-bind
                onMouseEnter={() => onHoverColumn(tissueType)}
                // eslint-disable-next-line react/jsx-no-bind
                onMouseLeave={() => onHoverColumn(null)}>
                <IndividualTissueTypeHeaderLabel
                    tissueType={tissueType}
                    tissueTypeHrefs={tissueTypeHrefs}
                    sortState={sortState}
                    handleHeaderClick={handleHeaderClick}
                />
            </th>
        );
        i += 1;
    }
    return nodes;
}

// Both <thead> rows, factored out so MetricHeatmapTable can render this
// exact same markup twice -- once as the real, in-flow header, once as the
// `position: fixed` "stuck" clone shown while scrolled (see
// MetricHeatmapTable's scroll-measurement effect) -- sharing the same
// `sortState`/`handleHeaderClick` closures so a sort click on either one
// updates the same state and can never let the two drift out of sync.
function renderTableHeaderRows(columnGroups, tissueTypes, mergeableTissueTypes, mergeBrainHeader, tissueTypeHrefs, sortState, handleHeaderClick, hoveredColumn, onHoverColumn) {
    return (
        <>
            <tr className="tissue-heatmap-group-row">
                <th className="tissue-heatmap-order-header" rowSpan={2} />
                <th className="tissue-heatmap-donor-header" rowSpan={2}>
                    <SortableHeaderLabel
                        label="Donor ID"
                        sortDirection={sortState?.key === 'donor' ? sortState.direction : null}
                        // eslint-disable-next-line react/jsx-no-bind
                        onClick={() => handleHeaderClick('donor')}
                    />
                </th>
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
                {renderHeaderCells(
                    tissueTypes,
                    mergeableTissueTypes,
                    mergeBrainHeader,
                    tissueTypeHrefs,
                    sortState,
                    handleHeaderClick,
                    hoveredColumn,
                    onHoverColumn
                )}
            </tr>
        </>
    );
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

// Default value extraction for sorting -- correct as-is for Ischemic Time
// and Autolysis Score (already plain numbers). Target Tissue % overrides
// this (see BrowseTissueHeatmapTable's getTargetTissuePercentageSortValue)
// since its cell values are ordered band strings (e.g. "[26-49]"), not
// numbers -- a plain numeric check on those would return null for every
// value and break sorting for that tab entirely.
const defaultGetSortValue = (value) => (typeof value === 'number' ? value : null);

// null/undefined sort values (n/a cells) always sort to the end, regardless
// of direction -- standard data-table convention, and avoids NaN-driven
// comparator inconsistency from comparing a number against null. Handles
// both numbers (Ischemic Time/Autolysis Score/etc.) and strings (e.g.
// TissueTypeView.js's Donor ID/Sex columns) so every sortable column in
// either table can share this one comparator.
export function compareSortValues(a, b, direction) {
    const aIsNull = a === null || typeof a === 'undefined';
    const bIsNull = b === null || typeof b === 'undefined';
    if (aIsNull && bIsNull) return 0;
    if (aIsNull) return 1;
    if (bIsNull) return -1;
    const cmp =
        typeof a === 'string' && typeof b === 'string'
            ? a.localeCompare(b, undefined, { numeric: true })
            : a - b;
    return direction === 'asc' ? cmp : -cmp;
}

// One clickable header label + a FontAwesome sort-direction icon --
// mirrors the icon-sort-up/icon-sort-down convention shared-portal-
// components' HeadersRow.js (ColumnSortIcon) already uses for the plain
// /browse/ search-results table, so this reads as consistent without
// pulling in that component's heavier URL/context-driven sort machinery
// (architecturally mismatched here -- this table sorts already-fetched
// rows client-side, not a live search grid).
export function SortableHeaderLabel({ label, sortDirection, onClick }) {
    return (
        <button
            type="button"
            className={'tissue-heatmap-sort-button' + (sortDirection ? ' is-active' : '')}
            onClick={onClick}>
            {label}
            <i
                className={
                    'icon icon-fw fas tissue-heatmap-sort-icon' +
                    ' ' +
                    (sortDirection === 'asc'
                        ? 'icon-sort-up'
                        : sortDirection === 'desc'
                            ? 'icon-sort-down'
                            : 'icon-sort')
                }
            />
        </button>
    );
}

const MetricHeatmapTable = React.memo(function MetricHeatmapTable({
    tissueTypes,
    tissueTypeHrefs,
    tissueTypeCategories,
    matrix,
    // This tab's own name (e.g. "Autolysis Score") -- shown as this table's
    // own heading (see the render below) as well as threaded down to the
    // cell detail popover (renderCellAltValues), which otherwise has no way
    // to say which metric its own value is.
    metricLabel,
    // The same explanatory text the tab's info-circle icon used to carry on
    // the tab label itself -- now shown on this heading instead (see the
    // render below), since the reader only sees it once they're already on
    // this tab and looking at the data it explains.
    tooltip = null,
    formatValue,
    getScoreClass,
    // Rendered directly under the heading -- a FixedScoreLegend (Autolysis
    // Score/Target Tissue %'s own fixed, self-explanatory bands) or a
    // ScoreLegend (Ischemic Time's data-driven quantile split, currently
    // passed null/hidden -- see that tab's own `legend={null}` below) or
    // null for no legend at all.
    legend = null,
    // Gates the score-band background coloring (score-0..score-4, applied
    // below) on each cell -- on by default using a neutral light->dark scale
    // (_search.scss), not the earlier green->yellow->orange->red ramp that
    // read as a status/alarm signal regardless of what the metric actually was.
    enableConditionalColor = true,
    // See renderRowCells -- which columns are eligible to have consecutive
    // equal-valued cells in the same row merged into one spanning cell.
    mergeableTissueTypes = EMPTY_MERGEABLE_TISSUE_TYPES,
    // See buildTissueMetricMatrix -- whether every row's mergeableTissueTypes
    // columns actually agree, gating the header's own "Brain" merge
    // (renderHeaderCells) the same way mergeableTissueTypes gates the body's.
    brainColumnsFullyMergeable = false,
    // Extracts a comparable value from a raw cell value for sorting -- see
    // defaultGetSortValue's comment for why Target Tissue % overrides this.
    getSortValue = defaultGetSortValue,
    // See CELL_VALUE_DISPLAY_MODES/HeatmapAdminSettings/renderRowCells.
    cellValueDisplayMode = 'inline',
    // See renderRowCells' own comment -- true only for Ischemic Time (the
    // only tab with real Fixed/Frozen multiplicity; Autolysis Score/Target
    // Tissue % never have more than 1 real-valued record per cell, so this
    // would just add an empty, uninformative "Frozen: n/a" half to every
    // cell there for no reason).
    splitByPreservationType = false,
}) {
    const columnGroups = useMemo(
        () => buildColumnGroups(tissueTypes, tissueTypeCategories),
        [tissueTypes, tissueTypeCategories]
    );

    // null (default order, today's fixed donor-alphabetical order from
    // buildTissueMetricMatrix) or { key: 'donor' | <tissueType>, direction }.
    // Lives locally per MetricHeatmapTable instance -- each of the 3 tabs
    // renders its own instance (kept mounted simultaneously via
    // DotRouterTab's `cache` prop), so per-tab independent sort state falls
    // out naturally with no cross-tab coordination needed. Local state also
    // isn't a prop, so it doesn't affect this component's own React.memo
    // comparison above.
    const [sortState, setSortState] = useState(null);

    // "L-shaped" hover guides -- see renderRowCells' own comment for the
    // full reasoning. `hoveredColumn` (a tissue_type) is shared by the real
    // header, the sticky-clone header (renderTableHeaderRows), and every
    // body row so the whole column stays identifiable even while scrolled/
    // stuck; `hoveredCellPosition` (`{ rowIndex, columnIndex } | null`)
    // additionally narrows that to an L instead of a cross when the hover
    // actually originates from a body cell (handleHoverBodyCell) rather
    // than the header itself (handleHoverHeaderColumn, which leaves this
    // null -- a header hover has no row to draw an L from, so it keeps
    // lighting up its whole column as before).
    const [hoveredColumn, setHoveredColumn] = useState(null);
    const [hoveredCellPosition, setHoveredCellPosition] = useState(null);
    const handleHoverHeaderColumn = (tissueType) => {
        setHoveredColumn(tissueType);
        setHoveredCellPosition(null);
    };
    const handleHoverBodyCell = (tissueType, rowIndex, columnIndex) => {
        setHoveredColumn(tissueType);
        setHoveredCellPosition({ rowIndex, columnIndex });
    };
    const handleHoverEnd = () => {
        setHoveredColumn(null);
        setHoveredCellPosition(null);
    };

    // A cell's own detail popover (renderCellAltValues) used to be a plain
    // CSS :hover-revealed descendant of the <td> -- but that <td> sits
    // inside .tissue-heatmap-table-wrap, which needs `overflow-x: auto`
    // for the table's own horizontal scroll and (per the CSS overflow
    // spec, same trap .tissue-heatmap-sticky-header's own comment
    // documents) that forces `overflow-y: auto` too. The wrapper's own
    // height only ever accounts for normal-flow content, not an
    // absolutely-positioned popover extending past it, so showing one
    // suddenly made the wrapper discover overflow it didn't have a moment
    // ago -- a vertical scrollbar popping in (a visible content shift) and
    // clipping the popover's own bottom edge against that same, freshly
    // vertical-scrolling box. `position: fixed`, positioned here in JS off
    // the hovered cell's live `getBoundingClientRect()` rather than as a
    // CSS descendant, is the only value that escapes that trap (same
    // reason .tissue-heatmap-sticky-header itself has to be fixed, not
    // sticky) -- `null` or `{ rect, entries, tissueType }`.
    const [hoverDetail, setHoverDetail] = useState(null);
    const handleShowDetail = (targetEl, entries, tissueType) => {
        if (!entries) return;
        setHoverDetail({ rect: targetEl.getBoundingClientRect(), entries, tissueType });
    };
    const handleHideDetail = () => setHoverDetail(null);
    const detailPopoverPosition = hoverDetail
        ? getDetailPopoverStyle(hoverDetail.rect)
        : null;

    const handleHeaderClick = (key) => {
        setSortState((prev) => {
            if (!prev || prev.key !== key) return { key, direction: 'asc' };
            if (prev.direction === 'asc') return { key, direction: 'desc' };
            return null;
        });
    };

    const displayMatrix = useMemo(() => {
        if (!sortState) return matrix;
        const { key, direction } = sortState;
        if (key === 'donor') {
            return [...matrix].sort((rowA, rowB) =>
                compareSortValues(rowA.donor, rowB.donor, direction)
            );
        }
        const columnIndex = tissueTypes.indexOf(key);
        if (columnIndex === -1) return matrix;
        return [...matrix].sort((rowA, rowB) =>
            compareSortValues(
                getSortValue(rowA.cells[columnIndex]),
                getSortValue(rowB.cells[columnIndex]),
                direction
            )
        );
    }, [matrix, sortState, tissueTypes, getSortValue]);

    // A sort triggered from the merged "Brain" header (only rendered when
    // brainColumnsFullyMergeable, see BrainRegionHeaderCell) sets
    // sortState.key to its first region's own tissueType (there's no single
    // tissue_type the merged column itself could use as a key) -- label it
    // "Brain" here too, matching what the user actually clicked, rather
    // than that region's own code. Doesn't apply when the header isn't
    // merged -- there, sortState.key really is that one region's own
    // column, and its own code is the accurate label.
    const sortKeyLabel =
        sortState?.key === 'donor'
            ? 'Donor ID'
            : brainColumnsFullyMergeable && mergeableTissueTypes.has(sortState?.key)
                ? 'Brain'
                : formatTissueTypeHeaderLabel(sortState?.key);
    const orderLabel = !sortState
        ? 'Donor Distribution Order'
        : `Sorted by ${sortKeyLabel} (${sortState.direction === 'asc' ? 'ascending' : 'descending'})`;

    // JS-driven sticky header -- see _search.scss's .tissue-heatmap-sticky-header
    // comment for why `position: sticky` alone can't do this (the wrapper
    // below needs `overflow-x: auto` for the table's own horizontal scroll,
    // which per the CSS overflow spec silently traps any sticky descendant
    // to that wrapper's own -- here, unbounded and therefore
    // never-actually-scrolling -- box instead of the page). `null` (not
    // stuck) or `{ left, width, tableWidth, scrollLeft, colWidths }`.
    const wrapperRef = useRef(null);
    const tableRef = useRef(null);
    const [stickyHeader, setStickyHeader] = useState(null);

    useEffect(() => {
        let rafId = null;

        const measure = () => {
            rafId = null;
            const tableEl = tableRef.current;
            const wrapperEl = wrapperRef.current;
            if (!tableEl || !wrapperEl) {
                setStickyHeader(null);
                return;
            }
            const tableRect = tableEl.getBoundingClientRect();
            const headerEl = tableEl.querySelector('thead');
            const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 0;
            // The site's own top nav (NavigationBar.js's #top-nav) is itself
            // `position: fixed` at the `lg`+ breakpoint (_navbar.scss), so
            // without this the two fixed headers stack on top of each
            // other. Reading its live rendered bottom edge (rather than a
            // hardcoded 80px) self-adjusts for: the TestWarning banner
            // (which grows the navbar when shown), the sub-`lg` breakpoint
            // where it's not fixed at all (its rect naturally scrolls to
            // top <= 0 there, clamped to 0 below), and any future navbar
            // height change -- no separate breakpoint/banner check needed.
            const navEl = document.getElementById('top-nav');
            const navOffset = navEl ? Math.max(0, navEl.getBoundingClientRect().bottom) : 0;
            // Stuck once the real header has scrolled up to the bottom edge
            // of the (possibly fixed) top nav, un-stuck again once the
            // table's own bottom has too (no point pinning a header over a
            // table that's no longer on screen at all).
            const isStuck = tableRect.top <= navOffset && tableRect.bottom > navOffset + headerHeight;
            if (!isStuck) {
                setStickyHeader((prev) => (prev === null ? prev : null));
                return;
            }
            const wrapperRect = wrapperEl.getBoundingClientRect();
            // Width source for the clone's <colgroup> -- the header row
            // itself can have colSpan-merged cells (germ-layer group
            // labels, the "Brain" sub-group banner) that don't map to one
            // width per real column, so this reads the
            // body instead. The order-label cell is excluded (only present
            // on one row, via rowSpan, and its own width is the fixed
            // 32px column below regardless of which row carries it) --
            // whatever's left is always donor-id + one cell per tissueType,
            // possibly colSpan-merged for the same reason the header can be.
            // A colSpan cell's measured width is split evenly across the
            // columns it covers -- an approximation, but a harmless one:
            // the clone's own header re-merges those same columns back into
            // one spanning <th> (via renderTableHeaderRows below), so only
            // their *summed* width (unaffected by how it's subdivided)
            // ever actually shows.
            const firstBodyRow = tableEl.querySelector('tbody tr');
            const bodyColWidths = [];
            if (firstBodyRow) {
                Array.from(firstBodyRow.children).forEach((cell) => {
                    if (cell.classList.contains('tissue-heatmap-order-label')) return;
                    const span = cell.colSpan || 1;
                    const perColumnWidth = cell.getBoundingClientRect().width / span;
                    for (let i = 0; i < span; i += 1) bodyColWidths.push(perColumnWidth);
                });
            }
            setStickyHeader({
                top: navOffset,
                left: wrapperRect.left,
                width: wrapperRect.width,
                tableWidth: tableRect.width,
                scrollLeft: wrapperEl.scrollLeft,
                // Fixed 32px to match .tissue-heatmap-order-header/-label's
                // own CSS-declared width (_search.scss) -- not measured,
                // since that cell's rowSpan can put it on any row.
                colWidths: [32, ...bodyColWidths],
            });
        };

        const scheduleMeasure = () => {
            if (rafId !== null) return;
            rafId = window.requestAnimationFrame(measure);
        };

        scheduleMeasure();
        window.addEventListener('scroll', scheduleMeasure, { passive: true });
        window.addEventListener('resize', scheduleMeasure);
        const wrapperEl = wrapperRef.current;
        // The wrapper's own horizontal scroll -- keeps the stuck clone's
        // translateX in sync so its columns stay aligned with the real
        // (currently off-screen-above) table's horizontal scroll position.
        wrapperEl?.addEventListener('scroll', scheduleMeasure, { passive: true });

        return () => {
            if (rafId !== null) window.cancelAnimationFrame(rafId);
            window.removeEventListener('scroll', scheduleMeasure);
            window.removeEventListener('resize', scheduleMeasure);
            wrapperEl?.removeEventListener('scroll', scheduleMeasure);
        };
    }, []);

    return (
        <>
            <div className="tissue-heatmap-metric-heading">
                <h2 className="tissue-heatmap-metric-title">
                    {metricLabel}
                    {tooltip ? (
                        <i
                            className="icon icon-fw icon-info-circle fas tissue-heatmap-metric-title-info"
                            data-tip={tooltip}
                        />
                    ) : null}
                </h2>
                {legend}
            </div>
            {stickyHeader ? (
                <div
                    className="tissue-heatmap-sticky-header"
                    style={{ top: stickyHeader.top, left: stickyHeader.left, width: stickyHeader.width }}>
                    <table
                        className="tissue-heatmap-table"
                        style={{
                            width: stickyHeader.tableWidth,
                            transform: `translateX(${-stickyHeader.scrollLeft}px)`,
                        }}>
                        <colgroup>
                            {stickyHeader.colWidths.map((colWidth, i) => (
                                // eslint-disable-next-line react/no-array-index-key
                                <col key={i} style={{ width: colWidth }} />
                            ))}
                        </colgroup>
                        <thead>
                            {renderTableHeaderRows(
                                columnGroups,
                                tissueTypes,
                                mergeableTissueTypes,
                                brainColumnsFullyMergeable,
                                tissueTypeHrefs,
                                sortState,
                                handleHeaderClick,
                                hoveredColumn,
                                handleHoverHeaderColumn
                            )}
                        </thead>
                    </table>
                </div>
            ) : null}
            <div className="tissue-heatmap-table-wrap" ref={wrapperRef}>
                <table className="tissue-heatmap-table" ref={tableRef}>
                    <thead>
                        {renderTableHeaderRows(
                            columnGroups,
                            tissueTypes,
                            mergeableTissueTypes,
                            brainColumnsFullyMergeable,
                            tissueTypeHrefs,
                            sortState,
                            handleHeaderClick,
                            hoveredColumn,
                            handleHoverHeaderColumn
                        )}
                    </thead>
                    <tbody>
                        {displayMatrix.map(({ donor, cells, cellEntries, cellSlots }, rowIndex) => (
                            <tr key={donor}>
                                {rowIndex === 0 ? (
                                    <td className="tissue-heatmap-order-label" rowSpan={displayMatrix.length}>
                                        <span>{orderLabel}</span>
                                    </td>
                                ) : null}
                                <td className="tissue-heatmap-donor-id">{donor}</td>
                                {renderRowCells(
                                    cells,
                                    cellEntries,
                                    cellSlots,
                                    tissueTypes,
                                    mergeableTissueTypes,
                                    brainColumnsFullyMergeable,
                                    formatValue,
                                    getScoreClass,
                                    enableConditionalColor,
                                    rowIndex,
                                    hoveredColumn,
                                    hoveredCellPosition,
                                    handleHoverBodyCell,
                                    handleHoverEnd,
                                    handleShowDetail,
                                    handleHideDetail,
                                    cellValueDisplayMode,
                                    splitByPreservationType
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {hoverDetail
                ? renderCellAltValues(
                    hoverDetail.entries,
                    hoverDetail.tissueType,
                    metricLabel,
                    formatValue,
                    detailPopoverPosition.style,
                    detailPopoverPosition.isFlippedUp
                )
                : null}
        </>
    );
});

export const BrowseTissueHeatmapTable = (props) => {
    // Gates the score-band cell coloring in all three tabs' tables -- see
    // MetricHeatmapTable's identical prop. On by default.
    const { href, session, enableConditionalColor = true } = props;
    const [loading, setLoading] = useState(true);
    const [tissueResults, setTissueResults] = useState([]);
    // The color picker is an internal dev/data-wrangling tool, not
    // something a regular viewer needs -- gated to the "admin" JWT group,
    // same check DataMatrix.js's isAdminUser uses. JWT.getUserGroups() reads
    // the already-decoded token client-side (no extra request), so this can
    // just be recomputed with `session` rather than needing its own fetch.
    const isAdminUser = useMemo(
        () => (JWT.getUserGroups() || []).includes('admin'),
        [session]
    );
    // Experimental color override -- see HeatmapColorPicker. Plain
    // in-memory state, not persisted anywhere: a pick only lasts for this
    // page view, and always starts back at the default (null = "use the
    // built-in scale") on every fresh page load, per explicit request.
    const [paletteBaseHex, setPaletteBaseHex] = useState(null);
    // 5 stops -- matches Ischemic Time's own 5-band equal-width split and
    // Target Tissue %'s 5 real bands (both scored/colored higher than
    // Autolysis Score's 4), so a picked color still covers every band any
    // tab on this page actually uses.
    const heatmapPalette = useMemo(
        () => (paletteBaseHex ? buildSequentialPaletteFromHex(paletteBaseHex, 5) : null),
        [paletteBaseHex]
    );
    const handlePickPaletteColor = (hex) => setPaletteBaseHex(hex);
    const handleResetPaletteColor = () => setPaletteBaseHex(null);

    // Default ('vertical'): a multi-record cell splits into 2 side-by-side
    // halves, one real value each -- see CELL_VALUE_DISPLAY_MODES for the
    // other 3 (still satisfies the original review requirement -- every
    // real value visible with no hover/click -- same as 'inline' and
    // 'diagonal', just laid out differently). Same in-memory-only,
    // per-page-view, admin-toggleable pattern as paletteBaseHex above.
    const [cellValueDisplayMode, setCellValueDisplayMode] = useState('vertical');

    // Each tab's own metric heading carries an info-circle icon (see
    // MetricHeatmapTable's render) that's a static-attribute react-tooltip
    // target (data-tip) -- app.js's global <ReactTooltip/> only picks up
    // nodes present at its own last build, and this component can mount
    // after that (e.g. scrolled/tabbed into view later), so it needs an
    // explicit rebuild once mounted, same as BrowseTissueVizWrapper.js's
    // germ-layer bubbles.
    useEffect(() => {
        ReactTooltip.rebuild();
    }, []);

    // `session` in the dependency array so logging in/out re-fetches --
    // permission-filtered fields (e.g. protected donor data) can change
    // without `href` itself changing.
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
    // Built from this table's own real values -- see
    // buildRangeScoreClassifier for why fixed thresholds don't work here.
    const ischemicTimeScoring = useMemo(
        () => buildRangeScoreClassifier(ischemicTime.matrix.flatMap((row) => row.cells)),
        [ischemicTime]
    );
    // Each band's own value range, for the color legend below -- unlike
    // Autolysis Score/Target Tissue %'s fixed, self-explanatory bands,
    // these boundaries are computed fresh from whatever's actually in the
    // table (see buildRangeScoreClassifier) and would otherwise be
    // opaque (a color alone doesn't say "this donor's value was between X
    // and Y hours").
    // Legend hidden for now, see the scoreLegend={null} override below;
    // kept computed so re-enabling it is just restoring that prop.
    // eslint-disable-next-line no-unused-vars
    const ischemicTimeScoreLegend = useMemo(
        () => buildScoreLegend(ischemicTimeScoring),
        [ischemicTimeScoring]
    );
    // Autolysis, like ischemic time, is assessed once per whole brain at
    // procurement, not independently per dissected sub-region, so every
    // real region column for a given donor carries the same score and this
    // gets the same distributeGenericBrainValue/merge treatment.
    const autolysisScore = useMemo(
        () => buildTissueMetricMatrix(tissueResults, getAutolysisScoreValue, true),
        [tissueResults]
    );
    // Not for the same reason as Autolysis Score above -- there's no real
    // value to distribute here (BrainPathologyReport has no target_tissues
    // field at all, see get_target_tissue_percentage's own docstring, so
    // every brain region's value is unconditionally null, generic "Brain"
    // column included). `true` just engages the merge side of the same
    // flag, collapsing what would otherwise be 5 repeated "n/a" cells into
    // one.
    const targetTissuePercentage = useMemo(
        () => buildTissueMetricMatrix(tissueResults, getTargetTissuePercentageValue, true),
        [tissueResults]
    );

    // Applied as CSS custom properties on the whole card -- _search.scss's
    // .score-0..4 rules read these with a `var(--x, <hardcoded-default>)`
    // fallback, so leaving this undefined (no override picked) reproduces
    // the exact built-in scale unchanged.
    const paletteStyle = heatmapPalette
        ? heatmapPalette.reduce((style, { bg, text }, i) => {
            style[`--heatmap-score-${i}-bg`] = bg;
            style[`--heatmap-score-${i}-text`] = text;
            return style;
        }, {})
        : undefined;

    return (
        <div className="tissue-heatmap-card" style={paletteStyle}>
            {isAdminUser ? (
                <div className="tissue-heatmap-toolbar">
                    <HeatmapAdminSettings
                        cellValueDisplayMode={cellValueDisplayMode}
                        // eslint-disable-next-line react/jsx-no-bind
                        onChangeCellValueDisplayMode={setCellValueDisplayMode}
                        baseHex={paletteBaseHex}
                        // eslint-disable-next-line react/jsx-no-bind
                        onPickColor={handlePickPaletteColor}
                        // eslint-disable-next-line react/jsx-no-bind
                        onResetColor={handleResetPaletteColor}
                    />
                </div>
            ) : null}
            <DotRouter
                href={href}
                navClassName="tissue-heatmap-tabs"
                contentsClassName=""
                isActive={true}
                prependDotPath="tissue-heatmap">
                <DotRouterTab
                    dotPath=".ischemic-time"
                    tabTitle="Ischemic Time (h)"
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
                            metricLabel="Ischemic Time (h)"
                            tooltip="Time interval between death, presumed death, or cross-clamp application and beginning of tissue collection (hours)"
                            formatValue={formatIschemicTime}
                            getScoreClass={ischemicTimeScoring.classify}
                            // The severity-scale legend (ScoreLegend) is
                            // hidden for now -- ischemicTimeScoreLegend is
                            // still computed above and
                            // ScoreLegend/buildScoreLegend stay in place so
                            // it can come back by rendering both here
                            // (legend={<>
                            //     <ScoreLegend entries={ischemicTimeScoreLegend} />
                            //     <SplitCellLegend />
                            // </>}). SplitCellLegend itself stays on, though
                            // -- unlike the severity scale, it's not
                            // data-driven and explains this tab's own
                            // Fixed/Frozen split cells regardless.
                            legend={<SplitCellLegend />}
                            enableConditionalColor={enableConditionalColor}
                            cellValueDisplayMode={cellValueDisplayMode}
                            splitByPreservationType
                        />
                    )}
                </DotRouterTab>
                <DotRouterTab
                    dotPath=".autolysis-score"
                    tabTitle="Autolysis Score"
                    arrowTabs={false}
                    cache={true}>
                    {loading ? (
                        <div className="tissue-heatmap-loading">
                            <i className="icon icon-circle-notch icon-spin fas" />
                        </div>
                    ) : (
                        <MetricHeatmapTable
                            {...autolysisScore}
                            metricLabel="Autolysis Score"
                            tooltip="Tissue autolysis score of the sample or region: 0=None, 1=mild, 2=moderate, 3=severe"
                            formatValue={formatAutolysisScore}
                            getScoreClass={getAutolysisScoreClass}
                            legend={
                                <FixedScoreLegend
                                    entries={AUTOLYSIS_SCORE_LEGEND_ENTRIES}
                                    leftCaption="Minimal"
                                    rightCaption="Severe"
                                />
                            }
                            enableConditionalColor={enableConditionalColor}
                            cellValueDisplayMode={cellValueDisplayMode}
                        />
                    )}
                </DotRouterTab>
                <DotRouterTab
                    dotPath=".target-tissue"
                    tabTitle="Target Tissue %"
                    arrowTabs={false}
                    cache={true}>
                    {loading ? (
                        <div className="tissue-heatmap-loading">
                            <i className="icon icon-circle-notch icon-spin fas" />
                        </div>
                    ) : (
                        <MetricHeatmapTable
                            {...targetTissuePercentage}
                            metricLabel="Target Tissue %"
                            tooltip="Percentage range of the sample that was the target tissue subtype"
                            formatValue={formatTargetTissuePercentage}
                            getScoreClass={getTargetTissuePercentageScoreClass}
                            getSortValue={getTargetTissuePercentageSortValue}
                            legend={
                                <FixedScoreLegend entries={TARGET_TISSUE_PERCENTAGE_LEGEND_ENTRIES} />
                            }
                            enableConditionalColor={enableConditionalColor}
                            cellValueDisplayMode={cellValueDisplayMode}
                        />
                    )}
                </DotRouterTab>
            </DotRouter>
        </div>
    );
};
