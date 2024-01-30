import React, { useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import { Tab, Tabs } from 'react-bootstrap';

import { memoizedUrlParse } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { BenchmarkingTableController } from './BenchmarkingTable';
import { navigate } from '../../../util';

export const BenchmarkingLayout = ({
    schemas,
    title,
    description,
    children,
}) => {
    const cls = `readable ${!schemas ? 'mb-5' : 'mb-2'}`;

    return (
        <div className="benchmarking-layout">
            <div className="row">
                <div className="col-auto">
                    <h2>{title}</h2>
                    <p className={cls}>{description}</p>
                    {description ? (
                        <p className="readable disclaimer mb-2">
                            <span className="">Note:</span> The unaligned BAM
                            and FASTQ files, and data from unofficial
                            benchmarking samples will be available upon request
                            &#40;through Globus&#41; or at the next release of
                            the portal.
                        </p>
                    ) : null}
                </div>
                {/* TODO: Re-add this once we have this documentation available
                <div className="col-md-4 col-12">
                    <a
                        className="btn btn-outline-secondary float-right"
                        href="#">
                        Benchmarking Assay Documentation
                    </a>
                </div> */}
            </div>
            {/* Schemas are loading, so hash won't be available yet; can't pick correct tab */}
            {!schemas && (
                <div className="w-100 d-flex bg-light py-5">
                    <i className="icon fas icon-spin icon-circle-notch icon-lg m-auto" />
                </div>
            )}
            {/* Display tabs (and initialize with proper hash) */}
            {schemas && children}
        </div>
    );
};

export const HashBasedTabController = ({
    schemas,
    session,
    facets,
    href,
    context,
    tabMapArray, // An array of objects containing { eventKey: <hash value of tab>, title: <title of tab>, searchHref: <searchHref for tab>}
    controllerId,
    defaultActiveKeyProp = null,
}) => {
    if (!tabMapArray || !tabMapArray.length) {
        return <div>Coming Soon</div>;
    }

    // By default, use the eventKey passed in; if none, set to the first item in the map
    const defaultActiveKey = defaultActiveKeyProp || tabMapArray[0]?.eventKey;

    // Commons needed by BenchmarkingTableController...
    const commonTableProps = { schemas, session, facets, href, context };

    // Grab the hash for use in setting the current active tab
    const urlParts = memoizedUrlParse(href);
    const { hash, path } = urlParts || {};

    // Create a method for switching between tabs
    const selectNewTab = useCallback(
        (tabKey) => {
            // Programmatically update hash
            navigate(path + tabKey, {
                skipRequest: true,
                inPlace: true,
                skipUpdateHref: false,
            });
        },
        [path]
    );

    // TODO: In future, handle case for hashes that are incorrect/not assigned to a tab

    return (
        <Tabs
            {...{ defaultActiveKey }}
            id={controllerId}
            activeKey={hash || defaultActiveKey}
            onSelect={selectNewTab}>
            {tabMapArray.map((tabMap) => {
                const { eventKey, title, searchHref } = tabMap;
                return (
                    <Tab key={eventKey} {...{ title, eventKey }}>
                        <div className="mt-1">
                            <BenchmarkingTableController
                                {...{ searchHref }}
                                {...commonTableProps}
                            />
                        </div>
                    </Tab>
                );
            })}
        </Tabs>
    );
};
