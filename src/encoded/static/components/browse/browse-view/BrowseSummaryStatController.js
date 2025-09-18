import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import * as _ from 'underscore';

import url from 'url';
import {
    ajax,
    layout,
    valueTransforms,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

import { BrowseLinkIcon } from './BrowseLinkIcon';
import { ChartDataController } from '../../viz/chart-data-controller';
import { navigate } from '../../util/navigate';

export const BrowseSummaryStatsViewer = React.memo((props) => {
    const {
        href,
        session,
        windowWidth,
        useCompactFor = ['xs', 'sm', 'md'],
        autoSync = false,
        mapping = 'donor',
    } = props;
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [data, setData] = useState(null);

    // only re-fetch data when href changes if autoSync is true
    useEffect(
        () => {
            if (!loading) setLoading(true);
            if (error) setError(false);

            const callbackFxn = (resp) => {
                setLoading(false);
                setError(false);
                const data = {
                    files: resp.total.files,
                    donors: resp.total.donors,
                    tissues: resp.total.tissues,
                    assays: resp.total.assays,
                    file_size: resp.total.file_size,
                };
                setData(data);
            };

            const fallbackFxn = (resp) => {
                setLoading(false);
                setError(true);
            };

            const searchUrl = autoSync
                ? href
                : navigate.getBrowseBaseHref(null, mapping);

            const hrefParts = url.parse(searchUrl, true);
            let hrefQuery = _.clone(hrefParts.query);
            // donor
            if (
                hrefQuery.type === 'Donor' ||
                (hrefQuery.type?.length > 0 && hrefQuery.type[0] === 'Donor')
            ) {
                ChartDataController.transformFilterDonorToFile(
                    hrefQuery,
                    mapping
                );
            }
            // protected donor - TODO: merge donor and protected_donor handling?
            if (
                hrefQuery.type === 'ProtectedDonor' ||
                (hrefQuery.type?.length > 0 &&
                    hrefQuery.type[0] === 'ProtectedDonor')
            ) {
                ChartDataController.transformFilterDonorToFile(
                    hrefQuery,
                    mapping
                );
            }
            delete hrefQuery.limit;
            delete hrefQuery.field;

            const requestBody = {
                search_query_params: hrefQuery,
                fields_to_aggregate_for: ['sample_summary.tissues'],
            };

            ajax.load(
                '/bar_plot_aggregations/',
                callbackFxn,
                'POST',
                fallbackFxn,
                JSON.stringify(requestBody),
                {},
                null
            );
        },
        autoSync ? [href, session] : [session]
    );

    const statsProps = { session, loading, error, data };
    let containerCls = null;

    const responsiveGridState = layout.responsiveGridState(windowWidth);
    if (useCompactFor.indexOf(responsiveGridState) !== -1) {
        statsProps['containerCls'] = 'ms-15 pt-1 d-flex align-items-center';
        containerCls =
            'browse-summary stats-compact d-flex flex-column mt-2 mb-25 flex-wrap';
    } else {
        statsProps['containerCls'] =
            ['lg', 'xl', 'xxl'].indexOf(responsiveGridState) !== -1
                ? 'ms-2'
                : 'ms-1';
        containerCls = 'browse-summary d-flex flex-row mt-2 mb-3 flex-wrap';
    }
    return (
        <div>
            <div className={containerCls}>
                <BrowseSummaryStatController type="File" {...statsProps} />
                <BrowseSummaryStatController type="Donor" {...statsProps} />
                <BrowseSummaryStatController type="Tissue" {...statsProps} />
                <BrowseSummaryStatController type="Assay" {...statsProps} />
                <hr />
                <BrowseSummaryStatController type="File Size" {...statsProps} />
            </div>
        </div>
    );
});
BrowseSummaryStatsViewer.propTypes = {
    href: PropTypes.string.isRequired,
    session: PropTypes.object.isRequired,
    windowWidth: PropTypes.number.isRequired,
    useCompactFor: PropTypes.arrayOf(
        PropTypes.oneOf(['xs', 'sm', 'md', 'lg', 'xl', 'xxl'])
    ),
    // If true, will re-fetch data when href changes. If false, only fetches on session change.
    autoSync: PropTypes.bool,
};

export const BrowseSummaryStatController = (props) => {
    const { type, containerCls = 'ms-2', loading, error, data } = props;

    const [value, setValue] = useState('');
    const [units, setUnits] = useState('');

    useEffect(() => {
        if (loading || !data) {
            return;
        }
        if (error) {
            setValue('-');
            setUnits('');
            return;
        }

        if (type === 'File Size') {
            setValue(
                valueTransforms.bytesToLargerUnit(
                    data.file_size,
                    0,
                    false,
                    true
                )
            );
            setUnits(
                valueTransforms.bytesToLargerUnit(
                    data.file_size,
                    0,
                    true,
                    false
                )
            );
        } else if (type === 'File') {
            setValue(data.files);
        } else if (type === 'Tissue') {
            setValue(data.tissues);
        } else if (type === 'Donor') {
            setValue(data.donors);
        } else if (type === 'Assay') {
            setValue(data.assays);
        }
    }, [data, type, error, loading]);

    return (
        <BrowseSummaryStat {...{ value, type, loading, units, containerCls }} />
    );
};
BrowseSummaryStatController.propTypes = {
    type: PropTypes.oneOf(['File', 'Donor', 'Tissue', 'Assay', 'File Size'])
        .isRequired,
    containerCls: PropTypes.string,
    href: PropTypes.string.isRequired,
    session: PropTypes.object.isRequired,
    data: PropTypes.shape({
        files: PropTypes.number,
        donors: PropTypes.number,
        tissues: PropTypes.number,
        assays: PropTypes.number,
        file_size: PropTypes.number,
    }).isRequired,
    loading: PropTypes.bool.isRequired,
    error: PropTypes.bool.isRequired,
};

const BrowseSummaryStat = React.memo(function BrowseSummaryStat(props) {
    const { type, value, loading, units, containerCls = 'ms-2' } = props;

    let subtitle;
    switch (type) {
        case 'File':
            subtitle = 'Files Generated';
            break;
        case 'Donor':
            subtitle = 'Donors';
            break;
        case 'Tissue':
            subtitle = 'Tissues';
            break;
        case 'Assay':
            subtitle = 'Assays';
            break;
        case 'File Size':
            subtitle = 'Total File Size';
            break;
        default:
            throw new Error('Must provide a valid type.');
    }

    return (
        <div className="browse-summary-stat d-flex flex-row">
            <BrowseLinkIcon
                {...{ type }}
                cls="mt-04 browse-summary-stat-icon-smaller"
            />
            <div className={containerCls}>
                {loading && (
                    <div className="browse-summary-stat-value">
                        {' '}
                        <i className="icon icon-circle-notch icon-spin fas" />
                    </div>
                )}
                {!loading && (
                    <>
                        <div className="browse-summary-stat-value">
                            {!value && value !== 0 ? '-' : value}
                            {units && <span>&nbsp;{units}</span>}
                        </div>
                    </>
                )}
                <div className="browse-summary-stat-subtitle">{subtitle}</div>
            </div>
        </div>
    );
});
