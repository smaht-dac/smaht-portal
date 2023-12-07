import React, { useContext, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import queryString from 'query-string';
import _ from 'underscore';

import {
    ajax,
    // analytics,
    memoizedUrlParse,
    logger,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { SelectedItemsController } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/SelectedItemsController';
import { EmbeddedItemSearchTable } from '../../../item-pages/components/EmbeddedItemSearchTable';

export const BenchmarkingTableController = (props) => {
    // Mostly serves as an intermediary/wrapper HOC to make selectedItemsController methods
    // and props available in BenchmarkingTable's aboveTableComponent
    const { searchHref, schemas, facets, session, href, context } = props;

    // TODO: maybe create benchmarking-specific columnExtensionMap/columns in future...
    const columnExtensionMap =
        EmbeddedItemSearchTable.defaultProps.columnExtensionMap;

    return (
        <SelectedItemsController
            {...{ context, href, columnExtensionMap }}
            currentAction={'multiselect'}>
            <BenchmarkingTable
                {...{
                    session,
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
                    {...{
                        selectedItems,
                        onSelectItem,
                        onResetSelectedItems,
                        href,
                        searchHref,
                    }}
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
            href,
            searchHref,
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

        const selectedFileProps = {
            selectedItems, // From SelectedItemsController
            onSelectItem, // From SelectedItemsController
            onResetSelectedItems, // From SelectedItemsController
            href,
            searchHref,
        };
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
                    <SelectAllFilesButton
                        {...selectedFileProps}
                        {...{ searchHref, href, context }}
                        totalFilesCount={totalResultCount}
                    />
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

const SELECT_ALL_LIMIT = 8000;

class SelectAllFilesButton extends React.PureComponent {
    /** These are fields included when "Select All" button is clicked to AJAX all files in */
    static fieldsToRequest = [
        'accession',
        'display_title',
        '@id',
        '@type',
        'status',
        'data_type',
        'file_format.*',
        'submission_centers.display_title',
        'consortia.display_title',
    ];

    constructor(props) {
        super(props);
        this.isAllSelected = this.isAllSelected.bind(this);
        this.handleSelectAll = this.handleSelectAll.bind(this);
        this.state = { selecting: false };
    }

    isEnabled() {
        const { totalFilesCount } = this.props;
        if (!totalFilesCount) return true;
        if (totalFilesCount > SELECT_ALL_LIMIT) return false;
        return true;
    }

    isAllSelected() {
        const { totalFilesCount, selectedItems } = this.props;
        if (!totalFilesCount) return false;
        // totalFilesCount as returned from bar plot aggs at moment is unique.
        if (totalFilesCount === selectedItems.size) {
            return true;
        }
        return false;
    }

    handleSelectAll(evt) {
        const {
            href,
            searchHref,
            onSelectItem,
            selected,
            onResetSelectedItems,
            context,
            totalFilesCount,
        } = this.props;
        if (
            typeof onSelectItem !== 'function' ||
            typeof onResetSelectedItems !== 'function'
        ) {
            logger.error(
                "No 'onSelectItems' or 'onResetSelectedItems' function prop passed from SelectedItemsController."
            );
            throw new Error(
                "No 'onSelectItems' or 'onResetSelectedItems' function prop passed from SelectedItemsController."
            );
        }

        this.setState({ selecting: true }, () => {
            if (!this.isAllSelected()) {
                console.log('searchHref', searchHref);
                console.log('href', href);

                const currentHrefParts = memoizedUrlParse(searchHref);
                const currentHrefQuery = _.extend({}, currentHrefParts.query);
                currentHrefQuery.field = SelectAllFilesButton.fieldsToRequest;
                currentHrefQuery.limit = 'all';
                const reqHref =
                    currentHrefParts.pathname +
                    '?' +
                    queryString.stringify(currentHrefQuery);

                ajax.load(reqHref, (resp) => {
                    const filesToSelect = resp['@graph'] || [];
                    onSelectItem(filesToSelect, true);
                    this.setState({ selecting: false });

                    // //analytics: TODO: maybe adjust and re-add in future
                    // const extData = {
                    //     item_list_name: analytics.hrefToListName(
                    //         window && window.location.href
                    //     ),
                    // };
                    // const products = analytics.transformItemsToProducts(
                    //     allExtendedFiles,
                    //     extData
                    // );
                    // const productsLength = Array.isArray(products)
                    //     ? products.length
                    //     : allExtendedFiles.length;
                    // analytics.event(
                    //     'add_to_cart',
                    //     'SelectAllFilesButton',
                    //     'Select All',
                    //     function () {
                    //         console.info(
                    //             `Adding ${productsLength} items from cart.`
                    //         );
                    //     },
                    //     {
                    //         items: Array.isArray(products) ? products : null,
                    //         list_name: extData.item_list_name,
                    //         value: productsLength,
                    //         filters: analytics.getStringifiedCurrentFilters(
                    //             (context && context.filters) || null
                    //         ),
                    //     }
                    // );
                });
            } else {
                onResetSelectedItems();
                this.setState({ selecting: false });
            }
        });
    }

    render() {
        const { selecting } = this.state;
        const isAllSelected = this.isAllSelected();
        const isEnabled = this.isEnabled();
        const iconClassName =
            'mr-05 icon icon-fw icon-' +
            (selecting
                ? 'circle-notch icon-spin fas'
                : isAllSelected
                ? 'square far'
                : 'check-square far');
        const cls =
            'btn btn-sm mr-05 align-items-center ' +
            (isAllSelected ? 'btn-outline-secondary' : 'btn-secondary');
        const tooltip =
            !isAllSelected && !isEnabled
                ? `"Select All" is disabled since the total file count exceeds the upper limit: ${SELECT_ALL_LIMIT}`
                : null;

        return (
            <button
                type="button"
                id="select-all-files-button"
                disabled={selecting || (!isAllSelected && !isEnabled)}
                className={cls}
                onClick={this.handleSelectAll}
                data-tip={tooltip}>
                <i className={iconClassName} />
                <span className="d-none d-md-inline text-400">
                    {isAllSelected ? 'Deselect' : 'Select'}{' '}
                </span>
                <span className="text-600">All</span>
            </button>
        );
    }
}
