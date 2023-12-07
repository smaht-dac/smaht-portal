import React, { useContext, useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import {
    Accordion,
    AccordionContext,
    useAccordionToggle,
    Tab,
    Tabs,
} from 'react-bootstrap';

import { memoizedUrlParse } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { BenchmarkingTableController } from './BenchmarkingTable';
import { navigate } from '../../../util';
import {
    BenchmarkingDataMap,
    BenchmarkingDataKeys,
} from './BenchmarkingDataMap';

export const BenchmarkingLayout = ({
    schemas,
    title,
    description,
    children,
}) => {
    const cls = `readable ${!schemas ? 'mb-5' : 'mb-2'}`;

    return (
        <div>
            <h2>{title}</h2>
            <p className={cls}>{description}</p>
            {/* Schemas are loading, so hash won't be available yet; can't pick correct tab */}
            {!schemas && (
                <div className="readable d-flex bg-light py-5">
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
    if (!tabMapArray.length) {
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

    // On first mount, if hash is blank, redirect to main
    useEffect(() => {
        // Double checking schemas are loaded, just incase
        if (schemas && !hash) {
            navigate(path + '#main', {
                skipRequest: true,
                skipUpdateHref: false,
            });
        }
    }, [schemas]);

    return (
        <Tabs
            {...{ defaultActiveKey }}
            id={controllerId}
            activeKey={hash}
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

export const BenchmarkingUINav = (props) => {
    const { href = '' } = props;

    const urlParts = memoizedUrlParse(href);
    const { path = '', hash = '' } = urlParts || {};

    const currPath = `${path}${hash}`;

    const cellLinePages = BenchmarkingDataKeys.filter(
        (key) => BenchmarkingDataMap[key].type === 'Cell Line Data'
    );
    const primaryTissuePages = BenchmarkingDataKeys.filter(
        (key) => BenchmarkingDataMap[key].type === 'Primary Tissue Data'
    );

    return (
        <div className="w-100 benchmarking-nav">
            <div>
                <span className="text-small text-600">Cell Line Data</span>
                <div>
                    <BenchmarkingUINavLinkGenerator
                        {...{ currPath }}
                        pages={cellLinePages}
                        defaultActiveKey={'0'}
                    />
                </div>
            </div>
            <hr />
            <div>
                <span className="text-small text-600">Primary Tissue Data</span>
                <div>
                    <BenchmarkingUINavLinkGenerator
                        {...{ currPath }}
                        pages={primaryTissuePages}
                    />
                </div>
            </div>
        </div>
    );
};

// TODO: See if this can be consolidated with the one on the homepage
function ContextAwareToggle({ children, eventKey, callback }) {
    const currentEventKey = useContext(AccordionContext);

    const decoratedOnClick = useAccordionToggle(eventKey, (e) => {
        e.preventDefault();
        return callback && callback(eventKey);
    });

    const isCurrentEventKey = currentEventKey === eventKey;

    const openStatusIconCls = isCurrentEventKey
        ? 'icon icon-angle-up fas text-secondary'
        : 'icon icon-angle-down fas text-secondary';

    return (
        <div className="d-flex justify-content-between align-items-center">
            <button
                type="button"
                className="border-0 bg-transparent m-0 p-0 w-100"
                onClick={decoratedOnClick}>
                <div className="d-flex justify-content-between align-items-center w-100">
                    {children}
                    <i className={openStatusIconCls + ' mr-1'} />
                </div>
            </button>
        </div>
    );
}

/**
 * Generates Nav Links for a group of Pages
 */
const BenchmarkingUINavLinkGenerator = ({
    currPath, // A string with the current page's path; used for determining active link
    pages, // An array of strings corresponding to top-level keys in BenchmarkingDataMap
    defaultActiveKey, // Passed directly into react-bootstrap accordion for the section
}) => {
    return (
        <BenchmarkingUINavWrapper {...{ defaultActiveKey }}>
            {pages.map((page, i) => {
                const {
                    navBarTitle,
                    path,
                    tabMapArray = [],
                } = BenchmarkingDataMap[page] || {};
                if (tabMapArray.length > 1) {
                    // Render nav drop and map for each child link
                    return (
                        <BenchmarkingUINavDrop
                            key={page}
                            eventKey={i.toString()}
                            {...{ currPath }}
                            title={navBarTitle}>
                            <ul>
                                {tabMapArray.map((obj) => (
                                    <BenchmarkingUINavLink
                                        key={obj.eventKey}
                                        title={obj.title}
                                        cls="pl-2"
                                        {...{ currPath }}
                                        href={path + obj.eventKey}
                                    />
                                ))}
                            </ul>
                        </BenchmarkingUINavDrop>
                    );
                } else {
                    // Just render a single non-dropdown link
                    return (
                        <BenchmarkingUINavLink
                            key={page}
                            title={navBarTitle}
                            {...{ currPath }}
                            href={`${path}${
                                tabMapArray[0] ? tabMapArray[0].eventKey : ''
                            }`}
                        />
                    );
                }
            })}
        </BenchmarkingUINavWrapper>
    );
};

const BenchmarkingUINavWrapper = (props) => {
    const { defaultActiveKey, children } = props;

    return (
        <Accordion {...{ defaultActiveKey }}>
            <ul>{children}</ul>
        </Accordion>
    );
};

const BenchmarkingUINavDrop = (props) => {
    const { href, title, eventKey, children } = props;
    return (
        <li>
            <ContextAwareToggle {...{ eventKey }}>
                <span className="navlink-drop" {...{ href }}>
                    {title}
                </span>
            </ContextAwareToggle>
            <Accordion.Collapse {...{ eventKey }}>
                {children}
            </Accordion.Collapse>
        </li>
    );
};

const BenchmarkingUINavLink = (props) => {
    const { href, currPath: pageHref, title, cls } = props;

    const isActive = href === pageHref;
    const activeStyle = 'navlink-active';
    const inactiveStyle = '';

    return (
        <li className={`${isActive ? activeStyle : inactiveStyle}`}>
            <a {...{ href }}>{title}</a>
        </li>
    );
};
