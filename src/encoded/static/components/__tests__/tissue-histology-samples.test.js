import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import {
    buildTissueHistologyBarplotData,
    loadTissueHistologySamples,
    loadTissueHistologyLinkedCounts,
    SUBMISSION_CENTER_FIELD,
    TISSUE_FIELD,
} from '../viz/BarPlot/tissue-histology-samples';
import { TISSUE_SAMPLE_TYPE_FIELD } from '../viz/BarPlot/tissue-sample-types';
import { mergeTermsInBarplotData } from '../viz/BarPlot/merge-terms';

jest.mock('@hms-dbmi-bgm/shared-portal-components/es/components/util', () => ({
    ajax: { load: jest.fn() },
}));

const sample = (externalId, tissueType, donor, preservationType, center) => ({
    '@id': `/tissue-samples/${externalId}/`,
    external_id: externalId,
    preservation_type: preservationType,
    submission_centers: center ? [{ display_title: center }] : [],
    sample_sources: [{ tissue_type: tissueType, donor: { display_title: donor } }],
});

const SAMPLES = [
    sample('SMHT001-3Q-001', '3Q - Lung', 'SMHT001', 'Fixed', 'NDRI TPC'),
    sample('SMHT001-3Q-002', '3Q - Lung', 'SMHT001', 'Snap Frozen', 'BCM GCC'),
    sample('SMHT004-3Q-001', '3Q - Lung', 'SMHT004', 'Frozen', 'UWSC GCC'),
    sample('SMHT004-3I-001', '3I - Liver', 'SMHT004', 'Fixed', 'NDRI TPC'),
];

describe('buildTissueHistologyBarplotData', () => {
    test('counts distinct samples and donors per tissue', () => {
        const data = buildTissueHistologyBarplotData(SAMPLES, [TISSUE_FIELD]);
        expect(data.field).toBe(TISSUE_FIELD);
        expect(data.total).toMatchObject({ samples: 4, donors: 2, files: 0 });
        expect(data.terms['3Q - Lung']).toMatchObject({
            samples: 3,
            donors: 2,
            all_donors_ids: ['SMHT001', 'SMHT004'],
        });
        expect(data.terms['3I - Liver']).toMatchObject({ samples: 1, donors: 1 });
    });

    test('groups by the sample\'s own preservation type, merging Snap Frozen into Frozen', () => {
        const data = mergeTermsInBarplotData(
            buildTissueHistologyBarplotData(SAMPLES, [TISSUE_FIELD, TISSUE_SAMPLE_TYPE_FIELD])
        );
        const lung = data.terms['3Q - Lung'];
        expect(lung.field).toBe(TISSUE_SAMPLE_TYPE_FIELD);
        expect(lung.total.samples).toBe(3);
        expect(Object.keys(lung.terms).sort()).toEqual(['Fixed', 'Frozen']);
        expect(lung.terms.Frozen).toMatchObject({ samples: 2, donors: 2 });
        expect(lung.terms.Fixed).toMatchObject({ samples: 1, donors: 1 });
    });

    test('groups by submission center, with a missing value as "Not specified"', () => {
        const samples = SAMPLES.concat([sample('SMHT004-3I-002', '3I - Liver', 'SMHT004', 'Frozen', null)]);
        const data = buildTissueHistologyBarplotData(samples, [TISSUE_FIELD, SUBMISSION_CENTER_FIELD]);
        expect(Object.keys(data.terms['3Q - Lung'].terms).sort()).toEqual(['BCM GCC', 'NDRI TPC', 'UWSC GCC']);
        expect(data.terms['3I - Liver'].terms['Not specified']).toMatchObject({ samples: 1 });
    });

    test('counts each bar\'s distinct pathology reports and their histology images', () => {
        const samples = [
            { ...SAMPLES[0], pathology_reports: [{ '@id': '/reports/R1/' }] },
            { ...SAMPLES[3], pathology_reports: ['/reports/R2/', '/reports/R3/'] },
        ];
        const linkedCounts = {
            imageIdsByReportId: {
                '/reports/R1/': ['/images/I1/', '/images/I2/'],
                '/reports/R2/': ['/images/I3/'],
            },
        };
        const data = buildTissueHistologyBarplotData(samples, [TISSUE_FIELD, TISSUE_SAMPLE_TYPE_FIELD], linkedCounts);
        expect(data.terms['3Q - Lung'].terms.Fixed).toMatchObject({ pathology_reports: 1, histology_images: 2 });
        expect(data.terms['3I - Liver'].terms.Fixed).toMatchObject({ pathology_reports: 2, histology_images: 1 });
        expect(data.total).toMatchObject({ pathology_reports: 3, histology_images: 3 });
    });

    test('takes files from the file counts by tissue and preservation type, Snap Frozen counted once as Frozen', () => {
        const fileCountTerms = {
            '3Q - Lung': {
                total: { files: 30 },
                terms: { 'Frozen': { files: 20 }, 'Snap Frozen': { files: 5 }, 'Fixed': { files: 0 } },
            },
        };
        const data = mergeTermsInBarplotData(
            buildTissueHistologyBarplotData(SAMPLES, [TISSUE_FIELD, TISSUE_SAMPLE_TYPE_FIELD], { fileCountTerms })
        );
        const lung = data.terms['3Q - Lung'];
        expect(lung.total.files).toBe(30);
        expect(lung.terms.Frozen.files).toBe(25);
        expect(lung.terms.Fixed.files).toBe(0);
        expect(data.terms['3I - Liver'].total.files).toBe(0);
    });

    test('an empty sample list has no terms and zero counts', () => {
        const data = buildTissueHistologyBarplotData([], [TISSUE_FIELD, TISSUE_SAMPLE_TYPE_FIELD]);
        expect(data.terms).toEqual({});
        expect(data.total).toMatchObject({ samples: 0, donors: 0 });
    });
});

describe('loadTissueHistologySamples', () => {
    beforeEach(() => ajax.load.mockReset());

    test('unions both report searches, deduplicated by external_id', async () => {
        const [fixedSample, frozenSample] = SAMPLES;
        ajax.load.mockImplementation((href, onSuccess) => {
            const isAssociated = href.includes('associated_pathology_reports');
            // The same aliquot can be registered by both a TPC and a GCC.
            onSuccess({ '@graph': isAssociated ? [frozenSample, { ...frozenSample }] : [fixedSample] });
        });
        const samples = await loadTissueHistologySamples();
        expect(ajax.load).toHaveBeenCalledTimes(2);
        expect(samples.map((s) => s.external_id)).toEqual([fixedSample.external_id, frozenSample.external_id]);
    });

    test('leaves out samples with no preservation type', async () => {
        const [fixedSample] = SAMPLES;
        const unspecified = { ...fixedSample, external_id: 'SMHT001-3Q-009', preservation_type: undefined };
        ajax.load.mockImplementation((href, onSuccess) => onSuccess({ '@graph': [fixedSample, unspecified] }));
        const samples = await loadTissueHistologySamples();
        expect(samples.map((s) => s.external_id)).toEqual([fixedSample.external_id]);
    });

    test('an empty (404) search counts as no samples', async () => {
        ajax.load.mockImplementation((href, onSuccess, method, onError) => onError({ '@graph': [] }));
        await expect(loadTissueHistologySamples()).resolves.toEqual([]);
    });

    test('reuses the last load only when asked to', async () => {
        ajax.load.mockImplementation((href, onSuccess) => onSuccess({ '@graph': [] }));
        const first = loadTissueHistologySamples();
        expect(loadTissueHistologySamples({ reuse: true })).toBe(first);
        expect(loadTissueHistologySamples()).not.toBe(first);
    });
});

describe('loadTissueHistologyLinkedCounts', () => {
    beforeEach(() => ajax.load.mockReset());

    test('maps each report to its images, and aggregates files with the given filters', async () => {
        const fileTerms = { '3Q - Lung': { total: { files: 3 } } };
        ajax.load.mockImplementation((href, onSuccess, method, onError, body) => {
            if (href === '/bar_plot_aggregations/') {
                expect(JSON.parse(body)).toEqual({
                    search_query_params: { type: ['File'] },
                    fields_to_aggregate_for: [TISSUE_FIELD, TISSUE_SAMPLE_TYPE_FIELD],
                });
                onSuccess({ terms: fileTerms });
                return;
            }
            onSuccess({
                '@graph': [
                    { '@id': '/images/I1/', pathology_reports: [{ '@id': '/reports/R1/' }] },
                    { '@id': '/images/I2/', pathology_reports: [{ '@id': '/reports/R1/' }, '/reports/R2/'] },
                ],
            });
        });
        const linkedCounts = await loadTissueHistologyLinkedCounts({ fileSearchParams: { type: ['File'] } });
        expect(linkedCounts.imageIdsByReportId).toEqual({
            '/reports/R1/': ['/images/I1/', '/images/I2/'],
            '/reports/R2/': ['/images/I2/'],
        });
        expect(linkedCounts.fileCountTerms).toBe(fileTerms);
    });

    test('a failed file aggregation counts as no files', async () => {
        ajax.load.mockImplementation((href, onSuccess, method, onError) => onError({ '@graph': [] }));
        await expect(loadTissueHistologyLinkedCounts()).resolves.toEqual({
            imageIdsByReportId: {},
            fileCountTerms: {},
        });
    });
});
