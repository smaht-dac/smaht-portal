import React, { useContext, useState } from 'react';
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
import { EmbeddedItemSearchTable } from '../../item-pages/components/EmbeddedItemSearchTable';
import { navigate } from '../../util';

export const BenchmarkingUI = (props) => {
    const { children, href } = props;

    // pass schemas and session to each child
    return (
        <div className="row">
            <div className="d-none d-lg-flex col-lg-2 border-right">
                <BenchmarkingUINav {...{ href }} />
            </div>
            {/* TODO: in future, maybe wrap each child and inject urlparts */}
            <div className="col-12 col-lg-10 pl-2">{children}</div>
        </div>
    );
};

const BenchmarkingUINav = (props) => {
    const { href = "" } = props;

    const urlParts = memoizedUrlParse(href);
    const { path = "", hash = "" } = urlParts || {};

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

export const COLO829Data = ({ schemas, session, facets, href }) => {
    const urlParts = memoizedUrlParse(href);
    const { hash = "#main", path } = urlParts || {};

    const selectNewTab = function (tabKey) {
        // Programmatically update hash
        navigate(path + tabKey, {
            inPlace: true,
            replace: true,
            skipRequest: true,
        });
    };

    return (
        <div>
            <h2>COLO829 Cell Line Data</h2>
            <p className="readable mb-5">
                For benchmarking analysis, COLO829 (melanoma) is mixed with
                COLO829BL (lymphoblast), derived from the same individual, at
                known mixture ratios of 1:10, 1:50, and 1:200.
            </p>
            <Tabs
                defaultActiveKey={hash || '#main'}
                id="controlled-tab-example"
                activeKey={hash}
                onSelect={selectNewTab}>
                <Tab eventKey="#main" title="COLO829T">
                    <div className="mt-1">
                        <EmbeddedItemSearchTable
                            aboveTableComponent={
                                <BenchmarkingAboveTableComponent />
                            }
                            searchHref="/search/?type=Item"
                            rowHeight={40}
                            // maxHeight={200}
                            {...{
                                schemas,
                                session,
                                facets,
                            }}
                        />
                    </div>
                </Tab>
                <Tab eventKey="#BL" title="COLO829BL">
                    Two tab
                </Tab>
                <Tab eventKey="#110" title="Mix 1:10">
                    Three tab
                </Tab>
                <Tab eventKey="#150" title="Mix 1:50">
                    Four tab
                </Tab>
                <Tab eventKey="#1200" title="Mix 1:200">
                    Five tab
                </Tab>
            </Tabs>
        </div>
    );
};

// TODO: See if this can be consolidated with the one on the homepage
function ContextAwareToggle({ children, eventKey, callback }) {
    const currentEventKey = useContext(AccordionContext);

    const decoratedOnClick = useAccordionToggle(
        eventKey,
        () => callback && callback(eventKey)
    );

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
            <BenchmarkingUINavDrop
                eventKey="1"
                {...{ currPath }}
                href="/data/benchmarking/brain"
                title="Brain">
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
            <BenchmarkingUINavDrop
                eventKey="2"
                {...{ currPath }}
                href="/data/benchmarking/skin"
                title="Skin">
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
            <BenchmarkingUINavDrop
                eventKey="3"
                {...{ currPath }}
                href="/data/benchmarking/colon"
                title="Colon">
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
                <a {...{ href }}>{title}</a>
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
    const activeStyle = 'bg-primary';
    const inactiveStyle = '';

    // console.log("href", href);
    // console.log("pageHref", pageHref);

    return (
        <li className={cls}>
            <a
                {...{ href }}
                className={`${isActive ? activeStyle : inactiveStyle}`}>
                {title}
            </a>
        </li>
    );
};

export const BenchmarkingAboveTableComponent = React.memo(
    function BenchmarkingAboveTableComponent(props) {
        const {
            context,
            onFilter,
            schemas,
            isContextLoading = false, // Present only on embedded search views,
            navigate,
            sortBy,
            sortColumns,
            hiddenColumns,
            addHiddenColumn,
            removeHiddenColumn,
            columnDefinitions,
        } = props;
        const { filters: ctxFilters = null, total: totalResultCount = 0 } =
            context || {};

        return (
            <div className="d-flex w-100 mb-05">
                <div className="col-auto ml-0 pl-0">
                    <span className="text-400" id="results-count">
                        {totalResultCount}
                    </span>{' '}
                    Results
                </div>
                <div className="ml-auto col-auto mr-0 pr-0">
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm mr-05 align-items-center">
                        <i className="icon icon-check-square far mr-03" />
                        Select All
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary btn-sm mr-05 align-items-center">
                        <i className="icon icon-download fas mr-03" />
                        Download # Selected Files
                    </button>
                </div>
            </div>
        );
    }
);
