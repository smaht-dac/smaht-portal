import React, { useContext } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';

import {
    Accordion,
    AccordionContext,
    useAccordionToggle,
    Tab,
    Tabs,
} from 'react-bootstrap';
import { EmbeddedItemSearchTable } from '../../item-pages/components/EmbeddedItemSearchTable';

export const BenchmarkingUI = (props) => {
    const { children, href } = props;

    console.log('benchmarkingUI href', href);

    // pass schemas and session to each child
    return (
        <div className="row">
            <div className="d-none d-lg-flex col-lg-2 border-right">
                <BenchmarkingUINav {...{ href }} />
            </div>
            <div className="col-12 col-lg-10 pl-2">{children}</div>
        </div>
    );
};

const BenchmarkingUINav = (props) => {
    const { href } = props;

    return (
        <div className="w-100 benchmarking-nav">
            <div>
                <span className="text-small text-600">Cell Line Data</span>
                <div>
                    <BenchmarkingUINavCellLines {...{ href }} />
                </div>
            </div>
            <hr />
            <div>
                <span className="text-small text-600">Primary Tissue Data</span>
                <div>
                    <BenchmarkingUINavPrimaryTissue {...{ href }} />
                </div>
            </div>
        </div>
    );
};

export const COLO829Data = ({ schemas, session, facets, href }) => {
    return (
        <div>
            <h2>COLO829 Cell Line Data</h2>
            <p className="readable mb-5">
                For benchmarking analysis, COLO829 (melanoma) is mixed with
                COLO829BL (lymphoblast), derived from the same individual, at
                known mixture ratios of 1:10, 1:50, and 1:200.
            </p>
            <Tabs defaultActiveKey="COLO829" id="uncontrolled-tab-example">
                <Tab eventKey="COLO829" title="COLO829">
                    <div className="mt-1">
                        <EmbeddedItemSearchTable
                            searchHref="/search/?type=Item"
                            rowHeight={40}
                            {...{
                                schemas,
                                session,
                                facets,
                            }}
                        />
                    </div>
                </Tab>
                <Tab eventKey="COLO829BL" title="COLO829BL">
                    Two tab
                </Tab>
                <Tab eventKey="Mix 1:10" title="Mix 1:10">
                    Three tab
                </Tab>
                <Tab eventKey="Mix 1:50" title="Mix 1:50">
                    Four tab
                </Tab>
                <Tab eventKey="Mix 1:200" title="Mix 1:200">
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
        ? 'icon icon-angle-up fas'
        : 'icon icon-angle-down fas';

    return (
        <div className="d-flex justify-content-between align-items-center">
            <button
                type="button"
                className="border-0 bg-transparent m-0 p-0"
                onClick={decoratedOnClick}>
                <div>
                    {children}
                    <i className={openStatusIconCls + ' mr-1'} />
                </div>
            </button>
        </div>
    );
}

const BenchmarkingUINavCellLines = (props) => {
    const { href } = props;
    return (
        <BenchmarkingUINavWrapper defaultActiveKey={'1'}>
            <BenchmarkingUINavDrop
                eventKey="1"
                pageHref={href}
                href="/data/benchmarking/COLO829"
                title="COLO829">
                <ul>
                    <BenchmarkingUINavLink
                        title="COLO829"
                        pageHref={href}
                        href="/data/benchmarking/COLO829#main"
                    />
                    <BenchmarkingUINavLink
                        title="COLO829BL"
                        pageHref={href}
                        href="/data/benchmarking/COLO829#BL"
                    />
                    <BenchmarkingUINavLink
                        title="1:10"
                        pageHref={href}
                        href="/data/benchmarking/COLO829#110"
                    />
                    <BenchmarkingUINavLink
                        title="1:50"
                        pageHref={href}
                        href="/data/benchmarking/COLO829#150"
                    />
                    <BenchmarkingUINavLink
                        title="1:200"
                        pageHref={href}
                        href="/data/benchmarking/COLO829#1200"
                    />
                </ul>
            </BenchmarkingUINavDrop>
            <BenchmarkingUINavLink
                title="HapMap"
                pageHref={href}
                href="/data/benchmarking/HapMap"
            />
            <BenchmarkingUINavLink
                title="iPSc & Fibroblasts"
                pageHref={href}
                href="/data/benchmarking/iPSC-fibroblasts"
            />
        </BenchmarkingUINavWrapper>
    );
};

const BenchmarkingUINavPrimaryTissue = (props) => {
    const { href } = props;
    return (
        <BenchmarkingUINavWrapper defaultActiveKey={'0'}>
            <BenchmarkingUINavDrop
                eventKey="1"
                pageHref={href}
                href="/data/benchmarking/brain"
                title="Brain">
                <ul>
                    <BenchmarkingUINavLink
                        title="Frontal Lobe"
                        pageHref={href}
                        href="/data/benchmarking/brain#frontal-lobe"
                    />
                    <BenchmarkingUINavLink
                        title="Cerebellum"
                        pageHref={href}
                        href="/data/benchmarking/brain#cerebellum"
                    />
                    <BenchmarkingUINavLink
                        title="Hippocampus"
                        pageHref={href}
                        href="/data/benchmarking/brain#hippocampus"
                    />
                    <BenchmarkingUINavLink
                        title="Temporal Lobe"
                        pageHref={href}
                        href="/data/benchmarking/brain#temporal-lobe"
                    />
                    <BenchmarkingUINavLink
                        title="Dendate Gyrus"
                        pageHref={href}
                        href="/data/benchmarking/brain#dendate-gyrus"
                    />
                </ul>
            </BenchmarkingUINavDrop>
            <BenchmarkingUINavDrop
                eventKey="2"
                pageHref={href}
                href="/data/benchmarking/skin"
                title="Skin">
                <ul>
                    <BenchmarkingUINavLink
                        title="Sun Exposed"
                        pageHref={href}
                        href="/data/benchmarking/skin#sun-exposed"
                    />
                    <BenchmarkingUINavLink
                        title="Non Sun Exposed"
                        pageHref={href}
                        href="/data/benchmarking/skin#non-sun-exposed"
                    />
                </ul>
            </BenchmarkingUINavDrop>
            <BenchmarkingUINavLink
                title="Liver"
                pageHref={href}
                href="/data/benchmarking/liver"
            />
            <BenchmarkingUINavDrop
                eventKey="3"
                pageHref={href}
                href="/data/benchmarking/colon"
                title="Colon">
                <ul>
                    <BenchmarkingUINavLink
                        title="Ascending"
                        pageHref={href}
                        href="/data/benchmarking/colon#ascending"
                    />
                    <BenchmarkingUINavLink
                        pageHref={href}
                        title="Descending"
                        href="/data/benchmarking/colon#descending"
                    />
                </ul>
            </BenchmarkingUINavDrop>
            <BenchmarkingUINavLink
                pageHref={href}
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
    const { href, pageHref, title } = props;

    const isActive = href === pageHref;
    const activeStyle = 'bg-primary';
    const inactiveStyle = '';

    // console.log("href", href);
    // console.log("pageHref", pageHref);

    return (
        <li>
            <a
                {...{ href }}
                className={`${isActive ? activeStyle : inactiveStyle}`}>
                {title}
            </a>
        </li>
    );
};
