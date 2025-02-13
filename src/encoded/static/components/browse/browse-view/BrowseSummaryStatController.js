import React, { useState, useCallback, useEffect } from 'react';

import {
    ajax,
    valueTransforms,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

import { BrowseLinkIcon } from './BrowseLinkIcon';

export const BrowseSummaryStatController = (props) => {
    const { type, additionalSearchQueries = '' } = props;

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
                if (
                    facet.field ===
                    'file_sets.libraries.analytes.samples.sample_sources.uberon_id'
                ) {
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
        console.log('BrowseSummaryStatController error', resp);
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

    return <BrowseSummaryStat {...{ value, type, loading, units }} />;
};

const BrowseSummaryStat = React.memo(function BrowseSummaryStat(props) {
    const { type, value, loading, units } = props;

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
            <div className="ms-2">
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
