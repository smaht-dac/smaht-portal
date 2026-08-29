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

// Quartile-based banding splits whatever Ischemic Time values are actually
// in this table into 4 equal-sized groups, so the color spread reflects this
// dataset's own distribution rather than a fixed threshold (real values
// cluster tightly, so fixed clinical-sounding bands leave the heatmap
// showing little variation). Exported for unit testing.
export function buildQuartileScoreClassifier(values) {
    const sorted = values
        .filter((value) => typeof value === 'number' && Number.isFinite(value))
        .slice()
        .sort((a, b) => a - b);
    if (sorted.length === 0) {
        return () => 'na';
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
    const q1 = quantile(0.25);
    const q2 = quantile(0.5);
    const q3 = quantile(0.75);
    return (value) => {
        if (value === null || typeof value === 'undefined') return 'na';
        if (value <= q1) return 'score-0';
        if (value <= q2) return 'score-1';
        if (value <= q3) return 'score-2';
        return 'score-3';
    };
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
    // Default scale (see _search.scss's .score-0..3 fallback values) --
    // listed here too so it's reachable by name after picking something else.
    { name: 'Ocean', hex: '#22528E' },
    { name: 'Teal', hex: '#2F8F83' },
    { name: 'Purple', hex: '#7C6BA6' },
    { name: 'Amber', hex: '#C08A2E' },
    { name: 'Rose', hex: '#B5657A' },
    { name: 'Forest', hex: '#4F7A5B' },
    // The neutral grey-blue scale this table used before "Ocean" became the
    // default (its own darkest band, #5B6670) -- kept reachable here for
    // anyone who preferred it.
    { name: 'Slate', hex: '#5B6670' },
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

// Exported for unit testing. Fixed saturation curve (clamped so a very
// dull or very neon input hue still lands in a reasonable range) and
// lightness steps -- only the hue actually comes from `baseHex`, so every
// generated scale keeps the same light->dark "feel" regardless of which
// color was picked.
export function buildSequentialPaletteFromHex(baseHex) {
    const [h, rawSaturation] = rgbToHsl(hexToRgb(baseHex));
    const saturation = clamp(rawSaturation, 28, 46);
    return [88, 72, 50, 32].map((lightness) => {
        const bg = rgbToHex(hslToRgb(h, saturation, lightness));
        // Same threshold direction as the hardcoded default scale (light
        // bands get dark text, the darkest band or two get white text).
        const text = lightness > 58 ? '#28323C' : '#FFFFFF';
        return { bg, text };
    });
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
                                    setIsOpen(false);
                                }}
                            />
                        ))}
                        <label
                            className="tissue-heatmap-color-picker-preset tissue-heatmap-color-picker-custom"
                            title="Pick a custom color">
                            <input
                                type="color"
                                value={baseHex || '#22528E'}
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
                            setIsOpen(false);
                        }}>
                        Reset to default
                    </button>
                </div>
            ) : null}
        </div>
    );
}

function heatmapCellClassName(value, getScoreClass, enableConditionalColor, isHoveredColumn, entries) {
    return (
        'tissue-heatmap-cell' +
        (enableConditionalColor ? ` ${getScoreClass(value)}` : '') +
        // Muted styling for "no data" cells is plain typography (grey vs.
        // dark text), not the score-band heatmap coloring
        // enableConditionalColor gates -- keeps real values legible against
        // empty ones either way.
        (value === null || typeof value === 'undefined' ? ' is-empty' : '') +
        (isHoveredColumn ? ' is-hovered-column' : '') +
        // Excel-style corner flag -- more than one real record is actually
        // competing for this cell's value (see buildTissueMetricMatrix's
        // pickPrimaryTissueRecord), not just the single-record case, which
        // still shows a detail popover on hover (MetricHeatmapTable's
        // hoverDetail) but doesn't need flagging.
        (entries && entries.length > 1 ? ' has-alt-values' : '')
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
// column. The header row above merges the same run too (renderHeaderCells),
// but only when buildTissueMetricMatrix's brainColumnsFullyMergeable says
// *every* row agrees, not just this one -- so a merged header always lines
// up with either a merged body cell (when it does) or the same number of
// separately-headed individual cells (when this particular row didn't
// merge, e.g. a "no value at all" row).
//
// `hoveredColumn`/`onHoverColumn` -- crosshair highlighting (which row and
// column a cell belongs to should be obvious on hover, per explicit
// request). The row half needs no JS at all (`tbody tr:hover` in
// _search.scss); the column half does, since plain CSS has no way to
// select "every cell in the same column as the one being hovered" -- each
// cell reports its own (possibly multi-tissueType, if merged) span on
// mouseenter, MetricHeatmapTable stores it, and every cell -- this row's
// and the header's (renderHeaderCells) -- checks it on render.
function renderRowCells(cells, cellEntries, tissueTypes, mergeableTissueTypes, formatValue, getScoreClass, enableConditionalColor, hoveredColumn, onHoverColumn, onShowDetail, onHideDetail) {
    const nodes = [];
    let i = 0;
    while (i < cells.length) {
        const tissueType = tissueTypes[i];
        const value = cells[i];
        const entries = cellEntries?.[i] || null;
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
        const columnTissueTypes = tissueTypes.slice(i, i + span);
        nodes.push(
            <td
                key={tissueType}
                colSpan={span > 1 ? span : undefined}
                className={heatmapCellClassName(
                    value,
                    getScoreClass,
                    enableConditionalColor,
                    columnTissueTypes.includes(hoveredColumn),
                    entries
                )}
                // eslint-disable-next-line react/jsx-no-bind
                onMouseEnter={(event) => {
                    onHoverColumn(tissueType);
                    onShowDetail(event.currentTarget, entries, tissueType);
                }}
                // eslint-disable-next-line react/jsx-no-bind
                onMouseLeave={() => {
                    onHoverColumn(null);
                    onHideDetail();
                }}>
                {formatValue(value)}
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
                    className={regionTissueTypes.includes(hoveredColumn) ? 'is-hovered-column' : undefined}
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
                className={hoveredColumn === tissueType ? 'is-hovered-column' : undefined}
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
    // This tab's own name (e.g. "Autolysis Score") -- threaded down only
    // as far as the cell detail popover (renderCellAltValues), which
    // otherwise has no way to say which metric its own value is.
    metricLabel,
    formatValue,
    getScoreClass,
    // Gates the score-band background coloring (score-0..score-3, applied
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

    // Column-hover crosshair -- see renderRowCells' comment for why only
    // this half needs JS (row-hover is plain CSS, `tbody tr:hover`).
    // Shared by both the real and the sticky-clone header (renderTableHeaderRows)
    // so the header stays highlighted even while scrolled/stuck.
    const [hoveredColumn, setHoveredColumn] = useState(null);

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
                                setHoveredColumn
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
                            setHoveredColumn
                        )}
                    </thead>
                    <tbody>
                        {displayMatrix.map(({ donor, cells, cellEntries }, rowIndex) => (
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
                                    tissueTypes,
                                    mergeableTissueTypes,
                                    formatValue,
                                    getScoreClass,
                                    enableConditionalColor,
                                    hoveredColumn,
                                    setHoveredColumn,
                                    handleShowDetail,
                                    handleHideDetail
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
    const heatmapPalette = useMemo(
        () => (paletteBaseHex ? buildSequentialPaletteFromHex(paletteBaseHex) : null),
        [paletteBaseHex]
    );
    const handlePickPaletteColor = (hex) => setPaletteBaseHex(hex);
    const handleResetPaletteColor = () => setPaletteBaseHex(null);

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
    // buildQuartileScoreClassifier for why fixed thresholds don't work here.
    const ischemicTimeScoreClass = useMemo(
        () => buildQuartileScoreClassifier(ischemicTime.matrix.flatMap((row) => row.cells)),
        [ischemicTime]
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
    // .score-0..3 rules read these with a `var(--x, <hardcoded-default>)`
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
                    <HeatmapColorPicker
                        baseHex={paletteBaseHex}
                        // eslint-disable-next-line react/jsx-no-bind
                        onPick={handlePickPaletteColor}
                        // eslint-disable-next-line react/jsx-no-bind
                        onReset={handleResetPaletteColor}
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
                            metricLabel="Ischemic Time (h)"
                            formatValue={formatIschemicTime}
                            getScoreClass={ischemicTimeScoreClass}
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
                            metricLabel="Autolysis Score"
                            formatValue={formatAutolysisScore}
                            getScoreClass={getAutolysisScoreClass}
                            enableConditionalColor={enableConditionalColor}
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
                            metricLabel="Target Tissue %"
                            formatValue={formatTargetTissuePercentage}
                            getScoreClass={getTargetTissuePercentageScoreClass}
                            getSortValue={getTargetTissuePercentageSortValue}
                            enableConditionalColor={enableConditionalColor}
                        />
                    )}
                </DotRouterTab>
            </DotRouter>
        </div>
    );
};
