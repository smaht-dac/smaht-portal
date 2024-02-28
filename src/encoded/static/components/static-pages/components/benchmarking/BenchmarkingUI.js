import React, { useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import { Tab, Tabs } from 'react-bootstrap';

import { memoizedUrlParse } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { Alerts } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts';

import { BenchmarkingTableController } from './BenchmarkingTable';
import { navigate } from '../../../util';
import { NotLoggedInAlert } from '../../../navigation/components';

export const BenchmarkingLayout = ({
    schemas,
    title,
    description,
    showBamQCLink = false,
    bamQCHash = '', // TODO: Other datasets will have qcs on same page accessible by anchor hash
    children,
}) => {
    const cls = `readable ${!schemas ? 'mb-5' : 'mb-2'}`;

    return (
        <div className="benchmarking-layout">
            <div className="row">
                <div className="col-auto col-lg-9">
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
                {/* TODO: Re-add documentation button once we have it available */}
                <div className="col-auto mb-2 mb-lg-0 col-lg-3">
                    {showBamQCLink && (
                        <a
                            className="btn btn-outline-secondary btn-sm float-right"
                            href={'/bam-qc-overview' + bamQCHash}
                            rel="noreferrer noopener"
                            target="_blank">
                            BAM QC Results
                        </a>
                    )}
                </div>
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

    // If user logs in or logs out without refreshing, ensure they get the not logged in alert
    useEffect(() => {
        if (!session) {
            Alerts.queue(NotLoggedInAlert);
        }
    }, [session]);

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
