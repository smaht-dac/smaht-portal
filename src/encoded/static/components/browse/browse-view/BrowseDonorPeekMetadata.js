import { BROWSE_STATUS_FILTERS } from '../BrowseView';

export const DONOR_PEEK_METADATA_ADDITIONAL_FACETS = [
    'sample_summary.tissues',
    'assays.display_title',
    'type',
    'file_size',
];

export function buildDonorPeekMetadataHref(result) {
    const additionalFacetParams = DONOR_PEEK_METADATA_ADDITIONAL_FACETS.map(
        (facet) => `additional_facet=${facet}`
    ).join('&');

    return (
        `/peek-metadata/?skip_default_facets=true&${additionalFacetParams}&${BROWSE_STATUS_FILTERS}&dataset!=No+value&type=File&donors.display_title=` +
        result?.display_title
    );
}
