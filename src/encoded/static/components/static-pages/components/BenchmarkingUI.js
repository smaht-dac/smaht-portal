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
    const { children } = props;

    // pass schemas and session to each child
    return (
        <div className="row">
            <div className="d-none d-lg-flex col-lg-2 border-right">
                <BenchmarkingUINav />
            </div>
            <div className="col-12 col-lg-10 pl-2">{children}</div>
        </div>
    );
};

const BenchmarkingUINav = (props) => {
    return (
        <div className="w-100 benchmarking-nav">
            <div>
                <span className="text-small text-600">Cell Line Data</span>
                <div>
                    <BenchmarkingUINavCellLines />
                </div>
            </div>
            <hr />
            <div>
                <span className="text-small text-600">Primary Tissue Data</span>
                <div>
                    <BenchmarkingUINavPrimaryTissue />
                </div>
            </div>
        </div>
    );
};

export const COLO829Data = ({ schemas, session, facets }) => {
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
                className="border-0 bg-transparent"
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
    return (
        <BenchmarkingUINavWrapper defaultActiveKey={'1'}>
            <BenchmarkingUINavDrop
                eventKey="1"
                href="/data/benchmarking/COLO829"
                title="COLO829">
                <ul>
                    <li>
                        <a href="/data/benchmarking/COLO829#main">COLO829</a>
                    </li>
                    <li>
                        <a href="/data/benchmarking/COLO829BL#main">
                            COLO829BL
                        </a>
                    </li>
                    <li>
                        <a href="/data/benchmarking/COLO829#110">1:10</a>
                    </li>
                    <li>
                        <a href="/data/benchmarking/COLO829#150">1:50</a>
                    </li>
                    <li>
                        <a href="/data/benchmarking/COLO829#1200">1:200</a>
                    </li>
                </ul>
            </BenchmarkingUINavDrop>
            <li>
                <a href="/data/benchmarking/HapMap">HapMap</a>
            </li>
            <li>
                <a href="/data/benchmarking/iPSC-fibroblasts">
                    iPSc & Fibroblasts
                </a>
            </li>
        </BenchmarkingUINavWrapper>
    );
};

const BenchmarkingUINavPrimaryTissue = (props) => {
    return (
        <BenchmarkingUINavWrapper defaultActiveKey={'0'}>
            <BenchmarkingUINavDrop
                eventKey="1"
                href="/data/benchmarking/brain"
                title="Brain">
                <ul>
                    <li>
                        <a href="/data/benchmarking/brain#frontal-lobe">
                            Frontal Lobe
                        </a>
                    </li>
                    <li>
                        <a href="/data/benchmarking/brain#cerebellum">
                            Cerebellum
                        </a>
                    </li>
                    <li>
                        <a href="/data/benchmarking/brain#hippocampus">
                            Hippocampus
                        </a>
                    </li>
                    <li>
                        <a href="/data/benchmarking/brain#temporal-lobe">
                            Temporal Lobe
                        </a>
                    </li>
                    <li>
                        <a href="/data/benchmarking/brain#dendate-gyrus">
                            Dendate Gyrus
                        </a>
                    </li>
                </ul>
            </BenchmarkingUINavDrop>
            <BenchmarkingUINavDrop
                eventKey="2"
                href="/data/benchmarking/skin"
                title="Skin">
                <ul>
                    <li>
                        <a href="/data/benchmarking/skin#sun-exposed">
                            Sun Exposed
                        </a>
                    </li>
                    <li>
                        <a href="/data/benchmarking/skin#non-sun-exposed">
                            Non Sun Exposed
                        </a>
                    </li>
                </ul>
            </BenchmarkingUINavDrop>
            <li>
                <a href="/data/benchmarking/liver">Liver</a>
            </li>
            <BenchmarkingUINavDrop
                eventKey="3"
                href="/data/benchmarking/colon"
                title="Colon">
                <ul>
                    <li>
                        <a href="/data/benchmarking/colon#ascending">
                            Ascending
                        </a>
                    </li>
                    <li>
                        <a href="/data/benchmarking/colon#descending">
                            Descending
                        </a>
                    </li>
                </ul>
            </BenchmarkingUINavDrop>
            <li>
                <a href="/data/benchmarking/colon">Heart</a>
            </li>
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
