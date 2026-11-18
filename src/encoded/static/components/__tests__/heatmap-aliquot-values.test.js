import { buildAliquotValuesIndex, getDifferingAliquotEntries } from '../browse/browse-view/heatmap-aliquot-values';

// Stands in for BrowseTissueHeatmapTable's makeSubtypeColumnKey.
const makeSubtypeColumnKey = (tissueType, subtype) => `${tissueType}|${subtype}`;

// One NonBrainPathologyReport as the heatmap's report search returns it.
const report = (sampleId, donor, tissueType, targetTissues) => ({
    tissue_samples: [
        {
            display_title: sampleId,
            sample_sources: [{ tissue_type: tissueType, donor: { display_title: donor } }],
        },
    ],
    target_tissues: targetTissues,
});

const subtype = (name, autolysis, percentage, present = 'Yes') => ({
    target_tissue_subtype: name,
    target_tissue_present: present,
    target_tissue_autolysis_score: autolysis,
    target_tissue_percentage: percentage,
});

const COLON = '3H - Colon, Desc';
const REPORTS = [
    report('SMHT031-3H-002', 'SMHT031', COLON, [subtype('Mucosa', 3, '[11-25]'), subtype('Muscularis propria', 1, '[50-100]')]),
    report('SMHT031-3H-001', 'SMHT031', COLON, [subtype('Mucosa', 2, '[11-25]'), subtype('Muscularis propria', 1, '[50-100]')]),
    report('SMHT004-3H-001', 'SMHT004', COLON, [subtype('Mucosa', 1, '[0-10]'), subtype('Muscularis propria', null, null, 'No')]),
];

describe('buildAliquotValuesIndex', () => {
    const index = buildAliquotValuesIndex(REPORTS, makeSubtypeColumnKey);

    test('keys each present subtype by donor and subtype column, one entry per aliquot in aliquot order', () => {
        const mucosa = index[`SMHT031 ${makeSubtypeColumnKey(COLON, 'Mucosa')}`];
        expect(mucosa.autolysis).toEqual([
            { label: '001', value: 2 },
            { label: '002', value: 3 },
        ]);
        expect(mucosa.targetPercentage).toEqual([
            { label: '001', value: '[11-25]' },
            { label: '002', value: '[11-25]' },
        ]);
    });

    test('leaves out a subtype that wasn\'t present', () => {
        expect(index[`SMHT004 ${makeSubtypeColumnKey(COLON, 'Muscularis propria')}`]).toBeUndefined();
    });
});

describe('getDifferingAliquotEntries', () => {
    const index = buildAliquotValuesIndex(REPORTS, makeSubtypeColumnKey);

    test('lists every aliquot\'s value when they differ', () => {
        const entries = getDifferingAliquotEntries(index, 'SMHT031', makeSubtypeColumnKey(COLON, 'Mucosa'), 'autolysis');
        expect(entries.map((entry) => entry.value)).toEqual([2, 3]);
    });

    test('is null when the aliquots agree, there is only 1, or nothing is loaded', () => {
        const mucosa = makeSubtypeColumnKey(COLON, 'Mucosa');
        expect(getDifferingAliquotEntries(index, 'SMHT031', mucosa, 'targetPercentage')).toBeNull();
        expect(getDifferingAliquotEntries(index, 'SMHT004', mucosa, 'autolysis')).toBeNull();
        expect(getDifferingAliquotEntries(null, 'SMHT031', mucosa, 'autolysis')).toBeNull();
    });
});
