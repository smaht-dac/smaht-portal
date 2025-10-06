'use strict';

import url from 'url';
import queryString from 'query-string';
import _ from 'underscore';

import { navigate as originalNavigate } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/navigate';

let store = null;

const navigate = function (...args) {
    return originalNavigate(...args);
};

// Carry over any util fxns. Then add more. Per portal.
_.extend(navigate, originalNavigate);

navigate.setNavigateFunction = function (...args) {
    // eslint-disable-next-line prefer-destructuring
    store = require('../../store').store;
    originalNavigate.setNavigateFunction(...args);
};

/******* PUBLIC STATIC FUNCTIONS *******/

// TODO

/**
 * Get the browse parameters for our given `browseBaseState`.
 * If `browseBaseState` param is not provided, it is retrieved from the Redux store.
 *
 * @param {string} [browseBaseState=null] The browse base state. By default is set to "only_4dn" on app init.
 * @returns {Object} JSON form of URI query params for given or current browseBaseState.
 */
navigate.getBrowseBaseParams = function(browseBaseState = null, mapping = 'all'){
    if (browseBaseState === 'item_search') {
        return {};
    }
    if (!browseBaseState){
        if (store === null){
            // eslint-disable-next-line prefer-destructuring
            store = require('../../store').store;
        }
        var storeState = store.getState();
        browseBaseState = storeState.browseBaseState;
    }
    return _.clone(navigate.getBrowseBaseParams.mappings[mapping].parameters);
};

// TODO: keep aligned "status" field with BROWSE_STATUS_FILTERS in BrowseView.js and also other fields should match with BROWSE_LINKS
navigate.getBrowseBaseParams.mappings = {
    'all' : {
        'parameters': {
            'type': ['File'],
            'sample_summary.studies': ['Production'],
            'status': ['open', 'open-early', 'open-network', 'protected', 'protected-early', 'protected-network'],
            //'donors.tags': ['has_released_files'],
        }
    },
    'donor' : {
        'parameters': {
            'type': ['Donor'],
            'study': ['Production'],
            // 'status': ['public', 'public-restricted', 'restricted', 'released'],
            'tags': ['has_released_files']
        }
    },
    'protected-donor' : {
        'parameters': {
            'type': ['ProtectedDonor'],
            'study': ['Production'],
            // 'status': ['public', 'public-restricted', 'restricted', 'released'],
            'tags': ['has_released_files']
        }
    }
};

navigate.getBrowseBaseHref = function(browseBaseParams = null, mapping = 'all'){
    if (!browseBaseParams) browseBaseParams = navigate.getBrowseBaseParams(null, mapping);
    else if (typeof browseBaseParams === 'string') browseBaseParams = navigate.getBrowseBaseParams(browseBaseParams, mapping);
    return '/browse/?' + queryString.stringify(browseBaseParams);
};

/** Utility function to check if we are on a browse page. */
navigate.isBrowseHref = function(href){
    if (typeof href === 'string') href = url.parse(href);
    if (href.pathname.slice(0,8) === '/browse/') return true;
    return false;
};

export { navigate };
