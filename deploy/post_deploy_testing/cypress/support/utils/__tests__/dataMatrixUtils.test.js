import { getApiTotalFromResponse } from '../dataMatrixUtils';


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
