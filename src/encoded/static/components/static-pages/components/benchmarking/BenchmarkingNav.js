import React, { useState, useContext } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import {
    Accordion,
    AccordionContext,
    useAccordionButton,
} from 'react-bootstrap';

import { memoizedUrlParse } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

import {
    BenchmarkingDataMap,
    BenchmarkingDataKeys,
} from './BenchmarkingDataMap';

export const BenchmarkingUINav = (props) => {
    const { href = '' } = props;

    const urlParts = memoizedUrlParse(href);
    const { path = '', hash = '' } = urlParts || {};

    const currPath = `${path || ''}${hash || ''}`;

    let isCellLinePage = false;
    let isPrimaryTissuePage = false;
    let currPageIndex = null;

    // Create arrays by type
    const cellLinePages = BenchmarkingDataKeys.filter((key, i) => {
        const isCellLine = BenchmarkingDataMap[key].type === 'Cell Line Data';
        if (
            currPath.startsWith(BenchmarkingDataMap[key]['path']) &&
            isCellLine
        ) {
            isCellLinePage = true;
        }
        return isCellLine;
    });
    const primaryTissuePages = BenchmarkingDataKeys.filter((key, i) => {
        const isPrimaryTissue =
            BenchmarkingDataMap[key].type === 'Primary Tissue Data';
        if (
            currPath.startsWith(BenchmarkingDataMap[key]['path']) &&
            isPrimaryTissue
        ) {
            isPrimaryTissuePage = true;
        }
        return isPrimaryTissue;
    });

    // Grab index of current item
    cellLinePages.forEach((key, i) => {
        if (currPath.startsWith(BenchmarkingDataMap[key]['path'])) {
            currPageIndex = i.toString();
        }
    });
    primaryTissuePages.forEach((key, i) => {
        if (currPath.startsWith(BenchmarkingDataMap[key]['path'])) {
            currPageIndex = i.toString();
        }
    });

    return (
        <>
            <div className="benchmarking-nav-section">
                <div className="benchmarking-nav-section-title text-small text-600">
                    Cell Line Data
                </div>
                <div>
                    <BenchmarkingUINavLinkGenerator
                        {...{ currPath }}
                        pages={cellLinePages}
                        defaultActiveKey={
                            (isCellLinePage && currPageIndex) || null
                        }
                    />
                </div>
            </div>
            <hr />
            <div className="benchmarking-nav-section">
                <div className="benchmarking-nav-section-title text-small text-600">
                    Benchmarking Tissue Data
                </div>
                <div>
                    <BenchmarkingUINavLinkGenerator
                        {...{ currPath }}
                        pages={primaryTissuePages}
                        defaultActiveKey={
                            (isPrimaryTissuePage && currPageIndex) || null
                        }
                    />
                </div>
            </div>
        </>
    );
};

// TODO: See if this can be consolidated with the one on the homepage
function ContextAwareToggle({ children, eventKey, callback }) {
    const { activeEventKey } = useContext(AccordionContext);

    const decoratedOnClick = useAccordionButton(eventKey, (e) => {
        e.preventDefault();
        return callback && callback(eventKey);
    });

    const isCurrentEventKey = activeEventKey === eventKey;

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
                    <i className={openStatusIconCls + ' me-1'} />
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
                            {...{ currPath, path }}
                            title={navBarTitle}>
                            <ul>
                                {tabMapArray.map((obj) => (
                                    <BenchmarkingUINavLink
                                        key={obj.eventKey}
                                        title={obj.title}
                                        cls="ps-2"
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
                            {...{ currPath, path }}
                            isTop
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
    const { path, currPath, title, eventKey, children } = props;

    const isActive = currPath.includes(path);
    return (
        <li>
            <ContextAwareToggle {...{ eventKey }}>
                <span className={`navlink-drop ${isActive ? 'active' : ''}`}>
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
    const { href, currPath: pageHref, title, isTop, cls = '' } = props;
    const isActive = href === pageHref;

    return (
        <li
            className={`sidenav-link ${isActive ? 'active' : ''} ${
                isTop ? 'top' : ''
            } ${cls}`}>
            <a className="link-underline-hover" {...{ href }}>
                {title}
            </a>
        </li>
    );
};
