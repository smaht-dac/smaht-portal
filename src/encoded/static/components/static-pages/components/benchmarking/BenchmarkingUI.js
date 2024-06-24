import React, { useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import { Tab, Tabs } from 'react-bootstrap';

import { memoizedUrlParse } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { Alerts } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts';

import { BenchmarkingTableController } from './BenchmarkingTable';
import { navigate } from '../../../util';
import { NotLoggedInAlert } from '../../../navigation/components';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

export const BenchmarkingLayout = ({
    schemas,
    title,
    description,
    showBamQCLink = false,
    bamQCHash = '', // TODO: Other datasets will have qcs on same page accessible by anchor hash
    children,
    setShowInformation = null,
    callout = null,
    showInformation = true,
}) => {
    const cls = `description readable ${!schemas ? 'mb-5' : ''}`;

    return (
        <div className="benchmarking-layout">
            <div className="page-summary row">
                <div className="information-container col-auto col-lg-9">
                    <div className="title-container">
                        <h2 className="title">{title}</h2>
                        {setShowInformation && (
                            <button
                                className="toggle-information"
                                onClick={() =>
                                    setShowInformation(!showInformation)
                                }>
                                {showInformation ? (
                                    <span>Hide details</span>
                                ) : (
                                    <span>&bull;&bull;&bull;</span>
                                )}
                            </button>
                        )}
                    </div>
                    <div
                        className={
                            'body-container' +
                            (showInformation ? ' expanded' : ' collapsed')
                        }>
                        <div className={cls}>
                            {description}
                            <p className="disclaimer">
                                <span className="">Note:</span> The raw sequence
                                files, i.e. unaligned BAM and FASTQ, and the
                                data from the benchmarking tissue samples that
                                were not distributed by TPC will be available
                                upon request at this time &#40;through
                                Globus&#41;.
                            </p>
                        </div>
                        {callout}
                    </div>
                </div>
                {/* TODO: Re-add documentation button once we have it available */}
                {showBamQCLink && (
                    <div className="col-auto mb-2 mb-lg-0 col-lg-3">
                        <a
                            className="btn btn-outline-secondary btn-sm float-right"
                            href={'/bam-qc-overview' + bamQCHash}
                            rel="noreferrer noopener"
                            target="_blank">
                            BAM QC Results
                        </a>
                    </div>
                )}
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

/**
 * Renders title [props.title] along with a number badge showing total
 * number of files, fetched using the relative search url
 * [props.searchHref] provided, or "-" otherwise.
 * @param {props} props - Props from HashBasedTabController
 * @param {string} props.title - Title text of the tab
 * @param {string} props.searchHref - Search href for dataset
 * associated with the tab
 */
const TabTitle = ({ title, searchHref = '' }) => {
    const [fileCount, setFileCount] = useState(null);

    useEffect(() => {
        if (searchHref) {
            // Extract the dataset parameter from the searchHref
            const paramString = searchHref.split('?')[1];
            const dataset = new URLSearchParams(paramString).get('dataset');

            // Fetch the total number of files for the extracted dataset
            ajax.promise(
                '/search_total',
                'POST',
                {}, // headers
                JSON.stringify({
                    type: 'File',
                    status: ['released', 'restricted', 'public'],
                    dataset: [dataset],
                })
            )
                .then((res) => {
                    if (res.status === 'error') {
                        throw new Error(
                            'Total number of files was not retrieved. ' +
                                res?.description
                        );
                    } else {
                        setFileCount(res?.total ?? null);
                    }
                })
                .catch((e) => console.error(e));
        }
    }, []);

    return (
        <span className="nav-link-title">
            {title}
            <span className="badge badge-secondary">
                {fileCount === null ? '-' : fileCount}
            </span>
        </span>
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
            mountOnEnter={true} // Don't load other tabs until switch to them (faster initial load + easier debugging)
            id={controllerId}
            activeKey={hash || defaultActiveKey}
            onSelect={selectNewTab}>
            {tabMapArray.map((tabMap) => {
                const { eventKey, title, searchHref } = tabMap;
                return (
                    <Tab
                        key={eventKey}
                        {...{
                            title: <TabTitle {...{ title, searchHref }} />,
                            eventKey,
                        }}>
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
