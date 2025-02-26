'use strict';

import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import memoize from 'memoize-one';
import _ from 'underscore';
import { SearchView as CommonSearchView } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/SearchView';
import { SelectedItemsController } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/SelectedItemsController';
import { console } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { navigate, Schemas } from './../util';
import { columnExtensionMap as originalColExtMap } from './columnExtensionMap';
import { transformedFacets } from './SearchView';
import { BrowseViewAboveSearchTableControls } from './browse-view/BrowseViewAboveSearchTableControls';
import { SelectAllFilesButton, SelectedItemsDownloadButton } from '../static-pages/components/SelectAllAboveTableComponent';
import { createBrowseColumnExtensionMap } from './BrowseView';



export default function FileSearchView (props){
    const { schemas, session, facets, href, context } = props;
    if (!context.facets) return null;
    return (
        <div className="search-page-container container-wide" id="content">
            <SelectedItemsController {...{ context, href }} currentAction={'multiselect'}>
                <FileTableWithSelectedFilesCheckboxes {...{ schemas, facets, session, href, context }} />
            </SelectedItemsController>
        </div>
    );
}


function FileTableWithSelectedFilesCheckboxes(props){
    const {
        context, href, schemas, navigate: propNavigate = navigate,
        windowHeight, windowWidth, registerWindowOnScrollHandler,
        toggleFullScreen, isFullscreen, session,
        selectedItems, onSelectItem, selectItem, onResetSelectedItems,
        columnExtensionMap: propColumnExtensionMap = originalColExtMap,
        currentAction
    } = props;
 
    const facets = useMemo(function(){
        return transformedFacets(context, currentAction, schemas);
    }, [ context, currentAction, session, schemas ]);

    const selectedFileProps = {
        selectedItems, // From SelectedItemsController
        onSelectItem, // From SelectedItemsController
        onResetSelectedItems, // From SelectedItemsController
    };

    const { columnExtensionMap, columns, hideFacets } = useMemo(function () {
        let { columnExtensionMap, columns } = createBrowseColumnExtensionMap(selectedFileProps);
        columnExtensionMap = _.extend({}, propColumnExtensionMap, columnExtensionMap);
        return { columnExtensionMap, columns };
    }, [propColumnExtensionMap, selectedFileProps]);

    const tableColumnClassName = 'results-column col';
    const facetColumnClassName = 'facets-column col-auto';

    const aboveTableComponent = (
            <BrowseViewAboveSearchTableControls
                topLeftChildren={
                    <SelectAllFilesButton {...selectedFileProps} {...{ context }} />
                }>
                <SelectedItemsDownloadButton
                    id="download_tsv_multiselect"
                    disabled={selectedItems.size === 0}
                    className="btn btn-primary btn-sm me-05 align-items-center"
                    {...{ selectedItems, session }}
                    analyticsAddItemsToCart>
                    <i className="icon icon-download fas me-03" />
                    Download {selectedItems.size} Selected Files
                </SelectedItemsDownloadButton>
            </BrowseViewAboveSearchTableControls>
        );
    const aboveFacetListComponent = <AboveFacetList {...{ context, currentAction }} />;

    const passProps = {
        href, context, facets,
        session, schemas,
        windowHeight, windowWidth, registerWindowOnScrollHandler,
        aboveTableComponent, aboveFacetListComponent,
        tableColumnClassName, facetColumnClassName,
        columnExtensionMap,
        navigate: propNavigate,
        toggleFullScreen, isFullscreen, // todo: remove maybe, pass only to AboveTableControls
        keepSelectionInStorage: true,
        separateSingleTermFacets: false,
        columns, hideFacets
    };

    return <CommonSearchView {...passProps} termTransformFxn={Schemas.Term.toName} />;
}
FileTableWithSelectedFilesCheckboxes.propTypes = {
    // Props' type validation based on contents of this.props during render.
    'href'                      : PropTypes.string.isRequired,
    'columnExtensionMap'        : PropTypes.object.isRequired,
    'context'                   : PropTypes.shape({
        'columns'                   : PropTypes.objectOf(PropTypes.object).isRequired,
        'total'                     : PropTypes.number.isRequired
    }).isRequired,
    'facets'                    : PropTypes.arrayOf(PropTypes.shape({
        'title'                     : PropTypes.string.isRequired
    })),
    'schemas'                   : PropTypes.object,
    'browseBaseState'           : PropTypes.string.isRequired,
    'selectItem'                : PropTypes.func,
    'selectedItems'             : PropTypes.objectOf(PropTypes.object),
};

function AboveFacetList({ context, currentAction }){
    const { total = 0, actions = [] } = context;
    let totalResults = null;
    if (total > 0) {
        totalResults = (
            <div>
                <span id="results-count" className="text-500">
                    { total }
                </span> Results
            </div>
        );
    }

    let addButton = null;
    if (!currentAction) {
        const addAction = _.findWhere(actions, { 'name': 'add' });
        if (addAction && typeof addAction.href === 'string') {
            addButton = (
                <a className="btn btn-primary btn-xs ms-1" href={addAction.href} data-skiprequest="true">
                    <i className="icon icon-fw icon-plus fas me-03 fas" />Create New&nbsp;
                </a>
            );
        }
    }

    return (
        <div className="above-results-table-row text-truncate d-flex align-items-center justify-content-end">
            { totalResults }
            { addButton }
        </div>
    );
}
