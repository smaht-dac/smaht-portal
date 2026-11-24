'use strict';

// --- Per-aliquot values behind an Autolysis Score/Target Tissue % cell ---
//
// A cell shows Tissue.pathology_summary's one value per subtype -- the
// highest across the donor's Fixed aliquots (types/tissue.py), each of which
// has its own NonBrainPathologyReport. The cell popover lists every
// aliquot's own value when they differ, read straight off the reports (no
// stored per-aliquot breakdown to reindex for). Keyed like the table: the
// donor's external_id + the (subtype-composite) column key.
const NON_BRAIN_REPORT_ALIQUOT_FIELDS = [
    'target_tissues',
    'tissue_samples.display_title',
    'tissue_samples.sample_sources.tissue_type',
    'tissue_samples.sample_sources.donor.display_title',
];
export const NON_BRAIN_REPORT_ALIQUOT_SEARCH_HREF =
    '/search/?type=NonBrainPathologyReport&status%21=deleted' +
    '&tissue_samples.sample_sources.donor.study=Production' +
    '&tissue_samples.sample_sources.donor.tags=has_released_files&limit=all&' +
    NON_BRAIN_REPORT_ALIQUOT_FIELDS.map((field) => `field=${encodeURIComponent(field)}`).join('&');

// "SMHT031-3R-006" -> "006" (the aliquot's own number), else the id itself.
const getAliquotLabel = (sampleId) => {
    const match = String(sampleId || '').match(/-([0-9]{3})$/);
    return match ? match[1] : sampleId || null;
};

// `getColumnKey(tissueType, subtype)` -- the table's own makeSubtypeColumnKey.
export function buildAliquotValuesIndex(reports = [], getColumnKey) {
    const index = {};
    reports.forEach((report) => {
        const [sample] = report?.tissue_samples || [];
        const [source] = sample?.sample_sources || [];
        const donorId = source?.donor?.display_title;
        const tissueType = source?.tissue_type;
        if (!donorId || !tissueType) return;
        const label = getAliquotLabel(sample?.display_title);
        (report.target_tissues || []).forEach((entry) => {
            if (entry?.target_tissue_present !== 'Yes' || !entry.target_tissue_subtype) return;
            const key = `${donorId} ${getColumnKey(tissueType, entry.target_tissue_subtype)}`;
            const values = index[key] || (index[key] = { autolysis: [], targetPercentage: [] });
            values.autolysis.push({ label, value: entry.target_tissue_autolysis_score ?? null });
            values.targetPercentage.push({ label, value: entry.target_tissue_percentage ?? null });
        });
    });
    Object.values(index).forEach((values) => {
        Object.values(values).forEach((list) => list.sort((a, b) => String(a.label).localeCompare(String(b.label))));
    });
    return index;
}

// Only when the aliquots actually disagree -- otherwise the cell's own value
// already says it all.
export function getDifferingAliquotEntries(index, donor, columnKey, metric) {
    const list = index?.[`${donor} ${columnKey}`]?.[metric];
    if (!list || list.length < 2) return null;
    const distinct = new Set(list.map((entry) => entry.value));
    return distinct.size > 1 ? list : null;
}
