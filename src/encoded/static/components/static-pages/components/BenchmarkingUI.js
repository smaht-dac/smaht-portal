import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import { Tab, Tabs } from 'react-bootstrap';
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
        <div className="w-100">
            <div>
                <span className="text-small text-600">Cell Line Data</span>
                <div>
                    <ul>
                        <li>
                            <a href="/data/benchmarking/COLO829">COLO829</a>
                            <ul>
                                <li>1:10</li>
                                <li>1:50</li>
                                <li>1:200</li>
                            </ul>
                        </li>
                        <li>
                            <a href="/data/benchmarking/HapMap">HapMap</a>
                        </li>
                        <li>
                            <a href="/data/benchmarking/iPSC-fibroblasts">
                                iPSc & Fibroblasts
                            </a>
                        </li>
                    </ul>
                </div>
            </div>
            <hr />
            <div>
                <span className="text-small text-600">Primary Tissue Data</span>
                <div>
                    <ul>
                        <li>
                            <a href="/data/benchmarking/brain">Brain</a>
                        </li>
                        <li>
                            <a href="/data/benchmarking/lung">Lung</a>
                        </li>
                        <li>
                            <a href="/data/benchmarking/heart">Heart</a>
                        </li>
                        <li>
                            <a href="/data/benchmarking/colon">Colon</a>
                        </li>
                        <li>
                            <a href="/data/benchmarking/skin">Skin</a>
                        </li>
                    </ul>
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
