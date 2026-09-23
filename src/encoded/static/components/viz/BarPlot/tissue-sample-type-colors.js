'use strict';

/**
 * Fixed (not `barplot_color_cycler`-assigned) colors for Browse by Tissue's
 * line chart (see LineChartViewContainer), one per `sample_summary.
 * preservation_types` term (post-merge-terms.js display term, e.g. "Frozen"
 * not "Snap Frozen") -- per explicit request, Frozen reuses the same color
 * family AliquotVisualization.js's own SLICE_TYPE_STYLES.yellow already
 * uses elsewhere in this portal for the same Fixed/Frozen semantics, so the
 * 2 views read as one consistent color language rather than 2 unrelated
 * palettes for the same concept. Fresh and "Not specified" have no such
 * established color elsewhere to match, so each just gets its own plain,
 * muted tone -- still visually secondary to Frozen's own vivid green, but
 * distinguishable from EACH OTHER too (an earlier version of this gave
 * both the exact same neutral grey, per DEFAULT_COLOR below, which read as
 *1 color standing in for 2 different terms).
 */
export const TISSUE_SAMPLE_TYPE_COLORS = {
    // Explicitly picked as SLICE_TYPE_STYLES.yellow.front, not .border/.side
    // (the other 2 candidates offered) -- the lighter, most visually
    // prominent of aliquot viz's own 3 Frozen shades.
    'Frozen': { fill: '#CFE89B', stroke: '#CFE89B' },
    'Fresh': { fill: '#E7D9B4', stroke: '#A68B5B' },
    'Not specified': { fill: '#D3D7DB', stroke: '#868E96' },
};

// Fallback for any term not explicitly listed above (there shouldn't
// normally be one, since Fresh/Not specified/Frozen already cover every
// real `sample_summary.preservation_types` value post-merge).
export const TISSUE_SAMPLE_TYPE_DEFAULT_COLOR = { fill: '#D8DCE0', stroke: '#8A939B' };

/**
 * The muted marker color for a data point whose own count is 0 (a tissue
 * with no samples of that particular sample type) -- per explicit request,
 * still drawn (not hidden/blank), but deliberately never this term's own
 * color, so a real 0 doesn't visually compete with genuine data points for
 * attention on the line.
 */
export const TISSUE_SAMPLE_TYPE_ZERO_COLOR = { fill: '#ECEEF0', stroke: '#C2C7CC' };

export function getTissueSampleTypeColor(term) {
    return TISSUE_SAMPLE_TYPE_COLORS[term] || TISSUE_SAMPLE_TYPE_DEFAULT_COLOR;
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
