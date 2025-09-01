import React, { useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';

import {
    ajax,
    layout,
    valueTransforms,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

import { BrowseLinkIcon } from './BrowseLinkIcon';

export const BrowseSummaryStatsViewer = React.memo((props) => {
    const { href, session, windowWidth, useCompactFor = ['sm', 'md'] } = props;

    const responsiveGridState = layout.responsiveGridState(windowWidth);
    const statsProps = { href, session };
    let statsContainerCls = null;
    if (useCompactFor.indexOf(responsiveGridState) !== -1) {
        statsProps['valueContainerCls'] = "ms-15 pt-1 d-flex align-items-center";
        statsContainerCls = "browse-summary stats-compact d-flex flex-column mt-2 mb-25 flex-wrap";
    } else {
        statsProps['valueContainerCls'] = ['lg', 'xl', 'xxl'].indexOf(responsiveGridState) !== -1 ? "ms-2" : "ms-1";
        statsContainerCls = "browse-summary d-flex flex-row mt-2 mb-3 flex-wrap";
    }
    return (
        <div>
            <div className={statsContainerCls}>
                <BrowseSummaryStatController type="File" {...statsProps} />
                <BrowseSummaryStatController type="Donor" {...statsProps} />
                <BrowseSummaryStatController type="Tissue" {...statsProps} />
                <BrowseSummaryStatController type="Assay" {...statsProps} />
                <hr />
                <BrowseSummaryStatController
                    type="File Size"
                    additionalSearchQueries="&additional_facet=file_size"
                    {...statsProps}
                />
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
};

export const BrowseSummaryStatController = (props) => {
    const { type, additionalSearchQueries = '', valueContainerCls =  'ms-2' } = props;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [value, setValue] = useState('');
    const [units, setUnits] = useState('');

    const callbackFxn = useCallback((resp) => {
        const { facets = [], total } = resp;
        if (type === 'File Size') {
            facets.forEach((facet) => {
                if (facet.field === 'file_size') {
                    setValue(
                        valueTransforms.bytesToLargerUnit(
                            facet.sum,
                            0,
                            false,
                            true
                        )
                    );
                    setUnits(
                        valueTransforms.bytesToLargerUnit(
                            facet.sum,
                            0,
                            true,
                            false
                        )
                    );
                }
            });
        } else if (type === 'File') {
            setValue(total);
        } else if (type === 'Tissue') {
            facets.forEach((facet) => {
                if (facet.field === 'sample_summary.tissues') {
                    setValue(facet.terms.length);
                }
            });
        } else if (type === 'Donor') {
            facets.forEach((facet) => {
                if (facet.field === 'donors.display_title') {
                    setValue(facet.terms.length);
                }
            });
        } else if (type === 'Assay') {
            facets.forEach((facet) => {
                if (facet.field === 'file_sets.libraries.assay.display_title') {
                    setValue(facet.terms.length);
                }
            });
        }

        setLoading(false);
        setError(false);
    });

    const fallbackFxn = useCallback((resp) => {
        setLoading(false);
        setError(true);
    });

    const getStatistics = useCallback(() => {
        if (!loading) setLoading(true);
        if (error) setError(false);

        // Use search for query-based metrics
        ajax.load(
            `/search/?type=File&sample_summary.studies=Production&format=json&status=released${additionalSearchQueries}`,
            callbackFxn,
            'GET',
            fallbackFxn
        );
    }, [callbackFxn, fallbackFxn]);

    // On mount, get statistics
    useEffect(() => {
        getStatistics();
    }, []);

    return <BrowseSummaryStat {...{ value, type, loading, units, valueContainerCls }} />;
};
BrowseSummaryStatController.propTypes = {
    type: PropTypes.oneOf(['File', 'Donor', 'Tissue', 'Assay', 'File Size']).isRequired,
    additionalSearchQueries: PropTypes.string,
    valueContainerCls: PropTypes.string,
    href: PropTypes.string.isRequired,
    session: PropTypes.object.isRequired,
};

const BrowseSummaryStat = React.memo(function BrowseSummaryStat(props) {
    const { type, value, loading, units, valueContainerCls = 'ms-2' } = props;

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
            <div className={valueContainerCls}>
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
