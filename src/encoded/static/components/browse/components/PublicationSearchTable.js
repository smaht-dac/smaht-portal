import React from 'react';
import { transformedFacets } from '../SearchView';
import { BROWSE_LINKS } from '../BrowseView';
import { columnExtensionMap as originalColExtMap } from '../columnExtensionMap';
import { SearchView as CommonSearchView } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/SearchView';
import { Schemas } from '../../util';
import { capitalizeSentence } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/value-transforms';

// Custom result row component for publication search results
export const PublicationSearchResultRow = ({ result, rowNumber, rowProps }) => {
    const {
        '@id': atId,
        display_title,
        short_citation = '',
        scope = '',
        date_published = '',
        journal = '',
        journal_url = '',
        doi = '',
        key_image_link = '',
    } = result || {};

    return (
        <div className="search-result-row publication-search-result-row">
            <div className="thumbnail-title">
                <div className="thumbnail">
                    {key_image_link ? (
                        <img src={key_image_link} alt={display_title} />
                    ) : (
                        <div className="thumbnail-placeholder">
                            <i className="icon icon-fw icon-newspaper fas" />
                        </div>
                    )}
                </div>
                <div className="title">
                    <h4 className="value text-start fw-semibold">
                        <a
                            href={atId}
                            target="_blank"
                            rel="noreferrer noopener">
                            {display_title}
                        </a>
                    </h4>
                    <div className="author-info">
                        {short_citation && (
                            <span className="text-gray-70">
                                {short_citation}
                            </span>
                        )}
                        {result?.scope && (
                            <div className="scope">
                                <span>
                                    {result?.working_group_name ?? ''}{' '}
                                    {capitalizeSentence(result.scope)}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className="detail">
                {scope && <span className="text-gray-70 fw-bold">{scope}</span>}
                {date_published && <span>{date_published}</span>}
                {journal_url && journal && (
                    <a
                        href={journal_url}
                        target="_blank"
                        rel="noreferrer noopener">
                        {journal}
                        {doi && <span>, {doi}</span>}
                    </a>
                )}
            </div>
        </div>
    );
};

// A column extension map specifically for browse view file tables.
export function createBrowsePublicationColumnExtensionMap() {
    const columnExtensionMap = {
        ...originalColExtMap, // Pull in defaults for all tables
    };

    const columns = null;
    const hideFacets = ['status'];

    return { columnExtensionMap, columns, hideFacets };
}

// Search Table
export const BrowsePublicationSearchTable = (props) => {
    const { context, currentAction, schemas } = props;

    const facets = context?.facets
        ? transformedFacets(context, currentAction, schemas)
        : [];
    const tableColumnClassName = 'results-column col';
    const facetColumnClassName = 'facets-column col-auto';

    // Pass modified context to CommonSearchView to set default filters
    const passProps = {
        ...props,
        context: {
            ...context,
            clear_filters: BROWSE_LINKS.publication,
        },
    };

    const { columnExtensionMap, columns, hideFacets } =
        createBrowsePublicationColumnExtensionMap();

    return (
        <div className="publication-search-table-container">
            <CommonSearchView
                {...passProps}
                {...{
                    columnExtensionMap,
                    tableColumnClassName,
                    facetColumnClassName,
                    facets,
                    aboveFacetListComponent: null,
                    columns,
                    hideFacets,
                }}
                rowHeight={150}
                renderResultRow={(result, rowNumber, rowProps) => {
                    return (
                        <PublicationSearchResultRow
                            result={result}
                            rowNumber={rowNumber}
                            rowProps={rowProps}
                        />
                    );
                }}
                aboveTableComponent={
                    <h2 className="table-header text-gray-70 fs-3 fw-semibold">
                        {props.header_title || 'Publications'}
                    </h2>
                }
                useCustomSelectionController
                hideStickyFooter
                termTransformFxn={Schemas.Term.toName}
                separateSingleTermFacets={false}
                openRowHeight={100}
            />
        </div>
    );
};
