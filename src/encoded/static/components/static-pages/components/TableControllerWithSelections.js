import React, { useState, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';

import { SelectedItemsController } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/EmbeddedSearchView';

import { EmbeddedItemSearchTable } from '../../item-pages/components/EmbeddedItemSearchTable';

export const TableControllerWithSelections = (props) => {
    // Mostly serves as an intermediary/wrapper HOC to make selectedItemsController methods
    // and props available in child table's aboveTableComponent
    const { searchHref, schemas, facets, session, href, context } = props;

    // Some fields will/can be overriden in child component
    const originalColExtMap =
        EmbeddedItemSearchTable.defaultProps.columnExtensionMap;

    if (!searchHref) {
        return (
            <div className="tbd-notice mt-2">
                Data: <span className="font-italic">Coming Soon</span>
            </div>
        );
    }

    // Inject necessary props
    const renderChildren = () => {
        return React.Children.map(props.children, (child) => {
            return React.cloneElement(child, {
                columnExtensionMap: originalColExtMap,
                session,
                searchHref,
                schemas,
                href,
                context,
                facets,
            });
        });
    };

    return (
        <SelectedItemsController
            {...{ context, href }}
            currentAction={'multiselect'}>
            {renderChildren()}
        </SelectedItemsController>
    );
};