import React, { useContext, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import { SelectedItemsController } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/SelectedItemsController';
import { basicColumnExtensionMap } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/table-commons';
import { EmbeddedItemSearchTable } from '../../../item-pages/components/EmbeddedItemSearchTable';

export const BenchmarkingTableController = (props) => {
    // Mostly serves as an intermediar/wrapper HOC to make selectedItemsController methods
    // and props available in BenchmarkingTable's aboveTableComponent
    const { searchHref, schemas, facets, session, href, context } = props;
    const columnExtensionMap =
        EmbeddedItemSearchTable.defaultProps.columnExtensionMap;

    return (
        <SelectedItemsController
            {...{ context, href, columnExtensionMap }}
            currentAction={'multiselect'}>
            <BenchmarkingTable
                {...{
                    searchHref,
                    schemas,
                    href,
                    context,
                    facets,
                    columnExtensionMap,
                }}
            />
        </SelectedItemsController>
    );
};

const BenchmarkingTable = (props) => {
    const {
        searchHref,
        schemas,
        facets,
        session,
        children,
        href,
        context,
        columnExtensionMap,
        selectedItems, // From SelectedItemsController
        onSelectItem, // From SelectedItemsController
        onResetSelectedItems, // From SelectedItemsController
    } = props;
    return (
        <EmbeddedItemSearchTable
            aboveTableComponent={
                <BenchmarkingAboveTableComponent
                    {...{ selectedItems, onSelectItem, onResetSelectedItems }}
                />
            }
            rowHeight={40}
            // maxHeight={200}
            {...{
                searchHref,
                schemas,
                session,
                facets,
                columnExtensionMap,
            }}
        />
    );
};

const BenchmarkingAboveTableComponent = React.memo(
    function BenchmarkingAboveTableComponent(props) {
        const {
            context,
            onFilter,
            schemas,
            isContextLoading = false, // Present only on embedded search views,
            navigate,
            sortBy,
            sortColumns,
            hiddenColumns,
            addHiddenColumn,
            removeHiddenColumn,
            columnDefinitions,
            selectedItems, // From SelectedItemsController
            onSelectItem, // From SelectedItemsController
            onResetSelectedItems, // From SelectedItemsController
        } = props;
        const { filters: ctxFilters = null, total: totalResultCount = 0 } =
            context || {};

        console.log('abovetablecomponent props', props);

        return (
            <div className="d-flex w-100 mb-05">
                <div className="col-auto ml-0 pl-0">
                    <span className="text-400" id="results-count">
                        {totalResultCount}
                    </span>{' '}
                    Results
                </div>
                <div className="ml-auto col-auto mr-0 pr-0">
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm mr-05 align-items-center">
                        <i className="icon icon-check-square far mr-03" />
                        Select All
                    </button>
                    <button
                        type="button"
                        disabled={selectedItems.size === 0}
                        className="btn btn-primary btn-sm mr-05 align-items-center">
                        <i className="icon icon-download fas mr-03" />
                        Download {selectedItems.size} Selected Files
                    </button>
                </div>
            </div>
        );
    }
);
