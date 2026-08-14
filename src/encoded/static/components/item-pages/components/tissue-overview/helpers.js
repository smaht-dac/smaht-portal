'use strict';

import React from 'react';
import { getTissueInternalCodeFromFacetTerm } from '../../../util/data';
import { BROWSE_STATUS_FILTERS } from '../../../browse/BrowseView';

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
// specifically well B2. Extracting it here means the popover's well-plate
// highlight reflects this sample's real position instead of a fixed default.
export const CORE_WELL_SUFFIX_REGEX = /-[0-9]{3}([A-F][1-6])$/;
export function getCoreWellFromExternalId(externalId) {
    const match = externalId ? externalId.match(CORE_WELL_SUFFIX_REGEX) : null;
    return match ? match[1] : null;
}

// The 3-digit aliquot number is shared by every Core TissueSample cut from
// the same physical Frozen aliquot, just at a different well
// (item_utils/tissue_sample.py's TISSUE_ALIQUOT_REGEX "-NNN$" is that same
// number without a well suffix, CORE_REGEX "-NNN[A-F][1-6]$" is one Core
// derived from it) -- grouping real slices by idPrefix + this number is how
// multiple Core samples end up as one slice box with several highlighted
// wells instead of one duplicate box per well.
export const ALIQUOT_NUMBER_REGEX = /-([0-9]{3})(?:[A-F][1-6])?$/;
export function getAliquotNumberFromExternalId(externalId) {
    const match = externalId ? externalId.match(ALIQUOT_NUMBER_REGEX) : null;
    return match ? match[1] : null;
}

// Scopes to donor + tissue_type + the GCC that generated/submitted the
// files -- NOT to one specific well's TissueSample, since File's own
// sample_summary.sample_names isn't embedded/faceted for Browse (only
// sample_summary.tissues is, per file.json's facets). Mirrors the verified
// donor+tissue link BrowseDonorBase.js already builds for the Files stat.
// A File's submission_centers is whoever generated/submitted that file,
// which isn't guaranteed to be the same center that submitted this
// TissueSample -- so this is "this GCC's files for this donor+tissue",
// not strictly "this well's files".
export const getGccFilesBrowseHref = ({ donorDisplayTitle, tissueTypeValue, submissionCenter }) => {
    if (!donorDisplayTitle || !tissueTypeValue || !submissionCenter) return null;
    const queryParts = [
        'type=File',
        BROWSE_STATUS_FILTERS,
        'dataset!=No+value',
        `donors.display_title=${encodeURIComponent(donorDisplayTitle)}`,
        `sample_summary.tissues=${encodeURIComponent(tissueTypeValue)}`,
        `submission_centers.display_title=${encodeURIComponent(submissionCenter)}`,
    ];
    return `/browse/?${queryParts.join('&')}`;
};
