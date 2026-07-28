import { BROWSE_STATUS_FILTERS } from '../BrowseView';

// NOTE: `type` is deliberately excluded here. Combining
// `skip_default_facets=true` with `additional_facet=type` makes snovault
// infer a `stats` aggregation on the `embedded.@type.raw` keyword field,
// which Elasticsearch rejects (HTTP 400). The File count is instead read
// from the response's `total` (see BrowseDonorBase.js `files` column),
// which the GET peek-metadata endpoint now surfaces alongside `facets`.
export const DONOR_PEEK_METADATA_ADDITIONAL_FACETS = [
    'sample_summary.tissues',
    'assays.display_title',
    'file_size',
];

export function buildDonorPeekMetadataHref(result) {
    const additionalFacetParams = DONOR_PEEK_METADATA_ADDITIONAL_FACETS.map(
        (facet) => `additional_facet=${facet}`
    ).join('&');

    return (
        `/peek-metadata/?skip_default_facets=true&${additionalFacetParams}&${BROWSE_STATUS_FILTERS}&dataset!=No+value&type=File&donors.display_title=` +
        encodeURIComponent(result?.display_title)
    );
}
