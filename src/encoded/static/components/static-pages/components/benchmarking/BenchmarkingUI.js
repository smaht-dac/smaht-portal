import React, { useState, useCallback, useEffect } from 'react';
import _ from 'underscore';
import { Tab, Tabs } from 'react-bootstrap';

import { memoizedUrlParse } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { Alerts } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts';

import { BenchmarkingTable } from './BenchmarkingTable';
import { navigate } from '../../../util';
import { NotLoggedInAlert } from '../../../navigation/components';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { TableControllerWithSelections } from '../TableControllerWithSelections';

export const BenchmarkingLayout = ({
    schemas,
    title,
    description,
    bamQCHash = '', // TODO: Other datasets will have qcs on same page accessible by anchor hash
    children,
    callout = null,
}) => {
    const [showInformation, setShowInformation] = useState(true);
    const cls = `description readable ${!schemas ? 'mb-5' : ''}`;

    return (
        <div className="benchmarking-layout">
            <div className="page-description row">
                <div className="information-container col-auto col-lg-9 position-relative">
                    <div className="title-container">
                        <h2 className="title">{title}</h2>
                    </div>
                    <div
                        className={
                            'body-container' +
                            (showInformation ? ' expanded' : ' collapsed')
                        }
                        id="benchmarking-page-description-container">
                        <div className={cls}>{description}</div>
                        {callout}
                        <button
                            type="button"
                            onClick={() => setShowInformation(!showInformation)}
                            className="toggle-information-text-button"
                            aria-label="Toggle full description"
                            aria-expanded={showInformation}>
                            <i
                                className={`icon icon-angle-${
                                    showInformation ? 'up' : 'down'
                                } fas`}></i>
                            <span className="toggle-information-text">
                                Show{showInformation ? ' less' : ' more'}
                            </span>
                        </button>
                    </div>
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
            // Extract parameters from the searchHref
            const paramString = searchHref.split('?')[1];
            const urlSearchParams = new URLSearchParams(paramString);

            const arrayKeys = ['status', 'dataset'];

            const obj = {};
            urlSearchParams.forEach((val, key) => {
                // check first for keys that should be in an array
                if (arrayKeys.includes(key) && !obj.hasOwnProperty(key)) {
                    // create a new array
                    obj[key] = [val];
                } else if (arrayKeys.includes(key) && obj.hasOwnProperty(key)) {
                    // add to the array
                    obj[key].push(val);
                } else {
                    // not an array key
                    // just add the key value pair
                    obj[key] = val;
                }
            });

            // Fetch the total number of files for the extracted dataset
            ajax.promise(
                '/search_total',
                'POST',
                {}, // headers
                JSON.stringify(obj)
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
            <span className="badge">
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
    deniedAccessPopoverType,
}) => {
    if (!tabMapArray || !tabMapArray.length) {
        return <div>Coming Soon</div>;
    }

    // By default, use the eventKey passed in; if none, set to the first item in the map
    const defaultActiveKey = defaultActiveKeyProp || tabMapArray[0]?.eventKey;

    // Commons needed by TableControllerWithSelections...
    const commonTableProps = {
        schemas,
        session,
        facets,
        href,
        context,
        deniedAccessPopoverType,
    };

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
            key={session}
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
                            <TableControllerWithSelections
                                {...{ searchHref, tabMap }}
                                {...commonTableProps}>
                                <BenchmarkingTable
                                    deniedAccessPopoverType={
                                        deniedAccessPopoverType
                                    }
                                />
                            </TableControllerWithSelections>
                        </div>
                    </Tab>
                );
            })}
        </Tabs>
    );
};
