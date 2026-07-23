import {
    countsMatch,
    getApiTotalFromResponse,
    matrixRenderStateIsReady,
    parsePositiveIntegerCount,
    requireMatchingCounts,
    toBarIdentity,
} from '../dataMatrixUtils';


describe('getApiTotalFromResponse', () => {
    const url = '/browse/?type=File&format=json';

    test('accepts successful numeric totals and the documented empty-result response', () => {
        expect(getApiTotalFromResponse({ status: 200, body: { total: 12 } }, url)).toBe(12);
        expect(getApiTotalFromResponse({ status: 404, body: { total: 0 } }, url)).toBe(0);
    });

    test.each([
        [404, { total: '0' }],
        [404, { total: 1 }],
        [500, { total: 0 }],
        [200, {}],
        [200, { total: '12' }],
        [200, { total: -1 }],
    ])('rejects unexpected or malformed response status=%s body=%p', (status, body) => {
        expect(() => getApiTotalFromResponse({ status, body }, url)).toThrow(url);
    });
});

describe('matrixRenderStateIsReady', () => {
    const hydratedState = {
        surfaceExists: true,
        surfaceVisible: true,
        surfaceRefreshing: false,
        overlayExists: false,
        visualExists: true,
        visualVisible: true,
        visualLoading: false,
    };

    test('accepts hydrated Donor x Tissue markup without requiring grouping labels', () => {
        expect(matrixRenderStateIsReady({
            ...hydratedState,
            mode: 'donor-tissue',
            hasLabelSectionSpan: false,
        })).toBe(true);
    });

    test('accepts another hydrated matrix shape', () => {
        expect(matrixRenderStateIsReady({
            ...hydratedState,
            mode: 'donor-assay',
            hasLabelSectionSpan: true,
        })).toBe(true);
    });

    test.each([
        [{ ...hydratedState, visualExists: false }, 'empty pre-hydration surface'],
        [{ ...hydratedState, visualLoading: true }, 'loading visual shell'],
        [{ ...hydratedState, surfaceRefreshing: true }, 'refreshing surface'],
        [{ ...hydratedState, overlayExists: true }, 'refresh overlay'],
    ])('rejects %s (%s)', (state) => {
        expect(matrixRenderStateIsReady(state)).toBe(false);
    });
});

describe('dynamic bar count counterfactuals', () => {
    test('uses the current count when discovery saw 20 and execution sees 12', () => {
        const sampledIdentity = toBarIdentity({
            tissueTerm: '3AL - Brain, Temporal Lobe',
            sequencer: 'Illumina NovaSeq X Plus',
            dataCount: 20,
        });
        const currentBarCount = parsePositiveIntegerCount('12', 'current bar');

        expect(sampledIdentity).toEqual({
            tissueTerm: '3AL - Brain, Temporal Lobe',
            sequencer: 'Illumina NovaSeq X Plus',
        });
        expect(countsMatch(currentBarCount, 12)).toBe(true);
    });

    test('fails a persistent mismatch against the current count', () => {
        const currentBarCount = parsePositiveIntegerCount('12', 'current bar');
        expect(countsMatch(currentBarCount, 11)).toBe(false);
        expect(() => requireMatchingCounts(
            currentBarCount,
            11,
            'persistent current UI/API divergence: 12/11'
        )).toThrow('persistent current UI/API divergence: 12/11');
    });

    test.each(['0', '-1', '1.5', 'not-a-number', ''])('rejects invalid current bar count %p', (rawCount) => {
        expect(() => parsePositiveIntegerCount(rawCount, 'current bar')).toThrow('current bar');
    });
});
