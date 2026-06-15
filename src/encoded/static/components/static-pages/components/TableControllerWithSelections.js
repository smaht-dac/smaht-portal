import React, { useState, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';

import { SelectedItemsController } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/EmbeddedSearchView';

export const getSelectionQueryKey = (href = '', fallback = 'selection-controller') => {
    // Tie selection lifecycle to query identity, but ignore sort/pagination
    // params so selections persist across table-only navigation changes.
    if (!href || typeof href !== 'string') {
        return fallback;
    }
    try {
        const parsedURL = new URL(href, 'http://localhost');
        parsedURL.searchParams.delete('sort');
        parsedURL.searchParams.delete('from');
        parsedURL.searchParams.delete('limit');
        const normalizedSearch = parsedURL.searchParams.toString();
        return `${parsedURL.pathname}${normalizedSearch ? `?${normalizedSearch}` : ''}${parsedURL.hash || ''}`;
    } catch (e) {
        const [path = fallback, rawQuery = ''] = href.split('?');
        const queryParams = new URLSearchParams(rawQuery);
        queryParams.delete('sort');
        queryParams.delete('from');
        queryParams.delete('limit');
        const normalizedSearch = queryParams.toString();
        return `${path}${normalizedSearch ? `?${normalizedSearch}` : ''}`;
    }
};

export const TableControllerWithSelections = (props) => {
    // Mostly serves as an intermediary/wrapper HOC to make selectedItemsController methods
    // and props available in child table's aboveTableComponent
    const { searchHref, schemas, facets, session, href, context, tabMap } =
        props;
    const selectionQueryKey = useMemo(
        () => getSelectionQueryKey(href || searchHref, 'selection-controller'),
        [href, searchHref]
    );

    if (!searchHref) {
        return (
            <div className="tbd-notice mt-2">
                Data: <span className="fst-italic">Coming Soon</span>
            </div>
        );
    }

    // Inject necessary props
    const renderChildren = () => {
        return React.Children.map(props.children, (child) => {
            return React.cloneElement(child, {
                session,
                searchHref,
                schemas,
                href,
                context,
                facets,
                tabMap,
            });
        });
    };

    return (
        <SelectedItemsController
            // Remount the selection controller only when the effective query changes.
            key={selectionQueryKey}
            {...{ context, href }}
        >
            {renderChildren()}
        </SelectedItemsController>
    );
};

export const BrowseViewControllerWithSelections = (props) => {
    // Mostly serves as an intermediary/wrapper HOC to make selectedItemsController methods
    // and props available in child table's aboveTableComponent
    const { schemas, facets, session, href, context } = props;
    const selectionQueryKey = useMemo(
        () => getSelectionQueryKey(href, 'browse-selection-controller'),
        [href]
    );

    // Inject necessary props
    const renderChildren = () => {
        return React.Children.map(props.children, (child) => {
            return React.cloneElement(child, {
                session,
                schemas,
                href,
                context,
                facets,
            });
        });
    };

    return (
        <SelectedItemsController
            // Keep browse selections scoped to the current filter set, not sort state.
            key={selectionQueryKey}
            {...{ context, href }}
        >
            {renderChildren()}
        </SelectedItemsController>
    );
};
