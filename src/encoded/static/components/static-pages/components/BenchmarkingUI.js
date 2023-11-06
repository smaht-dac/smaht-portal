import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import { Tab, Tabs } from 'react-bootstrap';

export const BenchmarkingUI = (props) => {
    const { children } = props;
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
                Cell Line Data
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
                        <li>HapMap</li>
                        <li>iPSc & Fibroblasts</li>
                    </ul>
                </div>
            </div>
            <hr />
            <div>
                Primary Tissue Data
                <div className="text-muted font-italic">Coming soon</div>
            </div>
        </div>
    );
};

export const COLO829Data = () => {
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
                    One tab
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
