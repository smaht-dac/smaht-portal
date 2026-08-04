'use strict';

import React from 'react';

// Shared between the legacy item-keyed TissueView.js (/tissues/<uuid>/'s
// "Tissue Overview" tab) and the type-keyed TissueTypeView.js
// (/tissue-overview/?tissue_type=<value>) -- both render the same kind of
// tissue_type summary from a list of Tissue search results, just sourced
// via a different route.

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
