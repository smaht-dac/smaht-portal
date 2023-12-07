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

export const BenchmarkingUINav = (props) => {
    const { href = '' } = props;

    const urlParts = memoizedUrlParse(href);
    const { path = '', hash = '' } = urlParts || {};

    const currPath = `${path}${hash}`;

    return (
        <div className="w-100 benchmarking-nav">
            <div>
                <span className="text-small text-600">Cell Line Data</span>
                <div>
                    <BenchmarkingUINavCellLines {...{ currPath }} />
                </div>
            </div>
            <hr />
            <div>
                <span className="text-small text-600">Primary Tissue Data</span>
                <div>
                    <BenchmarkingUINavPrimaryTissue {...{ currPath }} />
                </div>
            </div>
        </div>
    );
};

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

const BenchmarkingUINavCellLines = (props) => {
    const { currPath } = props;

    return (
        <BenchmarkingUINavWrapper defaultActiveKey={'1'}>
            <BenchmarkingUINavDrop
                eventKey="1"
                {...{ currPath }}
                href="/data/benchmarking/COLO829"
                title="COLO829">
                <ul>
                    <BenchmarkingUINavLink
                        title="COLO829T"
                        cls="pl-2"
                        {...{ currPath }}
                        href="/data/benchmarking/COLO829#main"
                    />
                    <BenchmarkingUINavLink
                        title="COLO829BL"
                        cls="pl-2"
                        {...{ currPath }}
                        href="/data/benchmarking/COLO829#BL"
                    />
                    <BenchmarkingUINavLink
                        title="1:10"
                        cls="pl-2"
                        {...{ currPath }}
                        href="/data/benchmarking/COLO829#110"
                    />
                    <BenchmarkingUINavLink
                        title="1:50"
                        cls="pl-2"
                        {...{ currPath }}
                        href="/data/benchmarking/COLO829#150"
                    />
                    <BenchmarkingUINavLink
                        title="1:200"
                        cls="pl-2"
                        {...{ currPath }}
                        href="/data/benchmarking/COLO829#1200"
                    />
                </ul>
            </BenchmarkingUINavDrop>
            <BenchmarkingUINavLink
                title="HapMap"
                {...{ currPath }}
                href="/data/benchmarking/HapMap"
            />
            <BenchmarkingUINavLink
                title="iPSc & Fibroblasts"
                {...{ currPath }}
                href="/data/benchmarking/iPSC-fibroblasts"
            />
        </BenchmarkingUINavWrapper>
    );
};

const BenchmarkingUINavPrimaryTissue = (props) => {
    const { currPath } = props;
    return (
        <BenchmarkingUINavWrapper defaultActiveKey={'0'}>
            <BenchmarkingUINavDrop eventKey="1" {...{ currPath }} title="Brain">
                <ul>
                    <BenchmarkingUINavLink
                        title="Frontal Lobe"
                        cls="pl-2"
                        {...{ currPath }}
                        href="/data/benchmarking/brain#frontal-lobe"
                    />
                    <BenchmarkingUINavLink
                        title="Cerebellum"
                        {...{ currPath }}
                        cls="pl-2"
                        href="/data/benchmarking/brain#cerebellum"
                    />
                    <BenchmarkingUINavLink
                        title="Hippocampus"
                        cls="pl-2"
                        {...{ currPath }}
                        href="/data/benchmarking/brain#hippocampus"
                    />
                    <BenchmarkingUINavLink
                        title="Temporal Lobe"
                        cls="pl-2"
                        {...{ currPath }}
                        href="/data/benchmarking/brain#temporal-lobe"
                    />
                    <BenchmarkingUINavLink
                        title="Dendate Gyrus"
                        cls="pl-2"
                        {...{ currPath }}
                        href="/data/benchmarking/brain#dendate-gyrus"
                    />
                </ul>
            </BenchmarkingUINavDrop>
            <BenchmarkingUINavDrop eventKey="2" {...{ currPath }} title="Skin">
                <ul>
                    <BenchmarkingUINavLink
                        title="Sun Exposed"
                        cls="pl-2"
                        {...{ currPath }}
                        href="/data/benchmarking/skin#sun-exposed"
                    />
                    <BenchmarkingUINavLink
                        title="Non Sun Exposed"
                        cls="pl-2"
                        {...{ currPath }}
                        href="/data/benchmarking/skin#non-sun-exposed"
                    />
                </ul>
            </BenchmarkingUINavDrop>
            <BenchmarkingUINavLink
                title="Liver"
                {...{ currPath }}
                href="/data/benchmarking/liver"
            />
            <BenchmarkingUINavDrop eventKey="3" {...{ currPath }} title="Colon">
                <ul>
                    <BenchmarkingUINavLink
                        title="Ascending"
                        cls="pl-2"
                        {...{ currPath }}
                        href="/data/benchmarking/colon#ascending"
                    />
                    <BenchmarkingUINavLink
                        {...{ currPath }}
                        cls="pl-2"
                        title="Descending"
                        href="/data/benchmarking/colon#descending"
                    />
                </ul>
            </BenchmarkingUINavDrop>
            <BenchmarkingUINavLink
                {...{ currPath }}
                title="Heart"
                href="/data/benchmarking/heart"
            />
        </BenchmarkingUINavWrapper>
    );
};

const BenchmarkingUINavWrapper = (props) => {
    const { defaultActiveKey, children } = props;
    if (!defaultActiveKey) {
        return null;
    }

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

    // console.log("href", href);
    // console.log("pageHref", pageHref);

    return (
        <li className={`${isActive ? activeStyle : inactiveStyle}`}>
            <a {...{ href }}>{title}</a>
        </li>
    );
};
