'use strict';

/**
 * Fixed (not `barplot_color_cycler`-assigned) colors for Browse by Tissue's
 * line chart (see LineChartViewContainer), one per `sample_summary.
 * preservation_types` term (post-merge-terms.js display term, e.g. "Frozen"
 * not "Snap Frozen") -- per explicit request, Frozen reuses the same color
 * family AliquotVisualization.js's own SLICE_TYPE_STYLES.yellow already
 * uses elsewhere in this portal for the same Fixed/Frozen semantics, so the
 * 2 views read as one consistent color language rather than 2 unrelated
 * palettes for the same concept. Fresh (#B0B0FB, per explicit request)
 * and "Not specified" have no such established color elsewhere to match,
 * so each just gets its own tone, distinguishable from EACH OTHER too (an
 * earlier version of this gave both the exact same neutral grey, per
 * DEFAULT_COLOR below, which read as 1 color standing in for 2 different
 * terms).
 */
export const TISSUE_SAMPLE_TYPE_COLORS = {
    // Explicitly picked as SLICE_TYPE_STYLES.yellow.front, not .border/.side
    // (the other 2 candidates offered) -- the lighter, most visually
    // prominent of aliquot viz's own 3 Frozen shades.
    'Frozen': { fill: '#CFE89B', stroke: '#CFE89B' },
    'Fresh': { fill: '#B0B0FB', stroke: '#B0B0FB' },
    // TissueSample-counted Fixed series (tissue-fixed-samples.js) -- same
    // idea as Frozen above: AliquotVisualization.js's own Fixed shade
    // (SLICE_TYPE_STYLES.pink.front).
    'Fixed': { fill: '#F2C4A8', stroke: '#F2C4A8' },
    'Not specified': { fill: '#D3D7DB', stroke: '#868E96' },
};

// Fallback for a term with no fixed color above and no palette slot left
// (see getTissueSampleTypeColor).
export const TISSUE_SAMPLE_TYPE_DEFAULT_COLOR = { fill: '#D8DCE0', stroke: '#8A939B' };

// Every other Group By option (Sequencing Center's GCCs, the TTDs, etc.)
// has no fixed per-term color -- per explicit request each of those terms
// still gets its own distinct color (they all used to fall back to the
// same grey above) from this categorical palette. Picked to stay clear of
// Frozen's green/Fresh's periwinkle above.
const TISSUE_GROUP_PALETTE = [
    '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
    '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#2F4B7C',
];

// Term -> palette color, assigned in first-seen order and kept for the rest
// of the page's lifetime -- module-level (not per render) so the chart's
// own lines/dots and the sidebar legend's swatches, which each look colors
// up separately, always agree on the same term's color.
const assignedGroupColors = new Map();

export function getTissueSampleTypeColor(term) {
    if (TISSUE_SAMPLE_TYPE_COLORS[term]) return TISSUE_SAMPLE_TYPE_COLORS[term];
    if (term === undefined || term === null) return TISSUE_SAMPLE_TYPE_DEFAULT_COLOR;
    if (!assignedGroupColors.has(term)) {
        if (assignedGroupColors.size >= TISSUE_GROUP_PALETTE.length) return TISSUE_SAMPLE_TYPE_DEFAULT_COLOR;
        const hex = TISSUE_GROUP_PALETTE[assignedGroupColors.size];
        assignedGroupColors.set(term, { fill: hex, stroke: hex });
    }
    return assignedGroupColors.get(term);
}

// How strongly a dot's fill shows its own color (its stroke stays the full
// color) -- per explicit request, dots read as a lighter, see-through-looking
// version of their line's color.
export const TISSUE_LINE_DOT_FILL_STRENGTH = 0.55;

// The dot fill itself: the color pre-mixed with white at
// TISSUE_LINE_DOT_FILL_STRENGTH rather than a real `fill-opacity` -- a truly
// transparent fill let the dot's own line show straight through its middle.
export function getTissueLineDotFill(hex) {
    const match = String(hex || '').trim().match(/^#?([0-9a-f]{6})$/i);
    if (!match) return hex;
    const value = parseInt(match[1], 16);
    const mix = (channel) => Math.round(TISSUE_LINE_DOT_FILL_STRENGTH * channel + (1 - TISSUE_LINE_DOT_FILL_STRENGTH) * 255);
    const r = mix((value >> 16) & 255);
    const g = mix((value >> 8) & 255);
    const b = mix(value & 255);
    return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

/**
 * A `barplot_color_cycler`-compatible object (just the `colorForNode`
 * method Legend.barPlotFieldDataToLegendFieldsData actually calls) so the
 * sidebar legend's own swatches match the line chart's colors term-for-
 * term, instead of the generic cycler's own (different) color assignment.
 */
export const tissueSampleTypeColorCycler = {
    colorForNode(node) {
        return getTissueSampleTypeColor(node && node.term).stroke;
    },
    // `Legend.sortLegendFieldTermsByColorPalette` calls this expecting a
    // `barplot_color_cycler`-style reorder by each object's own `.color`
    // position in a fixed palette array -- unnecessary here since the
    // legend's own caller (`AggregatedLegend.getFieldForLegend`) always
    // re-sorts its result by count immediately afterward anyway, so this
    // just passes the array through unchanged.
    sortObjectsByColorPalette(objects) {
        return objects;
    },
};
