import React, { useState, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import queryString from 'query-string';
import _ from 'underscore';
import { Modal } from 'react-bootstrap';
import ReactTooltip from 'react-tooltip';

import {
    ajax,
    memoizedUrlParse,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { itemUtil } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/object';
import { Alerts } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts';

import {
    SelectAllFilesButton,
    SelectedItemsDownloadButton,
} from '../SelectAllAboveTableComponent';

/**
 * Mimicks the behavior of SelectedItemsController to take all of the items found in a search query
 * and generate a download manifest with them
 * @param {*} props
 * @returns
 */
export const DownloadAllFilesFromSearchHrefButton = ({
    searchHref = '/search/?type=File',
    session,
    analyticsAddItemsToCart,
    children,
    cls = '',
}) => {
    const [selectedItems, setSelectedItems] = useState(new Map());

    const loadFiles = (href) => {
        return ajax.load(
            href,
            (resp) => {
                const graph = resp['@graph'] || [];
                const newMap = new Map();
                graph.forEach((item) => {
                    const atID = itemUtil.atId(item);
                    newMap.set(atID, item);
                });
                setSelectedItems(newMap);
            },
            'GET',
            (err) => {
                Alerts.queue({
                    title: 'Fetching files failed',
                    message:
                        'Check your internet connection or if you have been logged out due to expired session.',
                    style: 'danger',
                });
            }
        );
    };

    useEffect(() => {
        // on first load, pull the list of items from search query, use it to populate our dummy selectedItems
        const currentHrefParts = memoizedUrlParse(searchHref);
        const currentHrefQuery = _.extend({}, currentHrefParts.query);
        currentHrefQuery.field = SelectAllFilesButton.fieldsToRequest;
        currentHrefQuery.limit = 'all';
        const reqHref =
            currentHrefParts.pathname +
            '?' +
            queryString.stringify(currentHrefQuery);
        loadFiles(reqHref);
    }, []);

    // Should only be the case on first load... unless something goes wrong
    if (selectedItems.size === 0) {
        return null; // Maybe replace with disabled button with load spinner
    }

    return session ? (
        <SelectedItemsDownloadButton
            id="download_tsv_from_search"
            disabled={selectedItems.size === 0}
            className={'btn btn-primary btn-sm me-05 align-items-center ' + cls}
            {...{ selectedItems, session }}
            analyticsAddItemsToCart>
            <i className="icon icon-download fas me-03" />
            {children ? children : `Download ${selectedItems.size} Files`}
        </SelectedItemsDownloadButton>
    ) : null;
};
