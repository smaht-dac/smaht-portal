'use strict';

import React, { useMemo, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import memoize from 'memoize-one';
import queryString from 'query-string';
import * as d3 from 'd3';
import { sub, add, startOfMonth, startOfDay, endOfMonth, endOfDay, toDate, format as formatDate } from 'date-fns';
import DropdownItem from 'react-bootstrap/esm/DropdownItem';
import DropdownButton from 'react-bootstrap/esm/DropdownButton';
import Modal from 'react-bootstrap/esm/Modal';

import { Checkbox } from '@hms-dbmi-bgm/shared-portal-components/es/components/forms/components/Checkbox';
import { console, ajax, analytics, logger } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { navigate } from './../../util';
import { Term } from './../../util/Schemas';
import { ColumnCombiner, CustomColumnController, SortController } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/EmbeddedSearchView';
import { ControlsAndResults } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/ControlsAndResults';
import { ItemDetailList } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/ItemDetailList';

import {
    StatsViewController, GroupByDropdown, ColorScaleProvider,
    AreaChart, AreaChartContainer, LoadingIcon, ErrorIcon, HorizontalD3ScaleLegend,
    StatsChartViewAggregator, GroupByController
} from './../../viz/AreaChart';

/**
 * @module
 * We export out most things needed for /statistics/ page view out of here to
 * make code-splitting of this easier. Isn't a primary page of portal so we defer
 * its loading until if needed. Also deprioritized in terms of cleanup (of which much
 * could be done).
 */

export { StatsChartViewAggregator, GroupByController };


export const commonParsingFxn = {
    /**
     * MODIFIES OBJECTS IN PLACE
     */
    'countsToTotals' : function(parsedBuckets, cumulativeSum = false, excludeChildren = false){
        let total = 0;
        const subTotals = {};

        parsedBuckets.forEach(function(bkt, index){
            if (cumulativeSum) { 
                total += bkt.count; 
            } else { 
                total = bkt.count; 
            }
            bkt.total = total;
            if (excludeChildren || !Array.isArray(bkt.children)) return;

            bkt.children.forEach(function(c){
                if (cumulativeSum) {
                    c.total = subTotals[c.term] = (subTotals[c.term] || 0) + (c.count || 0);
                } else {
                    c.total = subTotals[c.term] = (c.count || 0);
                }
            });
        });

        return parsedBuckets;
    },
    /**
     * Doesn't add up totals, just renames 'count' property to 'total' property.
     * MODIFIES IN PLACE.
     */
    'countsToCountTotals' : function(parsedBuckets, excludeChildren = false){
        parsedBuckets.forEach(function(bkt){
            bkt.total = bkt.count;
            bkt.children.forEach(function(c){
                c.total = c.count;
            });
        });
        return parsedBuckets;
    },
    /**
     * MODIFIES OBJECTS IN PLACE
     */
    'fillMissingChildBuckets' : function(aggsList, subAggTerms = [], externalTermMap = {}){
        aggsList.forEach(function(datum){
            subAggTerms.forEach(function(term){
                if (externalTermMap && externalTermMap[term]) return;
                if (!_.findWhere(datum.children, { term })){
                    datum.children.push({ term, 'count' : 0, 'total' : 0, 'date' : datum.date });
                }
            });
        });

        const today = new Date();
        const lastDate = aggsList.length > 0 && new Date(aggsList[aggsList.length - 1].date);
        const todayAsString = today.toISOString().slice(0,10);

        if (lastDate && lastDate < today){
            aggsList.push({
                ...aggsList[aggsList.length - 1],
                'date' : todayAsString,
                'count' : 0,
                'children' : aggsList[aggsList.length - 1].children.map(function(c){
                    return _.extend({}, c, { 'date' : todayAsString, 'count' : 0 });
                })
            });
        }
    },
    /**
     * Converts date_histogram, histogram, or range aggregations from ElasticSearch result into similar but simpler bucket structure.
     * Sets 'count' to be 'doc_count' value from histogram.
     *
     * @param {{ key_as_string: string, doc_count: number, group_by?: { buckets: { doc_count: number, key: string  }[] } }[]} intervalBuckets - Raw aggregation results returned from ElasticSearch
     * @param {Object.<string>} [externalTermMap] - Object which maps external terms to true (external data) or false (internal data).
     * @param {boolean} [excludeChildren=false] - If true, skips aggregating up children to increase performance very slightly.
     */
    'bucketDocCounts' : function(intervalBuckets, groupByField, externalTermMap, excludeChildren = false){
        const subBucketKeysToDate = new Set();
        const aggsList = intervalBuckets.map(function(bucket, index){
            const {
                doc_count,
                key_as_string,
                [groupByField] : { buckets: subBuckets = [] } = {}
            } = bucket;

            if (excludeChildren === true){
                return {
                    'date' : key_as_string.split('T')[0], // Sometimes we get a time back with date when 0 doc_count; correct it to date only.
                    'count' : doc_count
                };
            } else {
                _.pluck(subBuckets, 'key').forEach(function(k){
                    subBucketKeysToDate.add(k);
                });

                const children = [ ...subBucketKeysToDate ].map(function(term){
                    // Create a parsed 'bucket' even if none returned from ElasticSearch agg but it has appeared earlier.
                    const subBucket = _.findWhere(subBuckets, { 'key' : term });
                    const count = ((subBucket && subBucket.doc_count) || 0);

                    return { term, count };
                });

                return {
                    'date' : key_as_string.split('T')[0], // Sometimes we get a time back with date when 0 doc_count; correct it to date only.
                    'count' : doc_count,
                    'children' : children
                };
            }
        });

        if (subBucketKeysToDate.size === 0){ // No group by defined, fill with dummy child for each.
            _.forEach(aggsList, function(dateBucket){
                dateBucket.children = [{ term : null, count : dateBucket.count }];
            });
            subBucketKeysToDate.add(null);
        }

        // Ensure each datum has all child terms, even if blank.
        commonParsingFxn.fillMissingChildBuckets(aggsList, _.difference([ ...subBucketKeysToDate ], (externalTermMap && _.keys(externalTermMap)) || [] ));

        return aggsList;
    },
    /**
     * Converts date_histogram, histogram, or range aggregations from ElasticSearch result into similar but simpler bucket structure.
     * Sets 'count' to be 'bucket.total_files.value' value from histogram.
     *
     * @param {{ key_as_string: string, doc_count: number, group_by?: { buckets: { doc_count: number, key: string  }[] } }[]} intervalBuckets - Raw aggregation results returned from ElasticSearch
     * @param {Object.<string>} [externalTermMap] - Object which maps external terms to true (external data) or false (internal data).
     */
    'bucketTotalFilesCounts' : function(intervalBuckets, groupByField, externalTermMap){
        const subBucketKeysToDate = new Set();
        const aggsList = intervalBuckets.map(function(bucket, index){
            const {
                key_as_string,
                total_files : { value: totalFiles = 0 } = {},
                [groupByField] : { buckets: subBuckets = [] } = {}
            } = bucket;

            _.pluck(subBuckets, 'key').forEach(function(k){
                subBucketKeysToDate.add(k);
            });

            const children = [ ...subBucketKeysToDate ].map(function(term){
                const subBucket = _.findWhere(subBuckets, { 'key' : term });
                const count = ((subBucket && subBucket.total_files && subBucket.total_files.value) || 0);

                return { term, count };
            });

            return {
                'date' : key_as_string.split('T')[0], // Sometimes we get a time back with date when 0 doc_count; correct it to date only.
                'count' : totalFiles,
                'children' : children
            };
        });

        // Ensure each datum has all child terms, even if blank.
        commonParsingFxn.fillMissingChildBuckets(aggsList, _.difference([ ...subBucketKeysToDate ], (externalTermMap && _.keys(externalTermMap)) || [] ));

        return aggsList;
    },
    'bucketTotalFilesVolume' : function(intervalBuckets, groupByField, externalTermMap){
        const gigabyte = 1024 * 1024 * 1024;
        const megabyte = 1024 * 1024;
        const subBucketKeysToDate = new Set();
        const aggsList = intervalBuckets.map(function(bucket, index){
            const {
                key_as_string,
                total_files_volume : { value: totalFilesVolume = 0 } = {},
                [groupByField] : { buckets: subBuckets = [] } = {}
            } = bucket;

            _.pluck(subBuckets, 'key').forEach(function(k){
                subBucketKeysToDate.add(k);
            });

            const fileSizeVol = totalFilesVolume / /*megabyte*/gigabyte;
            const children = [ ...subBucketKeysToDate ].map(function(term){
                const subBucket = _.findWhere(subBuckets, { 'key' : term });
                const subFileSizeVol = ((subBucket && subBucket.total_files_volume && subBucket.total_files_volume.value) || 0) / /*megabyte*/gigabyte;

                return { term, 'count' : subFileSizeVol };
            });

            return {
                'date'     : key_as_string.split('T')[0], // Sometimes we get a time back with date when 0 doc_count; correct it to date only.
                'count'    : fileSizeVol,
                'children' : children
            };
        });

        // Ensure each datum has all child terms, even if blank.
        commonParsingFxn.fillMissingChildBuckets(aggsList, _.difference(Array.from(subBucketKeysToDate), (externalTermMap && _.keys(externalTermMap)) || [] ));

        return aggsList;
    },
    'analytics_to_buckets' : function(resp, reportName, termBucketField, countKey, cumulativeSum, termDisplayAsFunc = null, topCount = 0){
        const termsInAllItems = new Set();

        // De-dupe -- not particularly necessary as D3 handles this, however nice to have well-formatted data.
        const trackingItems = _.uniq(resp['@graph'], true, function(trackingItem){
            return trackingItem.google_analytics.for_date;
        }).reverse(); // We get these in decrementing order from back-end

        let totalSessionsToDate = 0;
        const termTotals = {}; // e.g. { 'USA': { count: 5, total: 5 }, 'China': { count: 2, total: 2 } }

        // Notably, we do NOT sum up total here.
        const aggsList = trackingItems.map(function(trackingItem){
            const { google_analytics : {
                reports : {
                    [reportName] : currentReport = []
                } = {}, // `currentReport` => List of JSON objects (report entries, 1 per unique dimension value) - Note: 1 per unique dimension may not be valid for post processing report items in smaht-foursight 
                for_date
            } } = trackingItem;

            const termsInCurrenItem = new Set();
            
            // Unique-fy
            // group terms by term since terms are repeated while ga4 to tracking-item conversion done
            // (note that aggregated values won't work if the aggregated field is already an avg, min, max may field)
            const { groupedTermsObj, totalSessions } = _.reduce(currentReport, function ({ groupedTermsObj, totalSessions }, trackingItemItem) {
                const term = typeof termBucketField === 'function' ? termBucketField(trackingItemItem) : trackingItemItem[termBucketField];
                if (groupedTermsObj[term]) {
                    groupedTermsObj[term].count += trackingItemItem[countKey];
                    groupedTermsObj[term].total += trackingItemItem[countKey];
                } else {
                    groupedTermsObj[term] = {
                        'term': term,
                        'termDisplayAs': typeof termDisplayAsFunc === 'function' ? termDisplayAsFunc(trackingItemItem) : null,
                        'count': trackingItemItem[countKey],
                        'total': trackingItemItem[countKey],
                        'date': for_date
                    };
                    termsInAllItems.add(term);
                    termsInCurrenItem.add(term);
                }
                totalSessions += trackingItemItem[countKey]
                return { groupedTermsObj, totalSessions };
            }, { groupedTermsObj: {}, totalSessions: 0 });
            
            totalSessionsToDate += totalSessions;

            const currentItem = {
                'date'      : for_date,
                'count'     : cumulativeSum ? totalSessionsToDate : totalSessions,
                'total'     : cumulativeSum ? totalSessionsToDate : totalSessions,
                'children': _.values(groupedTermsObj).map(function (termItem) {
                    const cloned = { ...termItem };
                    if (cumulativeSum) {
                        let { count = 0, total = 0 } = termTotals[termItem.term] || {};
                        total += (termItem.total || 0);
                        count = (termItem.count || 0);
                        termTotals[termItem.term] = { total, count };

                        cloned.count = count;
                        cloned.total = total;
                    }
                    return cloned;
                })
            };

            // add missing children for cumulative view
            if (cumulativeSum) {
                termsInAllItems.forEach(term => {
                    if (!termsInCurrenItem.has(term)) {
                        currentItem.children.push({
                            'term': term,
                            'termDisplayAs': typeof termDisplayAsFunc === 'function' ? termDisplayAsFunc(term) : null,
                            'count': 0,
                            'total': termTotals[term].total,
                            'date': for_date
                        });
                    }
                });
            }

            if (typeof topCount === 'number' && topCount > 0) {
                currentItem.children = _.sortBy(currentItem.children, (item) => -1 * item.total).slice(0, topCount);
            }

            return currentItem;

        });

        commonParsingFxn.fillMissingChildBuckets(aggsList, Array.from(termsInAllItems));

        // remove children term if all is zero
        const filterZeroTotalTerms = (list) => {
            const termTotals = {};

            list.forEach(item => {
                item.children.forEach(child => {
                    if (!termTotals[child.term]) {
                        termTotals[child.term] = 0;
                    }
                    termTotals[child.term] += child.total;
                });
            });

            return list.map(item => ({
                ...item,
                children: item.children.filter(child => termTotals[child.term] !== 0),
            }));
        };

        return filterZeroTotalTerms(aggsList);
    }
};

const aggregationsToChartData = {
    'files_uploading' : {
        'requires'  : 'FileUploading',
        'function'  : function(resp, props){
            if (!resp || !resp.aggregations) return null;
            const agg = "weekly_interval_date_created"/*"weekly_interval_file_status_tracking.uploading"*/;
            var weeklyIntervalBuckets = resp && resp.aggregations && resp.aggregations[agg] && resp.aggregations[agg].buckets;
            if (!Array.isArray(weeklyIntervalBuckets)/* || weeklyIntervalBuckets.length < 2*/) return null;

            return commonParsingFxn.countsToTotals(
                commonParsingFxn.bucketTotalFilesCounts(weeklyIntervalBuckets, props.currentGroupBy, props.externalTermMap),
                props.cumulativeSum
            );
        }
    },
    'file_volume_uploading' : {
        'requires'  : 'FileUploading',
        'function'  : function(resp, props){
            if (!resp || !resp.aggregations) return null;
            const agg = "weekly_interval_date_created"/*"weekly_interval_file_status_tracking.uploading"*/;
            var weeklyIntervalBuckets = resp && resp.aggregations[agg] && resp.aggregations[agg].buckets;
            if (!Array.isArray(weeklyIntervalBuckets)/* || weeklyIntervalBuckets.length < 2*/) return null;

            return commonParsingFxn.countsToTotals(
                commonParsingFxn.bucketTotalFilesVolume(weeklyIntervalBuckets, props.currentGroupBy, props.externalTermMap),
                props.cumulativeSum
            );
        }
    },
    'files_uploaded' : {
        'requires'  : 'FileUploaded',
        'function'  : function(resp, props){
            if (!resp || !resp.aggregations) return null;
            const agg = "weekly_interval_file_status_tracking.uploaded";
            var weeklyIntervalBuckets = resp && resp.aggregations && resp.aggregations[agg] && resp.aggregations[agg].buckets;
            if (!Array.isArray(weeklyIntervalBuckets)/* || weeklyIntervalBuckets.length < 2*/) return null;

            return commonParsingFxn.countsToTotals(
                commonParsingFxn.bucketTotalFilesCounts(weeklyIntervalBuckets, props.currentGroupBy, props.externalTermMap),
                props.cumulativeSum
            );
        }
    },
    'file_volume_uploaded' : {
        'requires'  : 'FileUploaded',
        'function'  : function(resp, props){
            if (!resp || !resp.aggregations) return null;
            const agg = "weekly_interval_file_status_tracking.uploaded";
            var weeklyIntervalBuckets = resp && resp.aggregations[agg] && resp.aggregations[agg].buckets;
            if (!Array.isArray(weeklyIntervalBuckets)/* || weeklyIntervalBuckets.length < 2*/) return null;

            return commonParsingFxn.countsToTotals(
                commonParsingFxn.bucketTotalFilesVolume(weeklyIntervalBuckets, props.currentGroupBy, props.externalTermMap),
                props.cumulativeSum
            );
        }
    },
    'files_released' : {
        'requires'  : 'FileReleased',
        'function'  : function(resp, props){
            if (!resp || !resp.aggregations) return null;
            const agg = "weekly_interval_file_status_tracking.released";
            var weeklyIntervalBuckets = resp && resp.aggregations && resp.aggregations[agg] && resp.aggregations[agg].buckets;
            if (!Array.isArray(weeklyIntervalBuckets)/* || weeklyIntervalBuckets.length < 2*/) return null;

            return commonParsingFxn.countsToTotals(
                commonParsingFxn.bucketTotalFilesCounts(weeklyIntervalBuckets, props.currentGroupBy, props.externalTermMap),
                props.cumulativeSum
            );
        }
    },
    'file_volume_released' : {
        'requires'  : 'FileReleased',
        'function'  : function(resp, props){
            if (!resp || !resp.aggregations) return null;
            const agg = "weekly_interval_file_status_tracking.released";
            var weeklyIntervalBuckets = resp && resp.aggregations[agg] && resp.aggregations[agg].buckets;
            if (!Array.isArray(weeklyIntervalBuckets)/* || weeklyIntervalBuckets.length < 2*/) return null;

            return commonParsingFxn.countsToTotals(
                commonParsingFxn.bucketTotalFilesVolume(weeklyIntervalBuckets, props.currentGroupBy, props.externalTermMap),
                props.cumulativeSum
            );
        }
    },
    'fields_faceted' : {
        'requires' : 'TrackingItem',
        'function' : function(resp, props){
            if (!resp || !resp['@graph']) return null;

            var countKey    = 'total_events',
                groupingKey = "field"; // Field name, dot notation

            if (props.countBy.fields_faceted === 'sessions') countKey = 'unique_users';

            return commonParsingFxn.analytics_to_buckets(resp, 'fields_faceted', groupingKey, countKey, props.cumulativeSum);
        }
    },
    'sessions_by_country' : {
        'requires' : 'TrackingItem',
        'function' : function(resp, props){
            if (!resp || !resp['@graph']) return null;

            let useReport = null, termBucketField = null, countKey = null;

            switch (props.countBy.sessions_by_country) {
                case 'page_title':
                case 'page_url':
                    useReport = 'sessions_by_page';
                    termBucketField = props.countBy.sessions_by_country === 'page_title' ? 'page_title' : 'page_url';
                    countKey = 'page_views';
                    break;
                case 'device_category':
                    useReport = 'sessions_by_device_category';
                    termBucketField = 'device_category';
                    countKey = 'page_views';
                    break;
                default:
                    useReport = 'sessions_by_country';
                    termBucketField = props.countBy.sessions_by_country === 'views_by_country' || props.countBy.sessions_by_country === 'sessions_by_country' ?
                        'country' : 'city';
                    countKey = props.countBy.sessions_by_country === 'sessions_by_country' || props.countBy.sessions_by_country === 'sessions_by_city' ?
                        'unique_users' : 'page_views';
                    break;
            }

            return commonParsingFxn.analytics_to_buckets(resp, useReport, termBucketField, countKey, props.cumulativeSum);
        }
    },
    /**
     * For this function, props.currentGroupBy is the interval or time duration, not the actual 'group by' as it is for submissions.
     * Instead, `props.countBy.file_downloads` is used similar to the google analytics approach.
     */
    'file_downloads' : {
        'requires'  : "TrackingItem",
        'function'  : function(resp, props){
            if (!resp || !resp['@graph']) return null;
            const { countBy : { file_downloads : countBy } } = props;

            let useReport, groupingKey, countKey = 'downloads_count';
            switch (countBy) {
                case 'filetype':
                    useReport = 'file_downloads_by_filetype';
                    groupingKey = 'file_type_extended'; // File Type
                    break;
                case 'assay_type':
                    useReport = 'file_downloads_by_assay_type';
                    groupingKey = 'assay_type_extended'; // Assay Type
                    break;
                case 'dataset':
                    useReport = 'file_downloads_by_dataset';
                    groupingKey = 'dataset'; // Dataset
                    break;
                case 'sequencer':
                    useReport = 'file_downloads_by_sequencer';
                    groupingKey = 'sequencer'; // Sequencing Platform
                    break;
                default: //file type
                    useReport = 'file_downloads_by_filetype';
                    groupingKey = "file_type_extended"; // File Type
                    break;
            }

            console.log("AGGR", resp, props, countBy, groupingKey, useReport);

            return commonParsingFxn.analytics_to_buckets(resp, useReport, groupingKey, countKey, props.cumulativeSum);
        }
    },
    'file_downloads_volume' : {
        'requires'  : "TrackingItem",
        'function'  : function(resp, props){
            if (!resp || !resp['@graph']) return null;
            const { countBy : { file_downloads_volume : countBy } } = props;

            let useReport, groupingKey, countKey = 'downloads_size';
            switch (countBy) {
                case 'filetype':
                    useReport = 'file_downloads_by_filetype';
                    groupingKey = 'file_type_extended'; // File Type
                    break;
                case 'assay_type':
                    useReport = 'file_downloads_by_assay_type';
                    groupingKey = 'assay_type_extended'; // Assay Type
                    break;
                case 'dataset':
                    useReport = 'file_downloads_by_dataset';
                    groupingKey = 'dataset'; // Dataset
                    break;
                case 'sequencer':
                    useReport = 'file_downloads_by_sequencer';
                    groupingKey = 'sequencer'; // Sequencing Platform
                    break;
                default: //file type
                    useReport = 'file_downloads_by_filetype';
                    groupingKey = "file_type_extended"; // File Type
                    break;
            }

            //convert volume to GB
            const gigabyte = 1024 * 1024 * 1024;
            const result = commonParsingFxn.analytics_to_buckets(resp, useReport, groupingKey, countKey, props.cumulativeSum);
            if (result && Array.isArray(result) && result.length > 0) {
                _.forEach(result, (r) => {
                    r.total = r.total / gigabyte;
                    r.count = r.count / gigabyte;
                    if (r.children && Array.isArray(r.children) && r.children.length > 0) {
                        _.forEach(r.children, (c) => {
                            c.total = c.total / gigabyte;
                            c.count = c.count / gigabyte;
                        });
                    }
                });
            }
            return result;
        }
    },
    'top_file_set_downloads' : {
        'requires'  : "TrackingItem",
        'function'  : function(resp, props){
            if (!resp || !resp['@graph']) return null;
            const { countBy : { top_file_downloads : countBy } } = props;

            let useReport = 'top_files_downloaded';
            let groupingKey = 'file_set'; // File
            const countKey = 'downloads_count'; // Download Count
            let topCount = 0; // all

            switch (countBy) {
                case 'top_files_10':
                    topCount = 10;
                    break;
                case 'top_files_25':
                    topCount = 25;
                    break;
                case 'top_files_50':
                    topCount = 50;
                    break;
                case 'top_files_100':
                    topCount = 100;
                    break;
                default:
                    // Handle unknown cases if needed
                    break;
            }

            const termDisplayAsFunc = function(item){ return item.file_title ? item.file_title : (item.file_type ? `${item.term} (${item.file_type})` : item.term) };

            return commonParsingFxn.analytics_to_buckets(resp, useReport, groupingKey, countKey, props.cumulativeSum, termDisplayAsFunc, topCount);
        }
    },
    'top_file_set_downloads_volume' : {
        'requires'  : "TrackingItem",
        'function'  : function(resp, props){
            if (!resp || !resp['@graph']) return null;
            const { countBy : { top_file_downloads_volume : countBy } } = props;

            const useReport = 'top_files_downloaded';
            const groupingKey = 'file_set'; // File Set
            const countKey = 'downloads_size'; // Download Size
            let topCount = 0; // all

            switch (countBy) {
                case 'top_files_10':
                    topCount = 10;
                    break;
                case 'top_files_25':
                    topCount = 25;
                    break;
                case 'top_files_50':
                    topCount = 50;
                    break;
                case 'top_files_100':
                    topCount = 100;
                    break;
                default:
                    // Handle unknown cases if needed
                    break;
            }

            const termDisplayAsFunc = function(item){ return item.file_type && item.file_title ? `${item.file_title} (${item.file_type})` : item.term };
            
            //convert volume to GB
            const gigabyte = 1024 * 1024 * 1024;
            const result = commonParsingFxn.analytics_to_buckets(resp, useReport, groupingKey, countKey, props.cumulativeSum, termDisplayAsFunc, topCount);
            if (result && Array.isArray(result) && result.length > 0) {
                _.forEach(result, (r) => {
                    r.total = r.total / gigabyte;
                    r.count = r.count / gigabyte;
                    if (r.children && Array.isArray(r.children) && r.children.length > 0) {
                        _.forEach(r.children, (c) => {
                            c.total = c.total / gigabyte;
                            c.count = c.count / gigabyte;
                        });
                    }
                });
            }
            return result;
        }
    },
    'top_file_downloads' : {
        'requires'  : "TrackingItem",
        'function'  : function(resp, props){
            if (!resp || !resp['@graph']) return null;
            const { countBy : { top_file_downloads : countBy } } = props;

            let useReport = 'top_files_downloaded';
            let groupingKey = 'file_item_id'; // File
            const countKey = 'downloads_count'; // Download Count
            let topCount = 0; // all

            switch (countBy) {
                case 'top_files_10':
                    topCount = 10;
                    break;
                case 'top_files_25':
                    topCount = 25;
                    break;
                case 'top_files_50':
                    topCount = 50;
                    break;
                case 'top_files_100':
                    topCount = 100;
                    break;
                default:
                    // Handle unknown cases if needed
                    break;
            }

            const termDisplayAsFunc = function(item){ return item.file_title ? item.file_title : (item.file_type ? `${item.term} (${item.file_type})` : item.term) };

            return commonParsingFxn.analytics_to_buckets(resp, useReport, groupingKey, countKey, props.cumulativeSum, termDisplayAsFunc, topCount);
        }
    },
    'top_file_downloads_volume' : {
        'requires'  : "TrackingItem",
        'function'  : function(resp, props){
            if (!resp || !resp['@graph']) return null;
            const { countBy : { top_file_downloads_volume : countBy } } = props;

            const useReport = 'top_files_downloaded';
            const groupingKey = 'file_item_id'; // File
            const countKey = 'downloads_size'; // Download Size
            let topCount = 0; // all

            switch (countBy) {
                case 'top_files_10':
                    topCount = 10;
                    break;
                case 'top_files_25':
                    topCount = 25;
                    break;
                case 'top_files_50':
                    topCount = 50;
                    break;
                case 'top_files_100':
                    topCount = 100;
                    break;
                default:
                    // Handle unknown cases if needed
                    break;
            }

            const termDisplayAsFunc = function(item){ return item.file_type && item.file_title ? `${item.file_title} (${item.file_type})` : item.term };
            
            //convert volume to GB
            const gigabyte = 1024 * 1024 * 1024;
            const result = commonParsingFxn.analytics_to_buckets(resp, useReport, groupingKey, countKey, props.cumulativeSum, termDisplayAsFunc, topCount);
            if (result && Array.isArray(result) && result.length > 0) {
                _.forEach(result, (r) => {
                    r.total = r.total / gigabyte;
                    r.count = r.count / gigabyte;
                    if (r.children && Array.isArray(r.children) && r.children.length > 0) {
                        _.forEach(r.children, (c) => {
                            c.total = c.total / gigabyte;
                            c.count = c.count / gigabyte;
                        });
                    }
                });
            }
            return result;
        }
    },
    'file_views' : {
        'requires' : 'TrackingItem',
        'function' : function(resp, props){
            if (!resp || !resp['@graph']) return null;
            const { countBy : { file_views : countBy } } = props;

            let useReport = 'views_by_file';
            let termBucketField = 'file_type';
            let countKey = 'detail_views';

            switch (countBy) {
                case 'file_detail_views_by_file_type':
                    termBucketField = 'file_type_extended'; // File Type
                    break;
                case 'file_detail_views_by_assay_type':
                    termBucketField = 'assay_type_extended'; // Assay Type
                    break;
                case 'file_detail_views_by_dataset':
                    termBucketField = 'dataset'; // Sample Type
                    break;
                case 'file_detail_views_by_sequencer':
                    termBucketField = 'sequencer'; // Sequencing Platform
                    break;
                case 'file_list_views_by_file_type':
                    termBucketField = 'file_type_extended'; // File Type
                    countKey = 'list_views';
                    break;
                case 'file_list_views_by_assay_type':
                    termBucketField = 'assay_type_extended'; // Assay Type
                    countKey = 'list_views';
                    break;
                case 'file_list_views_by_dataset':
                    termBucketField = 'dataset'; // Sample Type
                    countKey = 'list_views';
                    break;
                case 'file_clicks_by_file_type':
                    termBucketField = 'file_type_extended'; // File Type
                    countKey = 'list_clicks';
                    break;
                case 'file_clicks_by_assay_type':
                    termBucketField = 'assay_type_extended'; // Assay Type
                    countKey = 'list_clicks';
                    break;
                case 'file_clicks_by_dataset':
                    termBucketField = 'dataset'; // Sample Type
                    countKey = 'list_clicks';
                    break;
                case 'metadata_tsv_by_country':
                    useReport = 'metadata_tsv_by_country';
                    termBucketField = 'source';
                    countKey = 'total_files';
                    break;
                default:
                    break;
            }

            return commonParsingFxn.analytics_to_buckets(resp, useReport, termBucketField, countKey, props.cumulativeSum);
        }
    },
};

// I forgot what purpose of all this was, kept because no time to refactor all now.
export const submissionsAggsToChartData = _.pick(aggregationsToChartData,
    'files_uploading', 'file_volume_uploading',
    'files_uploaded', 'file_volume_uploaded',
    'files_released', 'file_volume_released'
);


export const usageAggsToChartData = _.pick(aggregationsToChartData,
    'file_downloads',  'file_downloads_volume',
    'top_file_downloads',  'top_file_downloads_volume',
    'top_file_set_downloads',  'top_file_set_downloads_volume',
    'sessions_by_country', 'fields_faceted','file_views'
);


export class UsageStatsViewController extends React.PureComponent {

    static getSearchReqMomentsForTimePeriod(currentGroupBy = "daily:60") {
        let untilDate = new Date();
        let fromDate;

        if (currentGroupBy.startsWith("daily:")) {
            const days = parseInt(currentGroupBy.split(":")[1], 10); // Extract the number after 'daily:'
            untilDate = sub(untilDate, { days: 1 });
            fromDate = sub(untilDate, { days }); // Go back the specified number of days
        } else if (currentGroupBy.startsWith("monthly:")) {
            const months = currentGroupBy.split(":")[1];
            if (months === "All") { // Special case for 'monthly:All'
                fromDate = new Date("2023-12-31");
                untilDate = sub(startOfMonth(untilDate), { minutes: 1 }); // Last minute of previous month
            } else {
                const numMonths = parseInt(months, 10); // Extract the number after 'monthly:'
                untilDate = sub(startOfMonth(untilDate), { minutes: 1 }); // Last minute of previous month
                fromDate = sub(untilDate, { months: numMonths }); // Go back the specified number of months
            }
        }

        return { fromDate, untilDate };
    }

    static defaultProps = {
        'searchURIs' : {
            'TrackingItem' : function(props) {
                const { currentGroupBy, href } = props;
                const { fromDate, untilDate } = UsageStatsViewController.getSearchReqMomentsForTimePeriod(currentGroupBy);


                const report_names = [
                    // Reduce size of response a little bit (dl'd size is in range of 2-3 mb)
                    "fields_faceted",
                    "sessions_by_country",
                    "sessions_by_device_category",
                    "sessions_by_page",
                    "file_downloads_by_assay_type",
                    "file_downloads_by_dataset",
                    "file_downloads_by_sequencer",
                    "file_downloads_by_filetype",
                    "file_downloads_by_country",
                    "top_files_downloaded",
                    "metadata_tsv_by_country",
                    "views_by_file",
                    "for_date"
                ];

                const date_increment = currentGroupBy.startsWith('monthly') ? 'monthly' : 'daily';

                let uri = '/search/?type=TrackingItem&tracking_type=google_analytics&sort=-google_analytics.for_date&format=json';

                uri += '&limit=all&google_analytics.date_increment=' + date_increment;
                uri += '&google_analytics.for_date.from=' + formatDate(fromDate, 'yyyy-MM-dd') + '&google_analytics.for_date.to=' + formatDate(untilDate, 'yyyy-MM-dd');
                uri += "&" + report_names.map(function(n){ return "field=google_analytics.reports." + encodeURIComponent(n); }).join("&");
                uri += "&field=google_analytics.for_date";

                // For simpler testing & debugging -- if on localhost, connects to data.4dn by default.
                // if (href && href.indexOf('http://localhost') > -1){
                //     uri = 'https://data.smaht.org' + uri;
                // }
                return uri;
            }
        },

        /**
         * Return a boolean to determine whether to refetch (all) aggs from ES.
         *
         * @returns {boolean}
         */
        'shouldRefetchAggs' : function(pastProps, nextProps){
            return StatsViewController.defaultProps.shouldRefetchAggs(pastProps, nextProps) || (
                pastProps.currentGroupBy !== nextProps.currentGroupBy
            );
        }
    };

    constructor(props){
        super(props);
        this.changeCountByForChart = this.changeCountByForChart.bind(this);

        const countBy = {};

        Object.keys(usageAggsToChartData).forEach(function(k){
            if (k === 'file_downloads' || k === 'file_downloads_volume'){
                countBy[k] = 'assay_type'; // For file_downloads, countBy is treated as 'groupBy'.
            } else if (k === 'top_file_downloads' || k === 'top_file_downloads_volume'){
                countBy[k] = 'top_files_10'; // For top_file_downloads, countBy is treated as 'groupBy'.
            } else if (k === 'top_file_set_downloads' || k === 'top_file_set_downloads_volume'){
                countBy[k] = 'top_files_10'; // For top_file_downloads, countBy is treated as 'groupBy'.
            } else if (k === 'file_views'){
                countBy[k] = 'file_detail_views_by_assay_type';
            } else if (k === 'sessions_by_country'){
                countBy[k] = 'views_by_country';
            } else {
                countBy[k] = 'views';
            }
        });

        this.state = { countBy }; // aka include range queries for download tracking
    }

    changeCountByForChart(chartID, nextCountBy){
        setTimeout(()=>{
            // This might take some noticeable amount of time (not enough to justify a worker, tho) so we defer/deprioritize its execution to prevent blocking UI thread.
            this.setState(({ countBy: prevCountBy })=>{
                const countBy = _.clone(prevCountBy);
                countBy[chartID] = nextCountBy;
                return { countBy };
            });
        }, 0);
    }

    transformResultItems(result) {
        // do not transform
        if (!result || typeof result !== 'object' || !result['@graph'] ||
            !Array.isArray(result['@graph'] || result['@graph'].length === 0)) {
            return result;
        }

        const format = function (value1, value2) {
            if (value1 && value2 && value1 !== "None" && value2 !== "None") {
                return `${value1} (${value2})`
            } else if (value1 && value1 !== "None") {
                return value1;
            } else if (value2 && value2 !== "None") {
                return `N/A (${value2})`;
            }
            return 'N/A';
        }
        
        result['@graph'].forEach(function (resultItem) {
            const {
                google_analytics: {
                    reports: {
                        file_downloads_by_filetype = [],
                        file_downloads_by_assay_type = [],
                        views_by_file = [],
                        top_files_downloaded = [] } = {} } = {} } = resultItem;
            // file_downloads_by_filetype
            if (file_downloads_by_filetype.length > 0) {
                file_downloads_by_filetype.forEach(function (fd) {
                    const { file_type, file_format = '-' } = fd;
                    fd.file_type_extended = format(file_type, file_format);
                });
            }
            // file_downloads_by_assay_type
            if (file_downloads_by_assay_type.length > 0) {
                file_downloads_by_assay_type.forEach(function (fd) {
                    const { assay_type, sequencer = '-' } = fd;
                    fd.assay_type_extended = format(assay_type, sequencer);
                });
            }
            // views_by_file
            if (views_by_file.length > 0) {
                views_by_file.forEach(function (vf) {
                    const { file_type, file_format = '-', assay_type, sequencer = "-" } = vf;
                    vf.file_type_extended = format(file_type, file_format);
                    vf.assay_type_extended = format(assay_type, sequencer);
                });
            }

            // top_file_downloads
            if (top_files_downloaded.length > 0) {
                top_files_downloaded.forEach(function (tfd) {
                    if (!tfd.file_set) {
                        tfd.file_set = "N/A";
                    }
                });
            }
        });

        return result;
    }

    render() {
        return <StatsViewController {...this.props} {...this.state}
            changeCountByForChart={this.changeCountByForChart} transformResultItems={this.transformResultItems} />;
    }
}


export class SubmissionStatsViewController extends React.PureComponent {

    static createFileSearchUri(props, date_histogram) {
        const params = { 'type': 'File' };
        if (props.currentGroupBy) { params.group_by = props.currentGroupBy; }
        if (props.currentDateRangePreset) {
            if (props.currentDateRangePreset !== 'custom')
                params.date_range = props.currentDateRangePreset;
            else
                params.date_range = `custom|${props.currentDateRangeFrom || ''}|${props.currentDateRangeTo || ''}`;
        }
        params.date_histogram = Array.isArray(date_histogram) ? date_histogram : [date_histogram];
        const uri = '/date_histogram_aggregations/?' + queryString.stringify(params) + '&limit=0&format=json';

        // For local dev/debugging; don't forget to comment out if using.
        //uri = 'https://data.smaht.org' + uri;
        return uri;
    }

    static defaultProps = {
        'searchURIs' : {
            'FileUploading' : function(props) {
                return SubmissionStatsViewController.createFileSearchUri(props, 'date_created'/*'file_status_tracking.uploading'*/);
            },
            'FileUploaded' : function(props) {
                return SubmissionStatsViewController.createFileSearchUri(props, 'file_status_tracking.uploaded');
            },
            'FileReleased' : function(props) {
                return SubmissionStatsViewController.createFileSearchUri(props, 'file_status_tracking.released');
            },
        },
        'shouldRefetchAggs' : function(pastProps, nextProps){
            return StatsViewController.defaultProps.shouldRefetchAggs(pastProps, nextProps) || (
                pastProps.currentGroupBy !== nextProps.currentGroupBy ||
                pastProps.currentDateRangePreset !== nextProps.currentDateRangePreset ||
                pastProps.currentDateRangeFrom !== nextProps.currentDateRangeFrom ||
                pastProps.currentDateRangeTo !== nextProps.currentDateRangeTo
            );
        }
    };

    constructor(props){
        super(props);
        this.fetchAndGenerateExternalTermMap = this.fetchAndGenerateExternalTermMap.bind(this);
        this.state = { "externalTermMap" : null };
    }

    componentDidMount(){
        this.fetchAndGenerateExternalTermMap();
    }

    componentDidUpdate(pastProps){
        const { shouldRefetchAggs, session } = this.props;
        if (shouldRefetchAggs(pastProps, this.props)){
            if (pastProps.session !== session){
                // Avoid triggering extra re-aggregation from new/unnecessary term map being loaded.
                this.fetchAndGenerateExternalTermMap(true);
            }
        }
    }

    fetchAndGenerateExternalTermMap(refresh = false){
        const { externalTermMap } = this.state;
        if (!refresh && externalTermMap && _.keys(externalTermMap).length > 0) return;

        ajax.load('/search/?type=SubmissionCenter&limit=all', (resp)=>{
            this.setState({
                'externalTermMap' : _.object(_.map(resp['@graph'] || [], function(submissionCenter){
                    return [ submissionCenter.display_title, submissionCenter.identifier !== 'smaht_dac' ];
                }))
            });
        });
    }

    render(){ return <StatsViewController {...this.props} {...this.state} />; }

}


class UsageChartsCountByDropdown extends React.PureComponent {

    constructor(props){
        super(props);
        this.handleSelection = this.handleSelection.bind(this);
    }

    handleSelection(evtKey, evt){
        const { changeCountByForChart, chartID } = this.props;
        changeCountByForChart(chartID, evtKey);
        if (chartID == 'file_downloads') {
            changeCountByForChart('file_downloads_volume', evtKey);
        } else if (chartID == 'top_file_downloads') {
            changeCountByForChart('top_file_downloads_volume', evtKey);
        } else if (chartID == 'top_file_set_downloads') {
            changeCountByForChart('top_file_set_downloads_volume', evtKey);
        }
    }

    render(){
        const { countBy, chartID } = this.props;
        const currCountBy = countBy[chartID];

        const menuOptions = new Map();

        switch(chartID) {
            case 'file_downloads':
                menuOptions.set('filetype',   <React.Fragment><i className="icon fas icon-fas icon-file-alt me-1"/>File Downloads by File Type</React.Fragment>);
                menuOptions.set('assay_type', <React.Fragment><i className="icon fas icon-fas icon-vial me-1"/>File Downloads by Assay Type</React.Fragment>);
                menuOptions.set('dataset',    <React.Fragment><i className="icon fas icon-fas icon-database me-1"/>File Downloads by Sample Type</React.Fragment>);
                // menuOptions.set('sequencer',    <React.Fragment><i className="icon fas icon-fas icon-database me-1"/>File Downloads by Sequencing Platform</React.Fragment>);
                break;
            case 'top_file_downloads':
            case 'top_file_set_downloads':
                menuOptions.set('top_files_10',  <React.Fragment><i className="icon far icon-fas icon-folder me-1"/>Top 10</React.Fragment>);
                menuOptions.set('top_files_25',  <React.Fragment><i className="icon far icon-fas icon-folder me-1"/>Top 25</React.Fragment>);
                menuOptions.set('top_files_50',  <React.Fragment><i className="icon far icon-fas icon-folder me-1"/>Top 50 (may load slowly)</React.Fragment>);
                menuOptions.set('top_files_100', <React.Fragment><i className="icon far icon-fas icon-folder me-1"/>Top 100 (may load slowly)</React.Fragment>);
                break;
            case 'file_views':
                menuOptions.set('file_detail_views_by_file_type',  <React.Fragment><i className="icon fas icon-fw icon-file-alt me-1"/>Detail Views by File Type</React.Fragment>);
                menuOptions.set('file_detail_views_by_assay_type', <React.Fragment><i className="icon fas icon-fw icon-vial me-1"/>Detail Views by Assay Type</React.Fragment>);
                menuOptions.set('file_detail_views_by_dataset',    <React.Fragment><i className="icon fas icon-fw icon-database me-1"/>Detail Views by Sample Type</React.Fragment>);
                // menuOptions.set('file_detail_views_by_sequencer',    <React.Fragment><i className="icon fas icon-fw icon-database me-1"/>Detail Views by Seqeuncing Platform</React.Fragment>);
                menuOptions.set('file_list_views_by_file_type',    <React.Fragment><i className="icon fas icon-fas icon-file-alt me-1"/>Appearances in Search Results by File Type</React.Fragment>);
                menuOptions.set('file_list_views_by_assay_type',   <React.Fragment><i className="icon fas icon-fas icon-vial me-1"/>Appearances in Search Results by Assay Type</React.Fragment>);
                menuOptions.set('file_list_views_by_dataset',      <React.Fragment><i className="icon fas icon-fas icon-database me-1"/>Appearances in Search Results by Sample Type</React.Fragment>);
                menuOptions.set('file_clicks_by_file_type',        <React.Fragment><i className="icon fas icon-fas icon-file-alt me-1"/>Result Clicks by File Type</React.Fragment>);
                menuOptions.set('file_clicks_by_assay_type',       <React.Fragment><i className="icon fas icon-fas icon-vial me-1"/>Result Clicks by Assay Type</React.Fragment>);
                menuOptions.set('file_clicks_by_dataset',          <React.Fragment><i className="icon fas icon-fas icon-database me-1"/>Result Clicks by Sample Type</React.Fragment>);
                menuOptions.set('metadata_tsv_by_country',         <React.Fragment><i className="icon fas icon-fas icon-file me-1"/>Metadata.tsv Generation by Location</React.Fragment>);
                break;
            case 'sessions_by_country':
                menuOptions.set('views_by_country',    <React.Fragment><i className="icon icon-fw fas icon-map-marker me-1" />Page Views by Country</React.Fragment>);
                menuOptions.set('views_by_city',       <React.Fragment><i className="icon icon-fw fas icon-map-marker-alt me-1" />Page Views by City</React.Fragment>);
                menuOptions.set('device_category',     <React.Fragment><i className="icon icon-fw fas icon-laptop me-1" />Page Views by Device</React.Fragment>);
                // menuOptions.set('page_title',          <React.Fragment><i className="icon icon-fw fas icon-font me-1" />Page Views by Title (may load slowly)</React.Fragment>);
                // menuOptions.set('page_url',            <React.Fragment><i className="icon icon-fw fas icon-link me-1" />Page Views by Url (may load slowly)</React.Fragment>);
                menuOptions.set('sessions_by_country', <React.Fragment><i className="icon icon-fw fas icon-user-friends me-1" />Unique Users by Country</React.Fragment>);
                menuOptions.set('sessions_by_city',    <React.Fragment><i className="icon icon-fw fas icon-street-view me-1" />Unique Users by City</React.Fragment>);
                break;
            default:
                menuOptions.set('views',    <React.Fragment><i className="icon icon-fw fas icon-eye me-1"/>Views</React.Fragment>);
                menuOptions.set('sessions', <React.Fragment><i className="icon icon-fw fas icon-user me-1"/>Unique Users</React.Fragment>);
            break;
        }
        
        const dropdownTitle = menuOptions.get(currCountBy);

        return (
            <div className="d-inline-block me-05">
                <DropdownButton size="sm" id={"select_count_for_" + chartID}
                    onSelect={this.handleSelection} title={dropdownTitle}>
                    {_.map([ ...menuOptions.entries() ], function([ k, title ]){
                        return <DropdownItem eventKey={k} key={k}>{ title }</DropdownItem>;
                    })}
                </DropdownButton>
            </div>
        );
    }
}


export function UsageStatsView(props){
    const {
        loadingStatus, mounted, href, session, schemas, groupByOptions, handleGroupByChange, currentGroupBy, windowWidth,
        changeCountByForChart, countBy,
        // Passed in from StatsChartViewAggregator:
        sessions_by_country, chartToggles, fields_faceted,
        file_downloads, file_downloads_volume,
        top_file_downloads, top_file_downloads_volume,
        top_file_set_downloads, top_file_set_downloads_volume,
        file_views,
        // settings
        smoothEdges, onChartToggle, onSmoothEdgeToggle, cumulativeSum, onCumulativeSumToggle
    } = props;

    if (loadingStatus === 'failed'){
        return <div className="stats-charts-container" key="charts" id="usage"><ErrorIcon/></div>;
    }

    if (!mounted || (loadingStatus === 'loading' && (!file_downloads && !sessions_by_country))){
        return <div className="stats-charts-container" key="charts" id="usage"><LoadingIcon/></div>;
    }

    const [transposed, setTransposed] = useState(true);
    const [hideEmptyColumns, setHideEmptyColumns] = useState(true);
    const [highContrast, setHighContrast] = useState(false);
    const [ scale, setScale ] = useState({ yAxisScale: 'Pow', yAxisPower: 0.7 });
    const { anyExpandedCharts, commonXDomain, dateRoundInterval } = useMemo(function(){
        const { fromDate: propFromDate, untilDate: propUntilDate } = UsageStatsViewController.getSearchReqMomentsForTimePeriod(currentGroupBy);
        let fromDate, untilDate, dateRoundInterval;
        // We want all charts to share the same x axis. Here we round to date boundary.
        // Minor issue is that file downloads are stored in UTC/GMT while analytics are in EST timezone..
        // TODO improve on this somehow, maybe pass prop to FileDownload chart re: timezone parsing of some sort.
        if (currentGroupBy.startsWith('daily:')) {
            fromDate = add(startOfDay(propFromDate), { minutes: 15 });
            untilDate = add(endOfDay(propUntilDate), { minutes: 45 });
            dateRoundInterval = 'day';
        } else if (currentGroupBy.startsWith('monthly:')) {
            fromDate = endOfMonth(propFromDate); // Not rly needed.
            untilDate = sub(endOfMonth(propUntilDate), { days: 1 });
            dateRoundInterval = 'month';
        } else if (currentGroupBy.startsWith('yearly')) { // Not yet implemented
            dateRoundInterval = 'year';
        }
        return {
            anyExpandedCharts: _.any(_.values(chartToggles.expanded || {})),
            commonXDomain: [fromDate, untilDate],
            dateRoundInterval
        };
    }, [ currentGroupBy, anyExpandedCharts ]);

    const commonContainerProps = {
        'onToggle': onChartToggle,
        chartToggles,
        windowWidth,
        'defaultColSize': '12',
        'defaultHeight': anyExpandedCharts ? 200 : 250
    };
    const commonChartProps = {
        dateRoundInterval,
        'xDomain': commonXDomain,
        'curveFxn': smoothEdges ? d3.curveMonotoneX : d3.curveStepAfter,
        cumulativeSum: cumulativeSum
    };
    const countByDropdownProps = { countBy, changeCountByForChart };

    const sessionsByCountryChartHeight = ['page_title', 'page_url'].indexOf(countBy.sessions_by_country) > -1 ? 500 : commonContainerProps.defaultHeight;
    const enableSessionByCountryChartTooltipItemClick = (countBy.sessions_by_country === 'page_url');

    const { showScaleRange, scaleRangeTooltip, scaleRangeMin, scaleRangeMax, scaleRangeStep } = UsageStatsView.getYScaleDefaults(scale['yAxisScale']);

    const isSticky = true; //!_.any(_.values(tableToggle), (v)=> v === true);
    const commonTableProps = { windowWidth, href, session, schemas, transposed, dateRoundInterval, cumulativeSum, hideEmptyColumns, chartToggles };
    
    let topFileSetLimit = 0;
    if (countBy.top_file_set_downloads && countBy.top_file_set_downloads.indexOf('top_files_') === 0) {
        topFileSetLimit = parseInt(countBy.top_file_set_downloads.substring('top_files_'.length));
    }
    let topFilesLimit = 0;
    if (countBy.top_file_downloads && countBy.top_file_downloads.indexOf('top_files_') === 0) {
        topFilesLimit = parseInt(countBy.top_file_downloads.substring('top_files_'.length));
    }

    return (
        <div className="stats-charts-container" key="charts" id="usage">

            <GroupByDropdown {...{ groupByOptions, loadingStatus, handleGroupByChange, currentGroupBy }}
                groupByTitle="Show" outerClassName={"dropdown-container mb-0" + (isSticky ? " sticky-top" : "")}>
                <div className="settings-label d-inline-block me-15 pt-08">
                    <Checkbox checked={smoothEdges} onChange={onSmoothEdgeToggle} data-tip="Toggle between smooth/sharp edges">Smooth Edges</Checkbox>
                </div>
                <div className="settings-label d-inline-block me-3 mb-2 pt-08">
                    <Checkbox checked={cumulativeSum} onChange={onCumulativeSumToggle} data-tip="Show as cumulative sum">Cumulative Sum</Checkbox>
                </div>
                <div className="settings-label d-inline-block me-3 mb-2 pt-08">
                    <Checkbox checked={transposed} onChange={() => setTransposed(!transposed)} data-tip="Transpose data table">Transpose Data</Checkbox>
                </div>
                <div className="settings-label d-inline-block me-3 mb-2 pt-08">
                    <Checkbox checked={hideEmptyColumns} onChange={() => setHideEmptyColumns(!hideEmptyColumns)} data-tip="Hide empty data table columns">Hide Empty Columns</Checkbox>
                </div>
                <div className="settings-label d-inline-block me-3 mb-2 pt-08">
                    <Checkbox checked={highContrast} onChange={() => setHighContrast(!highContrast)} data-tip="Toggle high contrast color scheme">High Contrast</Checkbox>
                </div>
                <div className="settings-label d-block d-md-inline-block pt-08">
                    <div className="d-md-flex">
                        <span className="text-500 me-1">Y-Axis scale:</span>
                        <div className='mb-15'>
                            <DropdownButton size="sm"
                                title={(scale && scale['yAxisScale'] && UsageStatsView.yScaleLabels[scale['yAxisScale']]) || '-'}
                                onSelect={(e) => setScale({ yAxisScale: e, yAxisPower: e === 'Pow' ? 0.5 : 50 })}>
                                <DropdownItem eventKey={'Linear'} key={'scale-linear'} >{UsageStatsView.yScaleLabels['Linear']}</DropdownItem>
                                <DropdownItem eventKey={'Pow'} key={'scale-pow'} >{UsageStatsView.yScaleLabels['Pow']}</DropdownItem>
                                <DropdownItem eventKey={'Symlog'} key={'scale-log'} >{UsageStatsView.yScaleLabels['Symlog']}</DropdownItem>
                            </DropdownButton>
                        </div>
                        <div className={"ms-md-15" + (showScaleRange ? " d-block d-md-inline-block" : " d-none")}>
                            <input type="range" id="input_range_y_scale_power" className='w-75'
                                min={scaleRangeMin} max={scaleRangeMax} step={scaleRangeStep} value={scale['yAxisPower']} data-tip={scaleRangeTooltip}
                                onChange={(e) => setScale({ yAxisScale: scale['yAxisScale'], yAxisPower: e.target.valueAsNumber })} />
                            <span className='ms-05'>{scale['yAxisPower']}</span>
                        </div>
                    </div>
                </div>
            </GroupByDropdown>

            { file_downloads ?

                <ColorScaleProvider resetScalesWhenChange={file_downloads} highContrast={highContrast}>
                
                    <div className="clearfix">
                        <div className="pull-right mt-05">
                            <UsageChartsCountByDropdown {...countByDropdownProps} chartID="file_downloads" />
                        </div>
                        <ChartContainerTitle {...{ 'titleMap': UsageStatsView.titleMap, countBy, 'chartKey': 'file_downloads' }} />
                    </div>

                    <HorizontalD3ScaleLegend {...{ loadingStatus }} />

                    <AreaChartContainer {...commonContainerProps} id="file_downloads" key="file_downloads"
                        title={<h5 className="text-400 mt-0">Total File Count</h5>}>
                        {chartToggles.chart?.file_downloads ?
                            <AreaChart {...commonChartProps} data={file_downloads} {...scale} />
                            : <React.Fragment />
                        }
                    </AreaChartContainer>

                    {chartToggles.table?.file_downloads &&
                        <StatisticsTable data={file_downloads}
                            key={'dt_file_downloads'}
                            {...commonTableProps}
                            termColText={UsageStatsView.titleMap['file_downloads'][countBy['file_downloads']][2]} //refactor this code
                            containerId="content_file_downloads" />
                    }

                    <AreaChartContainer {...commonContainerProps} id="file_downloads_volume" key="file_downloads_volume" defaultHeight={300}
                        title={<h5 className="text-400 mt-0">Total File Size (GB)</h5>}>
                        {chartToggles.chart?.file_downloads_volume ?
                            <AreaChart {...commonChartProps} data={file_downloads_volume} yAxisLabel="GB" {...scale} />
                            : <React.Fragment />
                        }
                    </AreaChartContainer>

                    {chartToggles.table?.file_downloads_volume &&
                        <StatisticsTable data={file_downloads_volume}
                            key={'dt_file_downloads_volume'}
                            valueLabel="GB"
                            {...commonTableProps}
                            containerId="content_file_downloads_volume" />
                    }

                </ColorScaleProvider>

                : null }

            {top_file_set_downloads ?

                <ColorScaleProvider resetScalesWhenChange={top_file_set_downloads} highContrast={highContrast}>

                    <div className="clearfix">
                        <div className="pull-right mt-05">
                            <UsageChartsCountByDropdown {...countByDropdownProps} chartID="top_file_set_downloads" />
                        </div>
                        <ChartContainerTitle {...{ 'titleMap': UsageStatsView.titleMap, countBy, 'chartKey': 'top_file_set_downloads' }} />
                    </div>

                    {/* <HorizontalD3ScaleLegend {...{ loadingStatus }} /> */}

                    <AreaChartContainer {...commonContainerProps} id="top_file_set_downloads" key="top_file_set_downloads" defaultHeight={300}
                        title={<h5 className="text-400 mt-0">Total Count for Daily Downloads</h5>}>
                        {chartToggles.chart?.top_file_set_downloads ?
                            <AreaChart {...commonChartProps} data={top_file_set_downloads} showTooltipOnHover={true} {...scale} />
                            : <React.Fragment />
                        }
                    </AreaChartContainer>

                    {chartToggles.table?.top_file_set_downloads &&
                        <StatisticsTable data={top_file_set_downloads}
                            key={'dt_top_file_set_downloads'}
                            {...commonTableProps}
                            containerId="content_top_file_set_downloads"
                            limit={topFileSetLimit} excludeNones={true} />
                    }

                    <AreaChartContainer {...commonContainerProps} id="top_file_set_downloads_volume" key="top_file_set_downloads_volume" 
                        defaultHeight={350} title={<h5 className="text-400 mt-0">Total Size for Daily Downloads (GB)</h5>}>
                        {chartToggles.chart?.top_file_set_downloads_volume ?
                            <AreaChart {...commonChartProps} data={top_file_set_downloads_volume} showTooltipOnHover={true} yAxisLabel="GB" {...scale} />
                            : <React.Fragment />
                        }
                    </AreaChartContainer>

                    {chartToggles.table?.top_file_set_downloads_volume &&
                        <StatisticsTable data={top_file_set_downloads_volume}
                            key={'dt_top_file_set_downloads_volume'}
                            valueLabel="GB"
                            {...commonTableProps}
                            containerId="content_top_file_set_downloads_volume"
                            limit={topFileSetLimit} excludeNones={true} />
                    }

                </ColorScaleProvider>

                : null}

            { top_file_downloads && false ?

                <ColorScaleProvider resetScalesWhenChange={top_file_downloads} highContrast={highContrast}>
                
                    <div className="clearfix">
                        <div className="pull-right mt-05">
                            <UsageChartsCountByDropdown {...countByDropdownProps} chartID="top_file_downloads" />
                        </div>
                        <ChartContainerTitle {...{ 'titleMap': UsageStatsView.titleMap, countBy, 'chartKey': 'top_file_downloads' }} />
                    </div>

                    <AreaChartContainer {...commonContainerProps} id="top_file_downloads" key="top_file_downloads"
                        defaultHeight={300} title={<h5 className="text-400 mt-0">Total File Count for Daily Downloads</h5>}
                        subTitle={<h4 className="fw-normal text-secondary">Click bar to view details</h4>}>
                        {chartToggles.chart?.top_file_downloads ?
                            <AreaChart {...commonChartProps} data={top_file_downloads} showTooltipOnHover={false} {...scale} />
                            : <React.Fragment />
                        }
                    </AreaChartContainer>

                    {chartToggles.table?.top_file_downloads &&
                        <StatisticsTable data={top_file_downloads} 
                            key={'dt_top_file_downloads'}
                            {...commonTableProps}
                            containerId="content_top_file_downloads"
                            limit={topFilesLimit} excludeNones={true} />
                    }

                    <AreaChartContainer {...commonContainerProps} id="top_file_downloads_volume" key="top_file_downloads_volume" defaultHeight={350}
                        title={<h5 className="text-400 mt-0">Total File Size for Daily Downloads (GB)</h5>}
                        extraButtons={[]}
                        subTitle={<h4 className="fw-normal text-secondary">Click bar to view details</h4>}>
                        {chartToggles.chart?.top_file_downloads_volume ?
                            <AreaChart {...commonChartProps} data={top_file_downloads_volume} showTooltipOnHover={false} yAxisLabel="GB" {...scale} />
                            : <React.Fragment />
                        }
                    </AreaChartContainer>

                    {chartToggles.table?.top_file_downloads_volume &&
                        <StatisticsTable data={top_file_downloads_volume} 
                            key={'dt_top_file_downloads_volume'}
                            valueLabel="GB"
                            {...commonTableProps}
                            containerId="content_top_file_downloads_volume"
                            limit={topFilesLimit} excludeNones={true} />
                    }

                    <p className='fst-italic mt-2'>* File downloads before June 10th, 2024, only include browser-initiated ones and may not be accurate.</p>

                </ColorScaleProvider>

                : null }

            { file_views ?

                <ColorScaleProvider resetScalesWhenChange={file_views} highContrast={highContrast}>

                    <AreaChartContainer {...commonContainerProps} id="file_views" key="file_views"
                        title={<ChartContainerTitle {...{ 'titleMap': UsageStatsView.titleMap, countBy, 'chartKey': 'file_views' }} />}
                        extraButtons={[
                            <UsageChartsCountByDropdown {...countByDropdownProps} chartID="file_views" key="file_views_count_by_dd" />
                        ]}
                        legend={<HorizontalD3ScaleLegend {...{ loadingStatus }} />}>
                        {chartToggles.chart?.file_views ?
                            <AreaChart {...commonChartProps} data={file_views} {...scale} />
                            : <React.Fragment />
                        }
                    </AreaChartContainer>

                    {chartToggles.table?.file_views &&
                        <StatisticsTable data={file_views} 
                            key={'dt_file_views'}
                            {...commonTableProps}
                            containerId="content_file_views" />
                    }

                </ColorScaleProvider>

                : null}

            { sessions_by_country ?

                <ColorScaleProvider resetScaleLegendWhenChange={sessions_by_country} highContrast={highContrast}>

                    <AreaChartContainer {...commonContainerProps} id="sessions_by_country" key="sessions_by_country"
                        title={<ChartContainerTitle {...{ 'titleMap': UsageStatsView.titleMap, countBy, 'chartKey': 'sessions_by_country' }} />}
                        subTitle={enableSessionByCountryChartTooltipItemClick && <h4 className="fw-normal text-secondary">Click bar to view details</h4>}
                        extraButtons={[
                            <UsageChartsCountByDropdown {...countByDropdownProps} chartID="sessions_by_country" key="sessions_by_country_count_by_dd" />
                        ]}
                        legend={<HorizontalD3ScaleLegend {...{ loadingStatus }} />}
                        defaultHeight={sessionsByCountryChartHeight}>
                        {chartToggles.chart?.sessions_by_country ?
                            <AreaChart {...commonChartProps} data={sessions_by_country} showTooltipOnHover={!enableSessionByCountryChartTooltipItemClick} {...scale} />
                            : <React.Fragment />
                        }
                    </AreaChartContainer>


                    {chartToggles.table?.sessions_by_country &&
                        <StatisticsTable data={sessions_by_country} 
                            key={'dt_sessions_by_country'}
                            {...commonTableProps}
                            containerId="content_sessions_by_country" />
                    }

                </ColorScaleProvider>

                : null }


            {/* { fields_faceted ?

                <ColorScaleProvider resetScaleLegendWhenChange={fields_faceted} highContrast={highContrast}>

                    <AreaChartContainer {...commonContainerProps} id="fields_faceted" key="fields_faceted"
                        title={<ChartContainerTitle {...{ 'titleMap': UsageStatsView.titleMap, countBy, 'chartKey': 'fields_faceted' }} />}
                        extraButtons={[
                            <UsageChartsCountByDropdown {...countByDropdownProps} chartID="fields_faceted" />
                        ]}
                        legend={<HorizontalD3ScaleLegend {...{ loadingStatus }} />}
                        hideTableButton>
                        {chartToggles.chart?.fields_faceted ?
                            <AreaChart {...commonChartProps} data={fields_faceted} {...scale} />
                            : <React.Fragment />
                        }
                    </AreaChartContainer>


                </ColorScaleProvider>

                : null } */}

        </div>
    );
}
UsageStatsView.titleMap = {
    'file_views': {
        'metadata_tsv_by_country': ['Total Files In Metadata.tsv', 'by location'],
        'file_list_views_by_file_type': ['File Appearances In Search Results', 'by file type'],
        'file_list_views_by_assay_type': ['File Appearances In Search Results', 'by assay type'],
        'file_list_views_by_dataset': ['File Appearances In Search Results', 'by sample type'],
        'file_clicks_by_file_type': ['File Search Result Clicks', 'by file type'],
        'file_clicks_by_assay_type': ['File Search Result Clicks', 'by assay type'],
        'file_clicks_by_dataset': ['File Search Result Clicks', 'by sample type'],
        'file_detail_views_by_file_type': ['File Overview Page Views', 'by file type'],
        'file_detail_views_by_assay_type': ['File Overview Page Views', 'by assay type'],
        'file_detail_views_by_dataset': ['File Overview Page Views', 'by sample type'],
        'file_detail_views_by_sequencer': ['File Overview Page Views', 'by sequencing platform'],
    },
    'sessions_by_country': {
        'views_by_country': ['Page Views', 'by country'],
        'views_by_city': ['Page Views', 'by city'],
        'sessions_by_country': ['Unique Users', 'by country'],
        'sessions_by_city': ['Unique Users', 'by city'],
        'device_category': ['Page Views', 'by device category'],
        'page_title': ['Page Views', 'by page title'],
        'page_url': ['Page Views', 'by page url']
    },
    'file_downloads': {
        'assay_type': ['File Downloads', 'by assay type', 'Assay Type (number of download attempts)'],
        'filetype': ['File Downloads', 'by file type', 'File Type (number of download attempts)'],
        'dataset': ['File Downloads', 'by sample type', 'Sample Type (number of download attempts)'],
        'sequencer': ['File Downloads', 'by sequencing platform', 'Sequencing Platform (number of download attempts)']
    },
    'top_file_downloads': {
        'top_files_10': ['Top File Downloads', 'top 10'],
        'top_files_25': ['Top File Downloads', 'top 25'],
        'top_files_50': ['Top File Downloads', 'top 50'],
        'top_files_100': ['Top File Downloads', 'top 100']
    },
    'top_file_set_downloads': {
        'top_files_10': ['Top File Set Downloads', 'top 10'],
        'top_files_25': ['Top File Set Downloads', 'top 25'],
        'top_files_50': ['Top File Set Downloads', 'top 50'],
        'top_files_100': ['Top File Set Downloads', 'top 100'],
    },
    'fields_faceted': {
        'views': ['Top Fields Faceted', 'by search result instance'],
        'sessions': ['Top Fields Faceted', 'by unique users']
    }
};
UsageStatsView.getYScaleDefaults = function (yScale) {
    let showScaleRange = true;
    let scaleRangeTooltip = '';
    let scaleRangeMin, scaleRangeMax, scaleRangeStep;
    //set defaults
    if (yScale === 'Pow') {
        scaleRangeMin = 0; scaleRangeMax = 1; scaleRangeStep = 0.1;
        scaleRangeTooltip = 'exponent';
    } else if (yScale === 'Symlog') {
        scaleRangeMin = 0; scaleRangeMax = 100; scaleRangeStep = 0.5;
        scaleRangeTooltip = 'constant';
    } else {
        showScaleRange = false;
    }
    return { showScaleRange, scaleRangeTooltip, scaleRangeMin, scaleRangeMax, scaleRangeStep };
}
UsageStatsView.yScaleLabels = {
    'Linear': 'Linear',
    'Symlog': 'Log',
    'Pow': 'Pow'
}

export function SubmissionsStatsView(props) {
    const {
        loadingStatus, mounted, session, windowWidth,
        currentGroupBy, groupByOptions, handleGroupByChange,
        currentDateRangePreset, currentDateRangeFrom, currentDateRangeTo, dateRangeOptions, handleDateRangeChange,
        // Passed in from StatsChartViewAggregator:
        files_uploading, file_volume_uploading,  files_uploaded, file_volume_uploaded, files_released, file_volume_released,
        chartToggles, smoothEdges, width, onChartToggle, onSmoothEdgeToggle, cumulativeSum, onCumulativeSumToggle
    } = props;

    if (!mounted || (!files_released)){
        return <div className="stats-charts-container" key="charts" id="submissions"><LoadingIcon/></div>;
    }

    if (loadingStatus === 'failed'){
        return <div className="stats-charts-container" key="charts" id="submissions"><ErrorIcon/></div>;
    }

    const anyExpandedCharts = _.any(_.values(chartToggles));
    const commonContainerProps = {
        'onToggle' : onChartToggle, chartToggles, windowWidth,
        'defaultColSize' : '12', 'defaultHeight' : anyExpandedCharts ? 200 : 250
    };
    const xDomain = convertDataRangeToXDomain(currentDateRangePreset, currentDateRangeFrom, currentDateRangeTo);
    const commonChartProps = { 'curveFxn' : smoothEdges ? d3.curveMonotoneX : d3.curveStepAfter, cumulativeSum, xDomain };
    const groupByProps = {
        currentGroupBy, groupByOptions, handleGroupByChange,
        currentDateRangePreset, currentDateRangeFrom, currentDateRangeTo, dateRangeOptions, handleDateRangeChange, loadingStatus
    };
    const invalidDateRange = currentDateRangeFrom && currentDateRangeTo && currentDateRangeFrom > currentDateRangeTo;

    return (
        <div className="stats-charts-container" key="charts" id="submissions">

            <GroupByDropdown {...groupByProps} groupByTitle="Group Charts Below By" dateRangeTitle="Date" outerClassName="dropdown-container mb-15 sticky-top">
                <div className="d-inline-block me-15">
                    <Checkbox checked={smoothEdges} onChange={onSmoothEdgeToggle}>Smooth Edges</Checkbox>
                </div>
                <div className="d-inline-block">
                    <Checkbox checked={cumulativeSum} onChange={onCumulativeSumToggle}>Show as cumulative sum</Checkbox>
                </div>
            </GroupByDropdown>

            <ColorScaleProvider width={width} resetScalesWhenChange={files_uploading}>

                <h3 className="charts-group-title">Metadata submitted</h3>

                <HorizontalD3ScaleLegend {...{ loadingStatus }} />

                <AreaChartContainer {...commonContainerProps} id="files_uploading"
                    title={<h5 className="text-400 mt-0">Total File Count</h5>}
                    subTitle={<ChartSubTitle invalidDateRange={invalidDateRange} data={files_uploading} />}
                    hideChartButton hideTableButton>
                    <AreaChart {...commonChartProps} data={files_uploading} />
                </AreaChartContainer>

                <AreaChartContainer {...commonContainerProps} id="file_volume_uploading"
                    title={<h5 className="text-400 mt-0">Total File Size (GB)</h5>}
                    subTitle={<ChartSubTitle invalidDateRange={invalidDateRange} data={file_volume_uploading} />}
                    hideChartButton hideTableButton>
                    <AreaChart {...commonChartProps} data={file_volume_uploading} yAxisLabel="GB" />
                </AreaChartContainer>

            </ColorScaleProvider>

            <ColorScaleProvider width={width} resetScalesWhenChange={files_uploaded}>

                <h3 className="charts-group-title">Data submitted</h3>

                <HorizontalD3ScaleLegend {...{ loadingStatus }} />

                <AreaChartContainer {...commonContainerProps} id="files_uploaded"
                    title={<h5 className="text-400 mt-0">Total File Count</h5>}
                    subTitle={<ChartSubTitle invalidDateRange={invalidDateRange} data={files_uploaded} />}
                    hideChartButton hideTableButton>
                    <AreaChart {...commonChartProps} data={files_uploaded} />
                </AreaChartContainer>

                <AreaChartContainer {...commonContainerProps} id="file_volume_uploaded"
                    title={<h5 className="text-400 mt-0">Total File Size (GB)</h5>}
                    subTitle={<ChartSubTitle invalidDateRange={invalidDateRange} data={file_volume_uploaded} />}
                    hideChartButton hideTableButton>
                    <AreaChart {...commonChartProps} data={file_volume_uploaded} yAxisLabel="GB" />
                </AreaChartContainer>

            </ColorScaleProvider>


            <ColorScaleProvider width={width} resetScalesWhenChange={files_released}>

                <h3 className="charts-group-title">Data released to the portal</h3>

                <HorizontalD3ScaleLegend {...{ loadingStatus }} />

                <AreaChartContainer {...commonContainerProps} id="files_released"
                    title={<h5 className="text-400 mt-0">Total File Count</h5>}
                    subTitle={<ChartSubTitle invalidDateRange={invalidDateRange} data={files_released} />}
                    hideChartButton hideTableButton>
                    <AreaChart {...commonChartProps} data={files_released} />
                </AreaChartContainer>

                <AreaChartContainer {...commonContainerProps} id="file_volume_released"
                    title={<h5 className="text-400 mt-0">Total File Size (GB)</h5>}
                    subTitle={<ChartSubTitle invalidDateRange={invalidDateRange} data={file_volume_released} />}
                    hideChartButton hideTableButton>
                    <AreaChart {...commonChartProps} data={file_volume_released} yAxisLabel="GB" />
                </AreaChartContainer>

            </ColorScaleProvider>

        </div>
    );
}

/**
 * Use this only for charts with child terms 'Internal Release' and 'Public Release', which are
 * meant to have a separate color scale and child terms from other charts.
 *
 * @param {string} term - One of 'Internal Release' or 'Public Release'.
 * @returns {string} A CSS-valid color string.
 */
SubmissionsStatsView.colorScaleForPublicVsInternal = function(term){
    if (term === 'Internal Release' || term === 'Internally Released'){
        return '#ff7f0e'; // Orange
    } else if (term === 'Public Release' || term === 'Publicly Released'){
        return '#1f77b4'; // Blue
    } else {
        logger.error("Term supplied is not one of 'Internal Release' or 'Public Release': '" + term + "'.");
        throw new Error("Term supplied is not one of 'Internal Release' or 'Public Release': '" + term + "'.");
    }
};

const convertDataRangeToXDomain = memoize(function (rangePreset = 'all', rangeFrom, rangeTo) {
    const rangeLower = (rangePreset || '').toLowerCase();
    
    const defaultFromDate = '2023-11-08';
    const today = new Date();
    const month = today.getMonth();
    let from = new Date(today.getFullYear(), month, 1);
    let to = null;

    switch (rangeLower) {
        case 'thismonth':
            //do nothing
            break;
        case 'previousmonth':
            //override
            from.setMonth(month - 1);
            to = new Date(today.getFullYear(), month, 1);
            break;
        case 'last3months':
            from.setMonth(month - 2);
            break;
        case 'last6months':
            from.setMonth(month - 5);
            break;
        case 'last12months':
            from.setMonth(month - 11);
            break;
        case 'thisyear':
            from = new Date(today.getFullYear(), 0, 1);
            break;
        case 'previousyear':
            //override
            from = new Date(today.getFullYear() - 1, 0, 1);
            to = new Date(today.getFullYear(), 1, 1);
            break;
        case 'custom':
            from = new Date(rangeFrom || defaultFromDate);
            to = rangeTo ? new Date(rangeTo) : null;
            if (from && to && (from > to)) {
                from = new Date(defaultFromDate);
                to = null;
            }
            break;
        case 'all':
        default:
            from = new Date(defaultFromDate);
            break;
    }
    // get first day of date's week
    const dayOfWeek = from.getDay(); // Sunday: 0, Monday: 1, ..., Saturday: 6
    const daysDifference = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Adjust for Monday being 1
    const firstWeekdayFrom = new Date(from.getTime() - daysDifference * 24 * 60 * 60 * 1000);

    return [firstWeekdayFrom, to];
});

const ChartSubTitle = memoize(function ({ title, data, invalidDateRange }) {
    if (invalidDateRange === true) {
        return <h4 className="fw-normal text-secondary">Invalid date range</h4>;
    }
    if (!data || (Array.isArray(data) && data.length === 0)) {
        return <h4 className="fw-normal text-secondary">No data to display</h4>;
    }
    return title || null;
});

const ChartContainerTitle = function ({ titleMap, countBy, chartKey }) {
    const [primary, secondary] = titleMap[chartKey][countBy[chartKey]];
    return (
        <h3 className="charts-group-title">
            <span className="d-block d-sm-inline">{primary}</span>
            {secondary &&
                <React.Fragment>
                    <span className="text-300 d-none d-sm-inline"> - </span>
                    <span className="text-300">{secondary}</span>
                </React.Fragment>
            }
        </h3>
    );
}

/**
 * converts aggregates to SearchView-compatible context objects and displays in table
 */
const StatisticsTable = React.memo((props) => {
    const {
        data, termColText = null, valueLabel = null, session, schemas, containerId = '', 
        href, dateRoundInterval, transposed = false, windowWidth, cumulativeSum, hideEmptyColumns,
        limit = 0, excludeNones = false // limit and excludeNones are evaluated for only transposed data
     } = props;
    const [columns, setColumns] = useState({});
    const [columnDefinitions, setColumnDefinitions] = useState([]);
    const [graph, setGraph] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [modalForDate, setModalForDate] = useState();

    const transposeData = (data) => {
        const result = [];
        const termMap = {};

        data.forEach(({ date, children }) => {
            children.forEach(({ term, count, total }) => {
                // remove None-like values
                if (excludeNones && ['N/A', 'None', '(not set)'].indexOf(term) !== -1) {
                    return;
                }

                if (!termMap[term]) {
                    termMap[term] = { term, count: 0, total: 0, children: [] };
                    result.push(termMap[term]);
                }

                termMap[term].children.push({ date, count, total });
                termMap[term].count += count;
                termMap[term].total += total;
            });
        });

        return _.sortBy(result, (r) => -r.total);
    };

    const roundValue = function (value, label, threshold = 0.01) {
        if (value === 0) return value;
        const roundedValue = (value >= threshold && value % 1 > 0) ? Math.round(value * 100) / 100 : (value >= threshold ? value : ('<' + threshold));
        return label ? roundedValue + ' ' + label : roundedValue;
    }

    useEffect(() => {
        if (!Array.isArray(data) || data.length === 0) {
            return;
        }

        const processData = transposed ? transposeData(data).slice(0, limit > 0 ? limit : undefined) : data;

        // date or term column based on transposed or not
        let cols = {
            'display_title': {
                title: transposed ? (termColText || 'Term') : 'Date',
                type: 'string',
                noSort: true,
                widthMap: transposed ? { 'lg': 400, 'md': 200, 'sm': 200 } : { 'lg': 200, 'md': 200, 'sm': 200 },
                render: function (result) {
                    // overall sum
                    const overallSum = roundValue(result.overall_sum || 0, valueLabel);
                    const tooltip = `${result.display_title} (${overallSum})`;

                    return transposed ? (
                        <span className="value text-truncate text-start" data-tip={tooltip.length > 40 ? tooltip : null}>
                            {result.display_title} <strong>({overallSum})</strong>
                        </span>
                    ) : (
                            <a href='#'
                                onClick={(e) => {
                                    setModalForDate(result.display_title);
                                    setShowModal(true);
                                    e.preventDefault();
                                }}
                                data-tip="Show details">
                                {result.display_title} <strong>({overallSum})</strong>
                            </a>
                    );
                }
            }
        };

        // Function to check a vertical slice (column)
        const hasNonZeroInColumn = (arrays, columnIndex) => _.any(arrays, (row) => row.children[columnIndex].count !== 0);

        // create columns and columnExtensionMap
        const [item] = processData;
        if (item && Array.isArray(item.children) && item.children.length > 0) {
            const keys = transposed ? _.pluck(item.children, 'date') : _.pluck(item.children, 'term');
            cols = _.reduce(keys, (memo, dataKey, index) => {
                if (hideEmptyColumns && !hasNonZeroInColumn(processData, index)) {
                    return memo;
                }
                memo[dataKey] = {
                    title: dataKey,
                    type: 'integer',
                    noSort: true,
                    widthMap: { 'lg': 140, 'md': 120, 'sm': 120 },                  
                    render: function (result) {
                        if (result[dataKey] !== 0) {
                            return (
                                <a href='#'
                                    onClick={(e) => {
                                        setModalForDate(transposed ? dataKey : result.display_title);
                                        setShowModal(true);
                                        e.preventDefault();
                                    }}
                                    data-tip="Show details"
                                    className="value text-end fw-bold">
                                    {roundValue(result[dataKey], valueLabel)}
                                </a>
                            );
                        } else {
                            return <span className="value text-end">0</span>
                        }
                    }
                };
                return memo;
            }, { ...cols });
        }

        setColumns(cols);
        const colDefs = _.map(_.pairs(cols), function (p) { return { field: p[0], ...p[1] } });
        setColumnDefinitions(colDefs);

        // create @graph
        const result = _.map(processData, function (d) {
            return {
                display_title: transposed ? (d.termDisplayAs || d.term) : d.date,
                '@id': transposed ? d.term : d.date,
                ..._.reduce(d.children, (memo2, c) => {
                    memo2[transposed ? c.date : c.term] = c.count;
                    return memo2;
                }, {}),
                '@type': ['Item'],
                'overall_sum': !cumulativeSum ? (d.total || 0) : _.reduce(d.children, (memo, c) => memo + c.count, 0),
                'date_created': transposed ? d.term : d.date
            };
        });
        setGraph(result);
    }, [data, transposed, hideEmptyColumns]);

    const passProps = {
        isFullscreen: false,
        href,
        context: {
            '@graph': graph || [],
            total: graph?.length || 0,
            columns: columns || [],
            facets: null
        },
        results: graph || [],
        columns,
        columnExtensionMap: columns,
        columnDefinitions: columnDefinitions,
        session,
        maxHeight: 500,
        maxResultsBodyHeight: 500,
        tableColumnClassName: "col-12",
        facetColumnClassName: "d-none",
        defaultColAlignment: "text-end",
        stickyFirstColumn: true,
        isOwnPage: false,
        termTransformFxn: Term.toName
    };

    const modalProps = {
        ...{ dateRoundInterval, schemas },
        forDate: modalForDate,
        onHide: () => setShowModal(false)
    };

    return (
        <React.Fragment>
            <div className="container" id={containerId}>
                <CustomColumnController {...{ windowWidth }} hiddenColumns={{}} columnDefinitions={columnDefinitions} context={passProps.context}>
                    <SortController>
                        <ControlsAndResults {...passProps} />
                    </SortController>
                </CustomColumnController>
            </div>
            {showModal && <TrackingItemViewer {...modalProps} />}
        </React.Fragment>
    );
});

/**
 * displays tracking item ajax-fetched in ItemDetailList
 */
const TrackingItemViewer = React.memo(function (props) {
    const { schemas, forDate, dateRoundInterval='day', reportName, onHide } = props;

    const [isLoading, setIsLoading] = useState(true);
    const [trackingItem, setTrackingItem] = useState();
    const dateIncrement = (dateRoundInterval === 'month') ? 'monthly' : 'daily';
    const href=`/search/?type=TrackingItem&google_analytics.for_date=${forDate}&google_analytics.date_increment=${dateIncrement}`;
    
    useEffect(() => {
        ajax.load(
            href,
            (resp) => {
                const graph = resp['@graph'] || [];
                setTrackingItem(graph.length > 0 ? graph[0] : null);
                setIsLoading(false);
            },
            'GET',
            (err) => {
                Alerts.queue({
                    title: 'Fetching tracking items failed',
                    message:
                        'Check your internet connection or if you have been logged out due to expired session.',
                    style: 'danger',
                });
                setIsLoading(false);
            }
        );
    }, [forDate, dateRoundInterval, reportName]);

    return (
        <Modal show size="xl" onHide={onHide} className="tracking-item-viewer">
            <Modal.Header closeButton>
                <Modal.Title>{forDate}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {isLoading ?
                    <span className="pull-right">
                        <i className="account-icon icon icon-spin icon-circle-notch fas align-middle" />
                    </span> :
                    <ItemDetailList context={trackingItem} collapsed={false} schemas={schemas} />
                }
            </Modal.Body>
        </Modal>
    );
});
TrackingItemViewer.propTypes = {
    forDate: PropTypes.string.isRequired,
    dateRoundInterval: PropTypes.oneOf(['daily', 'monthly']),
    onTrackingItemViewerCancel: PropTypes.func.isRequired,
    schemas: PropTypes.object
}