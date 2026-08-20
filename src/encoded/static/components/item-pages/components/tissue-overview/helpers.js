'use strict';

import React from 'react';
import { getTissueInternalCodeFromFacetTerm } from '../../../util/data';
import { BROWSE_STATUS_FILTERS } from '../../../browse/BrowseView';
import smahtTissueColors from '../../../../data/color-schemes/smaht_tissue_colors.json';

// smaht_tissue_colors.json is keyed by TPC code (e.g. "3AM"), but callers
// here only ever have this file's own internal 4-letter code (from
// getTissueInternalCodeFromFacetTerm) -- re-key once by each entry's own
// `smaht_code` field so lookups don't have to re-derive/guess a TPC code.
const TISSUE_COLOR_HEX_BY_INTERNAL_CODE = Object.values(smahtTissueColors).reduce(
    (acc, { smaht_code, tissue_color_hex }) => {
        if (smaht_code && tissue_color_hex) acc[smaht_code] = `#${tissue_color_hex}`;
        return acc;
    },
    {}
);

// tissue_type is a "<TPC code> - <name>" string (e.g. "3Q - Lung"); resolve
// it to its official SMaHT tissue color (smaht_tissue_colors.json), or null
// for tissue_type values this color scheme doesn't cover (e.g. plain
// "Brain"/"Colon" with no TPC code prefix, or "Cell Line Mixture").
export const getTissueColorHex = (tissueTypeValue) => {
    const raw = String(tissueTypeValue || '').trim();
    if (!raw) return null;
    const internalCode = getTissueInternalCodeFromFacetTerm(raw);
    return (internalCode && TISSUE_COLOR_HEX_BY_INTERNAL_CODE[internalCode]) || null;
};

// getTissueColorHex's output is a solid "#rrggbb" -- too strong to use as-is
// for a tinted background/border (e.g. the Tissue Overview header icon's
// circle), so this converts it to an rgba() string at a given alpha. Returns
// null for a null/malformed hex so callers can fall back to their default
// (non-tissue-specific) styling with the same `hex ? {...} : undefined`
// pattern used elsewhere.
export const hexToRgba = (hex, alpha = 1) => {
    const match = String(hex || '').trim().match(/^#?([0-9a-f]{6})$/i);
    if (!match) return null;
    const value = parseInt(match[1], 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Merging several Core TissueSamples into one slice box (see
// getAliquotNumberFromExternalId) concatenates each sample's own
// `associated_pathology_reports` -- but siblings cut from the same
// physical aliquot commonly share the same linked Fixed sample(s), so the
// same entry (e.g. "Pathology (SMHT001-3N-002)") ends up repeated once per
// core position instead of once per distinct Fixed sample. Dedupe by
// `fixed_sample_external_id`, keeping the first occurrence.
export const dedupePathologyReportEntries = (entries = []) => {
    const seen = new Set();
    return entries.filter((entry) => {
        const key = entry?.fixed_sample_external_id;
        if (key && seen.has(key)) return false;
        if (key) seen.add(key);
        return true;
    });
};

// Shared between the legacy item-keyed TissueView.js (/tissues/<uuid>/'s
// "Tissue Overview" tab) and the type-keyed TissueTypeView.js
// (/tissue-overview/?tissue_type=<value>) -- both render the same kind of
// tissue_type summary from a list of Tissue search results, just sourced
// via a different route.

// A tissue_type's donor population is rarely all one sex (unlike the single
// Tissue item the legacy page used to read `donor.sex` directly off), so
// this summarizes the whole `donors` list (dedupeTissuesByDonor's output)
// into e.g. "Male (12), Female (6)" -- descending by count, omitting any
// sex with zero donors rather than always listing every possible value.
export const formatSexBreakdown = (donors = []) => {
    const countsBySex = {};
    donors.forEach(({ donor }) => {
        const sex = donor?.sex;
        if (!sex) return;
        countsBySex[sex] = (countsBySex[sex] || 0) + 1;
    });
    const entries = Object.entries(countsBySex).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return null;
    return entries.map(([sex, count]) => `${sex} (${count})`).join(', ');
};

// Links to the ProtectedDonor page when the viewing user has protected/dbGaP
// access and the donor's protected_donor is visible to them (embedded
// server-side, permission-filtered); otherwise falls back to the public
// Donor page. Mirrors BrowseView.js's donors column render logic.
export const getDonorHref = (donor, userDownloadAccess) => {
    const protectedHref = donor?.protected_donor?.['@id'];
    if (userDownloadAccess?.['protected'] && protectedHref) return protectedHref;
    return donor?.['@id'] || null;
};

export const getDisplayText = (value) => {
    if (value === null || typeof value === 'undefined' || value === '') {
        return '-';
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return '-';
        return value.join(', ');
    }
    if (typeof value === 'number') {
        return String(value);
    }
    if (typeof value === 'object') {
        if (value.display_title) return value.display_title;
        if (value.title) return value.title;
        if (value['@id']) return value['@id'];
    }
    return String(value);
};

// Replaces the leading TPC protocol code in a "<code> - <name>" tissue_type
// display string with the stable 4-letter internal code (e.g. "3AM - Brain,
// Cerebellum" -> "BRCE - Brain, Cerebellum") so the page title/breadcrumb/
// Target Tissue field read consistently with the Browse-by-Tissue table's
// column headers (BrowseTissueHeatmapTable.js's identical lookup). Only the
// leading code token is rewritten -- the descriptive name after it, and any
// value without a "<code> - " prefix at all (e.g. a plain ontology term
// display_title), pass through unchanged. Real submitted external_ids shown
// elsewhere in the aliquot visualization still use the raw TPC code, since
// that's the actual value GCCs submitted -- this only affects this
// human-facing label.
export const getTissueDisplayLabel = (value) => {
    const text = getDisplayText(value);
    if (text === '-') return text;
    const internalCode = getTissueInternalCodeFromFacetTerm(text);
    if (!internalCode) return text;
    return text.replace(/^\S+(?=\s-\s)/, internalCode);
};

// Keyed by data.js's internal tissue codes (e.g. 'LUNG', 'SKSE') so this
// stays in sync with the same TPC-code/tissue-name resolution used for
// facet categorization, rather than re-deriving tissue_type parsing here.
const ANATOMY_ICON_BY_INTERNAL_CODE = {
    BLOO: 'Blood.svg',
    BUCC: 'Buccal Swab.svg',
    ESOP: 'Esophagus.svg',
    COAS: 'Ascending Colon.svg',
    CODS: 'Descending Colon.svg',
    LIVR: 'Liver.svg',
    ADGL: 'Adrenal Gland.svg',
    ADGR: 'Adrenal Gland.svg',
    AORT: 'Aorta.svg',
    LUNG: 'Lung.svg',
    HART: 'Heart.svg',
    TESL: 'Testes or Ovary.svg',
    TESR: 'Testes or Ovary.svg',
    OVAL: 'Testes or Ovary.svg',
    OVAR: 'Testes or Ovary.svg',
    FBRO: 'Fibroblast.svg',
    SKSE: 'Sun-exposed skin.svg',
    SKNE: 'Non-exposed skin.svg',
    MUSC: 'Skeletal Muscle.svg',
    BRFL: 'Brain.svg',
    BRTL: 'Brain.svg',
    BRCE: 'Brain.svg',
    BRHL: 'Brain.svg',
    BRHR: 'Brain.svg',
};

// Fallback for tissue_type values with no TPC code prefix (e.g. plain
// "Brain", "Colon") that getTissueInternalCodeFromFacetTerm can't resolve.
const ANATOMY_ICON_BY_TISSUE_NAME = {
    brain: 'Brain.svg',
    colon: 'Colon.svg',
    'adipose tissue': 'Adipose Tissue.svg',
    adipose: 'Adipose Tissue.svg',
    'cell line mixture': 'Cell Line Mixture.svg',
};

// tissue_type is a "<TPC code> - <name>" string (e.g. "3Q - Lung"); resolve
// it to one of src/encoded/static/img/anatomy-icons' svgs so the Tissue
// Overview header icon reflects the actual tissue instead of always
// showing the generic lungs glyph. Returns null (caller falls back to the
// generic icon) when the tissue_type doesn't match a known icon.
export const getTissueIconSrc = (tissueTypeValue) => {
    const raw = String(tissueTypeValue || '').trim();
    if (!raw) return null;
    const internalCode = getTissueInternalCodeFromFacetTerm(raw);
    const filename =
        (internalCode && ANATOMY_ICON_BY_INTERNAL_CODE[internalCode]) ||
        ANATOMY_ICON_BY_TISSUE_NAME[raw.split(' - ').pop().split(',')[0].trim().toLowerCase()] ||
        null;
    // Filenames like "Adrenal Gland.svg" contain spaces, which breaks an
    // unquoted CSS url(...) (used for the mask-image header icon) unless
    // encoded here.
    return filename ? `/static/img/anatomy-icons/${encodeURIComponent(filename)}` : null;
};

// The physical aliquot block's real depth (front-to-back cm) isn't uniform
// across tissues (SMaHT Tissue Recovery Schema, Fig. 2a): Lung/Liver blocks
// are recovered noticeably deeper (medial+lateral halves in one block) than
// the standard strip tissues, while bivalved organs (Adrenal, Heart,
// Gonads) are cut into small anterior/posterior cubes instead. Keyed by the
// same internal tissue codes as ANATOMY_ICON_BY_INTERNAL_CODE above.
// DEFAULT_ALIQUOT_DEPTH_CM covers the "Muscle, Skin, Colon, Aorta,
// Esophagus" strip group and every Brain region (both 1.5cm per Fig. 2).
const DEFAULT_ALIQUOT_DEPTH_CM = 1.5;
const ALIQUOT_DEPTH_CM_BY_INTERNAL_CODE = {
    LUNG: 3,
    LIVR: 3,
    ADGL: 1,
    ADGR: 1,
    HART: 1,
    TESL: 1,
    TESR: 1,
    OVAL: 1,
    OVAR: 1,
};

// tissue_type is a "<TPC code> - <name>" string (e.g. "3Q - Lung"); resolve
// it to that tissue's real aliquot block depth in cm, falling back to the
// standard strip-tissue depth for anything not called out above (including
// tissue_type values with no TPC code prefix, e.g. plain "Brain").
export const getTissueAliquotDepthCm = (tissueTypeValue) => {
    const raw = String(tissueTypeValue || '').trim();
    if (!raw) return DEFAULT_ALIQUOT_DEPTH_CM;
    const internalCode = getTissueInternalCodeFromFacetTerm(raw);
    return (internalCode && ALIQUOT_DEPTH_CM_BY_INTERNAL_CODE[internalCode]) || DEFAULT_ALIQUOT_DEPTH_CM;
};

// Per Fig. 2a, Adrenal/Heart/Gonads are physically bivalved into Anterior
// and Posterior halves *before* aliquotting -- i.e. the real block is two
// separate small pieces, not one continuous strip. Lung/Liver blocks are
// instead cut into medial and lateral portions. Which specific donor
// TissueSample is which half isn't itself a stored field (no field on
// TissueSample/Tissue, and no reliable naming convention in external_id/
// description/submitted_id -- confirmed by inspecting real Adrenal/Heart/
// Testis fixture records, whose only laterality-like text is organ-side
// Left/Right, a different concept) -- but which half a given *aliquot
// number* belongs to is a fixed fact of the recovery protocol itself (Fig.
// 2a's own layout, identical for every donor), not something inferred from
// this donor's data. See BIVALVED_TEMPLATE_BY_INTERNAL_CODE/
// buildBivalvedTemplateSlices below for how that's used to place each real
// aliquot at its correct position.
const BIVALVED_NOTE =
    'This organ is recovered as two separate pieces (Anterior and Posterior halves) before aliquotting, shown below in that fixed layout. Muted slices are positions with no aliquot submitted yet for this donor.';
const MEDIAL_LATERAL_NOTE =
    'This tissue block is recovered with lateral and medial portions, shown below in that fixed layout. Muted slices are positions with no aliquot submitted yet for this donor.';
const ALIQUOT_LAYOUT_NOTE_BY_INTERNAL_CODE = {
    LUNG: MEDIAL_LATERAL_NOTE,
    LIVR: MEDIAL_LATERAL_NOTE,
    ADGL: BIVALVED_NOTE,
    ADGR: BIVALVED_NOTE,
    HART: BIVALVED_NOTE,
    TESL: BIVALVED_NOTE,
    TESR: BIVALVED_NOTE,
    OVAL: BIVALVED_NOTE,
    OVAR: BIVALVED_NOTE,
};

// Returns an explanatory note for tissues whose real recovery/aliquotting
// layout isn't a single continuous strip (see above), or null for tissues
// where the single-strip rendering already matches reality.
export const getAliquotLayoutNote = (tissueTypeValue) => {
    const raw = String(tissueTypeValue || '').trim();
    if (!raw) return null;
    const internalCode = getTissueInternalCodeFromFacetTerm(raw);
    return (internalCode && ALIQUOT_LAYOUT_NOTE_BY_INTERNAL_CODE[internalCode]) || null;
};

// True only for the medial/lateral tissues above (Lung/Liver), not the
// bivalved ones -- used to gate AliquotVisualization's
// enableMedialLateralLayers (draws the fixed Lateral/Medial depth-layered
// layout -- see LUNG_LIVER_TEMPLATE/getMedialLateralTemplate below).
export const isMedialLateralAliquotLayout = (tissueTypeValue) => {
    const raw = String(tissueTypeValue || '').trim();
    if (!raw) return false;
    const internalCode = getTissueInternalCodeFromFacetTerm(raw);
    return ALIQUOT_LAYOUT_NOTE_BY_INTERNAL_CODE[internalCode] === MEDIAL_LATERAL_NOTE;
};

// True only for the bivalved tissues above (Adrenal/Heart/Gonads), not the
// medial/lateral ones -- used to gate AliquotVisualization's
// enableBivalvedSplit (draws the fixed Anterior/Posterior layout -- see
// BIVALVED_TEMPLATE_BY_INTERNAL_CODE below).
export const isBivalvedAliquotLayout = (tissueTypeValue) => {
    const raw = String(tissueTypeValue || '').trim();
    if (!raw) return false;
    const internalCode = getTissueInternalCodeFromFacetTerm(raw);
    return ALIQUOT_LAYOUT_NOTE_BY_INTERNAL_CODE[internalCode] === BIVALVED_NOTE;
};

// The fixed Anterior/Posterior slice layout Fig. 2a shows for Adrenal/Heart
// -- 3 Frozen (1cm) + 2 Fixed (0.5cm) per half, alternating
// Frozen-Fixed-Frozen-Fixed-Frozen, with the Frozen and Fixed aliquot
// numbers each counting up continuously across both halves (Frozen 1-3 in
// Anterior, 4-6 in Posterior; Fixed 1-2 in Anterior, 3-4 in Posterior) --
// this is a fixed fact of the recovery protocol, identical for every donor
// of these tissues, not derived from any one donor's data.
const ADRENAL_HEART_BIVALVED_TEMPLATE = [
    { half: 0, type: 'yellow', seq: 1, widthCm: 1 },
    { half: 0, type: 'pink', seq: 1, widthCm: 0.5 },
    { half: 0, type: 'yellow', seq: 2, widthCm: 1 },
    { half: 0, type: 'pink', seq: 2, widthCm: 0.5 },
    { half: 0, type: 'yellow', seq: 3, widthCm: 1 },
    { half: 1, type: 'yellow', seq: 4, widthCm: 1 },
    { half: 1, type: 'pink', seq: 3, widthCm: 0.5 },
    { half: 1, type: 'yellow', seq: 5, widthCm: 1 },
    { half: 1, type: 'pink', seq: 4, widthCm: 0.5 },
    { half: 1, type: 'yellow', seq: 6, widthCm: 1 },
];

// Fig. 2a's Gonads layout -- 4 Frozen (1cm) + 1 Fixed (0.5cm) per half,
// Frozen-Frozen-Fixed-Frozen-Frozen, same continuing-numbering rule as
// above (Frozen 1-4 Anterior/5-8 Posterior, Fixed 1 Anterior/2 Posterior).
const GONADS_BIVALVED_TEMPLATE = [
    { half: 0, type: 'yellow', seq: 1, widthCm: 1 },
    { half: 0, type: 'yellow', seq: 2, widthCm: 1 },
    { half: 0, type: 'pink', seq: 1, widthCm: 0.5 },
    { half: 0, type: 'yellow', seq: 3, widthCm: 1 },
    { half: 0, type: 'yellow', seq: 4, widthCm: 1 },
    { half: 1, type: 'yellow', seq: 5, widthCm: 1 },
    { half: 1, type: 'yellow', seq: 6, widthCm: 1 },
    { half: 1, type: 'pink', seq: 2, widthCm: 0.5 },
    { half: 1, type: 'yellow', seq: 7, widthCm: 1 },
    { half: 1, type: 'yellow', seq: 8, widthCm: 1 },
];

const BIVALVED_TEMPLATE_BY_INTERNAL_CODE = {
    ADGL: ADRENAL_HEART_BIVALVED_TEMPLATE,
    ADGR: ADRENAL_HEART_BIVALVED_TEMPLATE,
    HART: ADRENAL_HEART_BIVALVED_TEMPLATE,
    TESL: GONADS_BIVALVED_TEMPLATE,
    TESR: GONADS_BIVALVED_TEMPLATE,
    OVAL: GONADS_BIVALVED_TEMPLATE,
    OVAR: GONADS_BIVALVED_TEMPLATE,
};

// tissue_type is a "<TPC code> - <name>" string; resolves to this tissue's
// fixed bivalved template (see above), or null for non-bivalved tissues.
export const getBivalvedTemplate = (tissueTypeValue) => {
    const raw = String(tissueTypeValue || '').trim();
    if (!raw) return null;
    const internalCode = getTissueInternalCodeFromFacetTerm(raw);
    return (internalCode && BIVALVED_TEMPLATE_BY_INTERNAL_CODE[internalCode]) || null;
};

// Expands a bivalved tissue's real (variable-length) slice list out to the
// full, fixed-size template (see getBivalvedTemplate) -- every template
// position is always present, in Anterior-then-Posterior order. A position
// is filled with this donor's real slice (and all its real data -- core
// positions, pathology links, etc.) when one exists whose own type + real
// aliquot number matches that position; every other position becomes an
// inert placeholder (isPlaceholder: true, no real data). This never guesses
// which half a real aliquot belongs to -- the template's half assignment is
// the fixed protocol fact described above, matched here purely by type +
// number. A real aliquot that doesn't match any template position (a number
// outside the range Fig. 2a documents, or with no parseable number at all)
// is still appended after the template instead of silently dropped -- the
// template describes the *expected* layout, not a hard cap on what a donor
// can actually have submitted.
export const buildBivalvedTemplateSlices = (template, realSlices = []) => {
    const realByTypeAndNumber = new Map();
    const unmatchableSlices = [];
    realSlices.forEach((slice) => {
        const number = parseInt(slice.aliquotNumber, 10);
        if (!Number.isFinite(number)) {
            unmatchableSlices.push(slice);
            return;
        }
        realByTypeAndNumber.set(`${slice.type}-${number}`, slice);
    });
    const consumedKeys = new Set();
    const templateSlices = template.map((templateSlice, index) => {
        const key = `${templateSlice.type}-${templateSlice.seq}`;
        const real = realByTypeAndNumber.get(key);
        if (real) {
            consumedKeys.add(key);
            return {
                ...real,
                type: templateSlice.type,
                widthCm: templateSlice.widthCm,
                bivalvedHalf: templateSlice.half,
                isPlaceholder: false,
            };
        }
        return {
            id: `bivalved-placeholder-${index}`,
            type: templateSlice.type,
            widthCm: templateSlice.widthCm,
            bivalvedHalf: templateSlice.half,
            isPlaceholder: true,
        };
    });
    const extraSlices = [];
    realByTypeAndNumber.forEach((slice, key) => {
        if (!consumedKeys.has(key)) extraSlices.push(slice);
    });
    return templateSlices.concat(extraSlices, unmatchableSlices);
};

// Fig. 2a's Lung/Liver layout -- a single depth-continuous block cut into a
// Lateral (front half, 0-1.5cm depth) and Medial (back half, 1.5-3cm depth)
// layer, each with the same 7-slice-wide strip (Fixed-Frozen-Frozen-Fixed-
// Frozen-Frozen-Fixed). Fixed/Frozen aliquot numbers count up continuously
// across both layers (Fixed 1-3 Lateral/4-6 Medial, Frozen 1-4 Lateral/5-8
// Medial) -- a fixed fact of the recovery protocol, identical for every
// donor of these tissues, same as the bivalved templates above.
const LUNG_LIVER_LAYER_WIDTH_PATTERN = [
    { type: 'pink', widthCm: 0.5 },
    { type: 'yellow', widthCm: 1 },
    { type: 'yellow', widthCm: 1 },
    { type: 'pink', widthCm: 0.5 },
    { type: 'yellow', widthCm: 1 },
    { type: 'yellow', widthCm: 1 },
    { type: 'pink', widthCm: 0.5 },
];
function buildMedialLateralLayer(layer, pinkStart, yellowStart) {
    let pinkSeq = pinkStart;
    let yellowSeq = yellowStart;
    return LUNG_LIVER_LAYER_WIDTH_PATTERN.map(({ type, widthCm }) => {
        return {
            layer,
            type,
            seq: type === 'pink' ? pinkSeq++ : yellowSeq++,
            widthCm,
        };
    });
}
const LUNG_LIVER_TEMPLATE = [
    ...buildMedialLateralLayer(0, 1, 1), // Lateral (front): Fixed 1-3, Frozen 1-4
    ...buildMedialLateralLayer(1, 4, 5), // Medial (back): Fixed 4-6, Frozen 5-8
];
const MEDIAL_LATERAL_TEMPLATE_BY_INTERNAL_CODE = {
    LUNG: LUNG_LIVER_TEMPLATE,
    LIVR: LUNG_LIVER_TEMPLATE,
};

// tissue_type is a "<TPC code> - <name>" string; resolves to this tissue's
// fixed medial/lateral template (see above), or null for non-Lung/Liver
// tissues.
export const getMedialLateralTemplate = (tissueTypeValue) => {
    const raw = String(tissueTypeValue || '').trim();
    if (!raw) return null;
    const internalCode = getTissueInternalCodeFromFacetTerm(raw);
    return (internalCode && MEDIAL_LATERAL_TEMPLATE_BY_INTERNAL_CODE[internalCode]) || null;
};

// Lung/Liver counterpart to buildBivalvedTemplateSlices above -- same
// matching-by-type-and-number logic (see that function's comment), just
// tagging each slice with `medialLateralLayer` (0 = Lateral/front, 1 =
// Medial/back) instead of `bivalvedHalf`.
export const buildMedialLateralTemplateSlices = (template, realSlices = []) => {
    const realByTypeAndNumber = new Map();
    const unmatchableSlices = [];
    realSlices.forEach((slice) => {
        const number = parseInt(slice.aliquotNumber, 10);
        if (!Number.isFinite(number)) {
            unmatchableSlices.push(slice);
            return;
        }
        realByTypeAndNumber.set(`${slice.type}-${number}`, slice);
    });
    const consumedKeys = new Set();
    const templateSlices = template.map((templateSlice, index) => {
        const key = `${templateSlice.type}-${templateSlice.seq}`;
        const real = realByTypeAndNumber.get(key);
        if (real) {
            consumedKeys.add(key);
            return {
                ...real,
                type: templateSlice.type,
                widthCm: templateSlice.widthCm,
                medialLateralLayer: templateSlice.layer,
                isPlaceholder: false,
            };
        }
        return {
            id: `medial-lateral-placeholder-${index}`,
            type: templateSlice.type,
            widthCm: templateSlice.widthCm,
            medialLateralLayer: templateSlice.layer,
            isPlaceholder: true,
        };
    });
    const extraSlices = [];
    realByTypeAndNumber.forEach((slice, key) => {
        if (!consumedKeys.has(key)) extraSlices.push(slice);
    });
    return templateSlices.concat(extraSlices, unmatchableSlices);
};

// Builds a strip template from a plain type/widthCm pattern, numbering each
// type's own `seq` in the order it appears (1, 2, 3, ... independently for
// pink and yellow) -- shared by every single-row (no split/layering) fixed
// layout below.
function buildStripTemplate(widthPattern) {
    let pinkSeq = 1;
    let yellowSeq = 1;
    return widthPattern.map(({ type, widthCm }) => {
        return { type, seq: type === 'pink' ? pinkSeq++ : yellowSeq++, widthCm };
    });
}

// Fig. 2a's strip layout for Muscle/Skin/Colon/Aorta/Esophagus -- a single
// continuous 9-slice block (Fixed-Frozen-Frozen-Frozen-Fixed-Frozen-Frozen-
// Frozen-Fixed, 3 Fixed + 6 Frozen total), no split/layering unlike Lung/
// Liver or the bivalved organs. Fixed fact of the recovery protocol,
// identical for every donor of these tissues.
const STRIP_TEMPLATE = buildStripTemplate([
    { type: 'pink', widthCm: 0.5 },
    { type: 'yellow', widthCm: 1 },
    { type: 'yellow', widthCm: 1 },
    { type: 'yellow', widthCm: 1 },
    { type: 'pink', widthCm: 0.5 },
    { type: 'yellow', widthCm: 1 },
    { type: 'yellow', widthCm: 1 },
    { type: 'yellow', widthCm: 1 },
    { type: 'pink', widthCm: 0.5 },
]);

// Fig. 2a's Brain layout -- also a single strip (no split/layering), but a
// different fixed shape than the group above: one Fixed (0.5cm) followed by
// several Frozen (1cm each), no Fixed slices interleaved partway through.
// Frontal lobe/Temporal lobe/Cerebellum (only ever collected from the Left
// hemisphere) get 6 Frozen; Hippocampus (collected from *each* hemisphere,
// hence both BRHL and BRHR existing as separate tissue_types) gets 3.
const BRAIN_LOBE_TEMPLATE = buildStripTemplate([
    { type: 'pink', widthCm: 0.5 },
    { type: 'yellow', widthCm: 1 },
    { type: 'yellow', widthCm: 1 },
    { type: 'yellow', widthCm: 1 },
    { type: 'yellow', widthCm: 1 },
    { type: 'yellow', widthCm: 1 },
    { type: 'yellow', widthCm: 1 },
]);
const BRAIN_HIPPOCAMPUS_TEMPLATE = buildStripTemplate([
    { type: 'pink', widthCm: 0.5 },
    { type: 'yellow', widthCm: 1 },
    { type: 'yellow', widthCm: 1 },
    { type: 'yellow', widthCm: 1 },
]);

const STRIP_TEMPLATE_BY_INTERNAL_CODE = {
    MUSC: STRIP_TEMPLATE,
    SKSE: STRIP_TEMPLATE,
    SKNE: STRIP_TEMPLATE,
    COAS: STRIP_TEMPLATE,
    CODS: STRIP_TEMPLATE,
    AORT: STRIP_TEMPLATE,
    ESOP: STRIP_TEMPLATE,
    BRFL: BRAIN_LOBE_TEMPLATE,
    BRTL: BRAIN_LOBE_TEMPLATE,
    BRCE: BRAIN_LOBE_TEMPLATE,
    BRHL: BRAIN_HIPPOCAMPUS_TEMPLATE,
    BRHR: BRAIN_HIPPOCAMPUS_TEMPLATE,
};

// tissue_type is a "<TPC code> - <name>" string; resolves to this tissue's
// fixed strip template (see above), or null for tissues that don't use one
// of these fixed single-row layouts (e.g. Lung/Liver, the bivalved organs,
// or any tissue_type Fig. 2a doesn't cover at all).
export const getStripTemplate = (tissueTypeValue) => {
    const raw = String(tissueTypeValue || '').trim();
    if (!raw) return null;
    const internalCode = getTissueInternalCodeFromFacetTerm(raw);
    return (internalCode && STRIP_TEMPLATE_BY_INTERNAL_CODE[internalCode]) || null;
};

// Strip-tissue counterpart to buildBivalvedTemplateSlices/
// buildMedialLateralTemplateSlices above -- same matching-by-type-and-number
// logic (see buildBivalvedTemplateSlices' comment), just with no group field
// to tag (a strip is one continuous row, not split into halves/layers).
export const buildStripTemplateSlices = (template, realSlices = []) => {
    const realByTypeAndNumber = new Map();
    const unmatchableSlices = [];
    realSlices.forEach((slice) => {
        const number = parseInt(slice.aliquotNumber, 10);
        if (!Number.isFinite(number)) {
            unmatchableSlices.push(slice);
            return;
        }
        realByTypeAndNumber.set(`${slice.type}-${number}`, slice);
    });
    const consumedKeys = new Set();
    const templateSlices = template.map((templateSlice, index) => {
        const key = `${templateSlice.type}-${templateSlice.seq}`;
        const real = realByTypeAndNumber.get(key);
        if (real) {
            consumedKeys.add(key);
            return {
                ...real,
                type: templateSlice.type,
                widthCm: templateSlice.widthCm,
                isPlaceholder: false,
            };
        }
        return {
            id: `strip-placeholder-${index}`,
            type: templateSlice.type,
            widthCm: templateSlice.widthCm,
            isPlaceholder: true,
        };
    });
    const extraSlices = [];
    realByTypeAndNumber.forEach((slice, key) => {
        if (!consumedKeys.has(key)) extraSlices.push(slice);
    });
    return templateSlices.concat(extraSlices, unmatchableSlices);
};

export const formatYesNo = (value) => {
    if (value === null || typeof value === 'undefined') return '-';
    return value ? 'Yes' : 'No';
};

// tissue_autolysis_score is an integer 0-3 (mixins.json's
// tissue_autolysis_score: 0=None, 1=mild, 2=moderate, 3=severe) -- the whole
// cell is tinted by severity, same direction as BrowseTissueHeatmapTable.js's
// heatmap cells but a soft pastel fill instead of a solid one, matching this
// table's plainer style. Exported for the <td>'s own className.
export const getAutolysisScoreCellClass = (value) => {
    if (typeof value !== 'number') return '';
    return `autolysis-score-cell score-${Math.min(value, 3)}`;
};

// Exported for unit testing. When a donor has multiple Tissue records for
// this tissue_type, prefers the one with a populated pathology_summary over
// an arbitrary "first encountered" pick, so this matches the selection rule
// used by BrowseTissueHeatmapTable.js's buildTissueMetricMatrix.
export const dedupeTissuesByDonor = (tissueResults = []) => {
    const byDonorUuid = new Map();
    tissueResults.forEach((tissueItem) => {
        const d = tissueItem?.donor;
        if (!d?.uuid) return;
        const existing = byDonorUuid.get(d.uuid);
        if (!existing) {
            byDonorUuid.set(d.uuid, { donor: d, tissue: tissueItem });
        } else if (!existing.tissue?.pathology_summary && tissueItem?.pathology_summary) {
            byDonorUuid.set(d.uuid, { donor: d, tissue: tissueItem });
        }
    });
    // Sort by donor display_title (e.g. "SMHT001", "SMHT004", ...) so the
    // Donor Details table and the aliquot donor picker both show a stable,
    // predictable order instead of whatever order the search results happen
    // to arrive in.
    return Array.from(byDonorUuid.values()).sort((a, b) => {
        const aLabel = a.donor?.display_title || '';
        const bLabel = b.donor?.display_title || '';
        return aLabel.localeCompare(bLabel, undefined, { numeric: true });
    });
};

export const TissueDatum = ({ title, value, unit = null, href = null }) => {
    const text = getDisplayText(value);
    const textToRender = unit && text !== '-' ? `${text} ${unit}` : text;
    const isComingSoon = text === 'Protected';

    return (
        <div className="datum">
            <span className="datum-title">{title}</span>
            <span className={'datum-value' + (isComingSoon ? ' coming-soon' : '')}>
                {href && text !== '-' ? <a href={href}>{textToRender}</a> : textToRender}
            </span>
        </div>
    );
};

// A donor's Fixed and Frozen Tissue records for the same organ share one
// `tissue_type` string (a backend ontology grouping term -- confirmed
// against real data: e.g. SMHT004-3G [Frozen] and SMHT004-3H [Fixed] both
// compute tissue_type "3G - Colon, Desc"), i.e. the backend already treats
// them as one tissue block. The aliquot panel follows that: it combines
// TissueSamples from both sibling Tissue records into one box, same as this
// illustrative fallback shows before any real data has loaded.
export const sampleAliquotSlicesFallback = [
    { id: 'fixed-1', type: 'pink', widthCm: 0.5, description: 'Fixed edge aliquot for preservation workflow.' },
    { id: 'frozen-1', type: 'yellow', widthCm: 1, description: 'Frozen aliquot reserved for sequencing-ready extraction.' },
    { id: 'frozen-2', type: 'yellow', widthCm: 1, description: 'Frozen aliquot reserved for replicate processing.' },
    { id: 'frozen-3', type: 'yellow', widthCm: 1, description: 'Frozen aliquot for downstream QC and validation.' },
    { id: 'fixed-2', type: 'pink', widthCm: 0.5, description: 'Fixed center aliquot for morphology review.' },
    { id: 'frozen-4', type: 'yellow', widthCm: 1, description: 'Frozen aliquot held as backup material.' },
    { id: 'frozen-5', type: 'yellow', widthCm: 1, description: 'Frozen aliquot reserved for replicate processing.' },
    { id: 'frozen-6', type: 'yellow', widthCm: 1, description: 'Frozen aliquot for downstream QC and validation.' },
    { id: 'fixed-3', type: 'pink', widthCm: 0.5, description: 'Fixed edge aliquot for archive retention.' },
];

// "{donor}-{protocol}" from a real sample's own external_id (mirrors
// item_utils/tissue_sample.py's get_tissue_kit_id_from_external_id) -- used
// as that slice's own id prefix, since combining Fixed+Frozen means the two
// halves of one box no longer share a single protocol code.
export function getTissueKitIdFromExternalId(externalId) {
    if (!externalId) return null;
    return externalId.split('-').slice(0, 2).join('-');
}

export const sampleNonSolidAliquots = [
    { id: 'aliquot-1', description: 'Primary collection tube reserved for sequencing-ready extraction.' },
    { id: 'aliquot-2', description: 'Secondary collection tube held as backup material.' },
];

// A Core TissueSample's own external_id ends in "<3-digit aliquot>[A-F][1-6]"
// (item_utils/tissue_sample.py's CORE_REGEX) -- e.g. "SMHT001-3AL-001B2" is
// specifically core position B2. Extracting it here means the popover's
// core grid highlight reflects this sample's real position instead of a
// fixed default.
export const CORE_POSITION_SUFFIX_REGEX = /-[0-9]{3}([A-F][1-6])$/;
export function getCorePositionFromExternalId(externalId) {
    const match = externalId ? externalId.match(CORE_POSITION_SUFFIX_REGEX) : null;
    return match ? match[1] : null;
}

// The 3-digit aliquot number is shared by every Core TissueSample cut from
// the same physical Frozen aliquot, just at a different position
// (item_utils/tissue_sample.py's TISSUE_ALIQUOT_REGEX "-NNN$" is that same
// number without a position suffix, CORE_REGEX "-NNN[A-F][1-6]$" is one
// Core derived from it) -- grouping real slices by idPrefix + this number
// is how multiple Core samples end up as one slice box with several
// highlighted positions instead of one duplicate box per position.
export const ALIQUOT_NUMBER_REGEX = /-([0-9]{3})(?:[A-F][1-6])?$/;
export function getAliquotNumberFromExternalId(externalId) {
    const match = externalId ? externalId.match(ALIQUOT_NUMBER_REGEX) : null;
    return match ? match[1] : null;
}

// A TPC (Tissue Procurement Center, e.g. "NDRI TPC") record is the
// procurement-level entry for a sample, not a sequencing/file-producing one
// -- unlike a GCC's, it has no files of its own to link to, so callers
// exclude it entirely from GCC-attribution UI (grid dots/popover lists in
// AliquotVisualization.js, non-solid aliquot tube labels in
// NonSolidAliquotVisualization.js) rather than showing it as if it were the
// aliquot's owning GCC. A null/missing center (illustrative/demo data,
// before a real donor is selected) isn't a TPC and is left alone.
export function isTpcSubmissionCenter(center) {
    return typeof center === 'string' && center.trim().endsWith('TPC');
}

// Scopes to donor + tissue_type + the GCC that sequenced the files, and
// (when `coreExternalId` is given) further down to one specific core
// position's own TissueSample. File.sample_summary.sample_names holds that
// TissueSample's real external_id verbatim (confirmed in
// item_utils/sample.py's get_sample_names -> item.get_external_id) -- it
// isn't declared in file.json's `facets` (so it won't show up as a facet
// widget in the Browse UI), but Snovault turns *any* query param into an
// `embedded.<field>` term filter regardless of whether it's a declared facet
// (see snovault's search.py:prepare_search_term), so filtering by it here
// still works correctly even though it's not a facet. Mirrors the verified
// donor+tissue link BrowseDonorBase.js already builds for the Files stat.
//
// Filters by File.sequencing_center (which GCC's lab/instrument actually
// produced the data), NOT File.submission_centers ("Generated By" -- whoever
// submitted *that specific File record*, which for reprocessed/derived
// files is often a downstream analysis center like "HMS DAC" rather than
// the originating GCC; confirmed against real fixture data: 10 of 12 files
// traced back to one donor+tissue's TissueSamples had submission_centers
// "HMS DAC"). sequencing_center is the better conceptual match for "this
// GCC's own files", but it is NOT a required File property (file.json's
// `required` list doesn't include it) -- also confirmed against real
// fixture data, a small fraction of files (~3% in local fixtures, mostly
// older/raw sequencer output) have it unset despite clearly belonging to a
// GCC (filename/submission_centers say so). Those files are silently
// excluded from this link's results -- a known, accepted gap, not a bug --
// since no single File field reliably captures "which GCC's aliquot this
// derives from" for every File subtype/pipeline stage.
//
// TissueSample.submission_centers (what feeds this function's
// `submissionCenter` param) can also be a TPC (Tissue Procurement Center,
// e.g. "NDRI TPC") or a TTD/DAC/OC-suffixed center -- confirmed against
// real submission_center fixture data, every center's title consistently
// ends in its role suffix (GCC/TPC/TTD/DAC/OC), and only GCC-suffixed
// centers ever run sequencing. Filtering by a non-GCC center would
// structurally always return zero results, so only build the link when the
// aliquot's submitting center is itself a GCC.
export const getGccFilesBrowseHref = ({
    donorDisplayTitle,
    tissueTypeValue,
    submissionCenter,
    // Optional -- a specific core position's own TissueSample.external_id
    // (e.g. "SMHT004-3AF-001B5"). When given, narrows the link down to just
    // that core's own files instead of every file this GCC produced for the
    // whole donor+tissue.
    coreExternalId,
}) => {
    if (!donorDisplayTitle || !tissueTypeValue || !submissionCenter) return null;
    if (!submissionCenter.trim().endsWith('GCC')) return null;
    const queryParts = [
        'type=File',
        BROWSE_STATUS_FILTERS,
        // Percent-encoded "!" (not the literal 'dataset!=No+value') --
        // Snovault's own URL canonicalization always encodes a raw "!" in
        // a query string and 301-redirects to the encoded form, so this
        // skips that extra round-trip.
        'dataset%21=No+value',
        `donors.display_title=${encodeURIComponent(donorDisplayTitle)}`,
        `sample_summary.tissues=${encodeURIComponent(tissueTypeValue)}`,
        `sequencing_center.display_title=${encodeURIComponent(submissionCenter)}`,
        coreExternalId
            ? `sample_summary.sample_names=${encodeURIComponent(coreExternalId)}`
            : null,
    ].filter(Boolean);
    return `/browse/?${queryParts.join('&')}`;
};

// Unfiltered-by-GCC counterpart to getGccFilesBrowseHref, for the page's
// own "Files: N" stat -- most real files trace back to a downstream
// processing/analysis center (e.g. "HMS DAC"), not the GCC that submitted
// the originating TissueSample, so per-core-position GCC links can only ever surface
// a fraction of a tissue's files (confirmed against real fixture data: 10
// of 12 files for one donor+tissue combination were HMS DAC, only 2 were
// the aliquot's own submitting GCC). This mirrors exactly the donor+tissue
// query each page's own file-count fetch already uses (TissueView.js adds
// donorDisplayTitle, TissueTypeView.js's is tissue-only across every donor
// sharing the tissue_type), so the count and the link always agree.
// donorDisplayTitle is optional -- omit it to match TissueTypeView.js's
// donor-independent count.
export const getTissueFilesBrowseHref = ({ donorDisplayTitle, tissueTypeValue }) => {
    if (!tissueTypeValue) return null;
    const queryParts = [
        'type=File',
        BROWSE_STATUS_FILTERS,
        // Percent-encoded "!" (not the literal 'dataset!=No+value') --
        // Snovault's own URL canonicalization always encodes a raw "!" in
        // a query string and 301-redirects to the encoded form, so this
        // skips that extra round-trip.
        'dataset%21=No+value',
        donorDisplayTitle ? `donors.display_title=${encodeURIComponent(donorDisplayTitle)}` : null,
        `sample_summary.tissues=${encodeURIComponent(tissueTypeValue)}`,
    ].filter(Boolean);
    return `/browse/?${queryParts.join('&')}`;
};
