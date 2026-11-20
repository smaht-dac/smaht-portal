import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import {
    buildTissueHistologyBarplotData,
    loadTissueSampleAggregations,
    loadTissueHistologyLinkedCounts,
    SUBMISSION_CENTER_FIELD,
    TISSUE_FIELD,
} from '../viz/BarPlot/tissue-histology-samples';
import { TISSUE_SAMPLE_TYPE_FIELD } from '../viz/BarPlot/tissue-sample-types';
import { mergeTermsInBarplotData } from '../viz/BarPlot/merge-terms';

jest.mock('@hms-dbmi-bgm/shared-portal-components/es/components/util', () => ({
    ajax: { load: jest.fn() },
}));

// One /tissue_sample_aggregations/ count node (see visualization.py).
const counts = (samples, donors, reportUuids = []) => ({
    doc_count: samples,
    samples,
    donors: donors.length,
    all_donors_ids: donors,
    pathology_report_uuids: reportUuids,
});

// A response grouped by tissue type, then sample type.
const GROUPED = {
    field: 'sample_sources.tissue_type',
    group_field: 'sample_type',
    total: counts(4, ['SMHT001', 'SMHT004'], ['R1', 'R2', 'R3']),
    terms: {
        '3Q - Lung': {
            term: '3Q - Lung',
            field: 'sample_type',
            total: counts(3, ['SMHT001', 'SMHT004'], ['R1']),
            terms: {
                'Fixed': counts(1, ['SMHT001'], ['R1']),
                'Snap Frozen': counts(1, ['SMHT001']),
                'Frozen': counts(1, ['SMHT004']),
            },
        },
        '3I - Liver': {
            term: '3I - Liver',
            field: 'sample_type',
            total: counts(1, ['SMHT004'], ['R2', 'R3']),
            terms: { 'Fixed': counts(1, ['SMHT004'], ['R2', 'R3']) },
        },
    },
};

describe('buildTissueHistologyBarplotData', () => {
    test('takes each bar\'s samples and donors from the aggregation', () => {
        const data = buildTissueHistologyBarplotData(GROUPED, [TISSUE_FIELD, TISSUE_SAMPLE_TYPE_FIELD]);
        expect(data.field).toBe(TISSUE_FIELD);
        expect(data.total).toMatchObject({ samples: 4, donors: 2, files: 0 });
        expect(data.terms['3Q - Lung'].total).toMatchObject({
            samples: 3,
            donors: 2,
            all_donors_ids: ['SMHT001', 'SMHT004'],
        });
        expect(data.terms['3I - Liver'].total).toMatchObject({ samples: 1, donors: 1 });
    });

    test('merges Snap Frozen into Frozen', () => {
        const data = mergeTermsInBarplotData(
            buildTissueHistologyBarplotData(GROUPED, [TISSUE_FIELD, TISSUE_SAMPLE_TYPE_FIELD])
        );
        const lung = data.terms['3Q - Lung'];
        expect(lung.field).toBe(TISSUE_SAMPLE_TYPE_FIELD);
        expect(Object.keys(lung.terms).sort()).toEqual(['Fixed', 'Frozen']);
        expect(lung.terms.Frozen).toMatchObject({ samples: 2, donors: 2 });
        expect(lung.terms.Fixed).toMatchObject({ samples: 1, donors: 1 });
    });

    test('an ungrouped response gives plain counts per term, a missing value as "Not specified"', () => {
        const aggregations = {
            total: counts(2, ['SMHT001']),
            terms: { 'UWSC GCC': counts(1, ['SMHT001']), 'No value': counts(1, ['SMHT001']) },
        };
        const data = buildTissueHistologyBarplotData(aggregations, [SUBMISSION_CENTER_FIELD]);
        expect(Object.keys(data.terms).sort()).toEqual(['Not specified', 'UWSC GCC']);
        expect(data.terms['Not specified']).toMatchObject({ samples: 1, donors: 1 });
    });

    test('counts each bar\'s distinct pathology reports and their histology images', () => {
        const linkedCounts = {
            imageIdsByReportUuid: {
                R1: ['/images/I1/', '/images/I2/'],
                R2: ['/images/I3/'],
                R3: ['/images/I3/'],
            },
        };
        const data = buildTissueHistologyBarplotData(GROUPED, [TISSUE_FIELD, TISSUE_SAMPLE_TYPE_FIELD], linkedCounts);
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
            buildTissueHistologyBarplotData(GROUPED, [TISSUE_FIELD, TISSUE_SAMPLE_TYPE_FIELD], { fileCountTerms })
        );
        const lung = data.terms['3Q - Lung'];
        expect(lung.total.files).toBe(30);
        expect(lung.terms.Frozen.files).toBe(25);
        expect(lung.terms.Fixed.files).toBe(0);
        expect(data.terms['3I - Liver'].total.files).toBe(0);
    });

    test('a missing (failed) aggregation has no terms and zero counts', () => {
        const data = buildTissueHistologyBarplotData(null, [TISSUE_FIELD, TISSUE_SAMPLE_TYPE_FIELD]);
        expect(data.terms).toEqual({});
        expect(data.total).toMatchObject({ samples: 0, donors: 0 });
    });
});

describe('loadTissueSampleAggregations', () => {
    beforeEach(() => ajax.load.mockReset());

    test('asks for the chart\'s fields as TissueSample fields, samples with reports of the released-donor population', async () => {
        ajax.load.mockImplementation((href, onSuccess, method, onError, body) => {
            expect(href).toBe('/tissue_sample_aggregations/');
            expect(method).toBe('POST');
            const { search_query_params: params, fields_to_aggregate_for: fields } = JSON.parse(body);
            expect(fields).toEqual(['sample_sources.tissue_type', 'sample_type']);
            expect(JSON.parse(body).only_with_pathology_reports).toBe(true);
            expect(params).toMatchObject({
                'sample_sources.donor.study': ['Production'],
                'sample_sources.donor.tags': ['has_released_files'],
                'preservation_type!': ['No value'],
            });
            onSuccess(GROUPED);
        });
        await expect(loadTissueSampleAggregations([TISSUE_FIELD, TISSUE_SAMPLE_TYPE_FIELD])).resolves.toBe(GROUPED);
    });

    test('a failed aggregation resolves to null', async () => {
        ajax.load.mockImplementation((href, onSuccess, method, onError) => onError({}));
        await expect(loadTissueSampleAggregations([TISSUE_FIELD])).resolves.toBeNull();
    });
});

describe('loadTissueHistologyLinkedCounts', () => {
    beforeEach(() => ajax.load.mockReset());

    test('maps each report (by uuid) to its images, and aggregates files with the given filters', async () => {
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
                    { '@id': '/images/I1/', pathology_reports: [{ '@id': '/non-brain-pathology-reports/R1/' }] },
                    {
                        '@id': '/images/I2/',
                        pathology_reports: [
                            { '@id': '/non-brain-pathology-reports/R1/' },
                            '/brain-pathology-reports/R2/',
                        ],
                    },
                ],
            });
        });
        const linkedCounts = await loadTissueHistologyLinkedCounts({ fileSearchParams: { type: ['File'] } });
        expect(linkedCounts.imageIdsByReportUuid).toEqual({
            R1: ['/images/I1/', '/images/I2/'],
            R2: ['/images/I2/'],
        });
        expect(linkedCounts.fileCountTerms).toBe(fileTerms);
    });

    test('a failed file aggregation counts as no files', async () => {
        ajax.load.mockImplementation((href, onSuccess, method, onError) => onError({ '@graph': [] }));
        await expect(loadTissueHistologyLinkedCounts()).resolves.toEqual({
            imageIdsByReportUuid: {},
            fileCountTerms: {},
        });
    });
});
