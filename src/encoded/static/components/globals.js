'use strict';

import memoize from 'memoize-one';
import url from 'url';
import Registry from '@hms-dbmi-bgm/shared-portal-components/es/components/navigation/components/Registry';
import {
    console,
    isServerSide,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { default as analyticsConfigurationOptions } from './../ga_config.json';

/**
 * Top bar navigation & link schema definition.
 */
const portalConfig = {
    /** Title of app, used as appendix in browser <head> <title> and similar. */
    title: 'SMaHT Data Portal',

    /**
     * Hostnames which are considered to be canonical for SMaHT data.
     * If "current" hostname is not in this list, is presumed to be a development environment,
     * and minor visual changes, such as the test data warning banner, appear.
     *
     * @type {string[]}
     */
    productionHosts: [
        'www.data.smaht.org',
        'data.smaht.org',
        // "fourfront-webdev.us-east-1.elasticbeanstalk.com" // TODO: replace with smaht EB link
    ],
};

/**
 * Registry of views for Item pages, keyed by Item type.
 * To register a new view for a given `@type`, may do the following:
 *
 * @type {Registry}
 * @example content_views.register(SomeReactViewComponent, 'ItemType');
 */
const content_views = new Registry();

/**
 * Registry of views for panels. Works similarly to `content_views`.
 * Currently not being used but may be at a future time/date.
 *
 * @type {Registry}
 */
const panel_views = new Registry();

/**
 * gets tracking ID and type (GTM)
 * @param {string} href     href to get matching Google Analytics 4 property
 * @return {string}         returns trackingID
 */
const getGoogleAnalyticsTrackingID = memoize(function (href){
    if (!href && !isServerSide()) {
        href = window.location.href;
    }
    const { host } = url.parse(href);
    const hostnames = Object.keys(analyticsConfigurationOptions.hostnameTrackerIDMapping);
    //expected value for trackerIDs is [GTM ID, GA4 ID]
    let trackerIDs = analyticsConfigurationOptions.hostnameTrackerIDMapping.default || [];
    for (var i = 0; i < hostnames.length; i++) {
        if (host.indexOf(hostnames[i]) > -1) {
            trackerIDs = analyticsConfigurationOptions.hostnameTrackerIDMapping[hostnames[i]] || [];
        }
    }
    const [trackerID] = trackerIDs;
    return trackerID || null;
});

export {
    analyticsConfigurationOptions,
    portalConfig,
    getGoogleAnalyticsTrackingID,
    content_views,
    panel_views,
};
