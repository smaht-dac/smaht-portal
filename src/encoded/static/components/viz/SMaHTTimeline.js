import React, { useState, useContext } from 'react';
import {
    Accordion,
    AccordionContext,
    useAccordionToggle,
} from 'react-bootstrap';
import Card from 'react-bootstrap/esm/Card';

export default function SMaHTTimeline({ currentTier, setCurrentTier }) {
    return (
        <div className="container">
            <div id="timeline">
                <div className="timeline-item">
                    <div className="timeline-marker">Tier 0</div>
                    <div>
                        <h3 className="ml-6 text-left">Benchmarking</h3>
                    </div>
                    <div className="timeline-content">
                        <TimelineAccordion defaultActiveKey={1}>
                            <TimelineAccordionDrawer
                                eventKey={1}
                                title="COLO829 Cancer Cell Lines"
                                setCurrentTier={setCurrentTier}
                                values={[
                                    { number: 2, units: 'Cell Lines' },
                                    { number: 24, units: 'Files Generated' },
                                    { number: 12, units: 'Assay Types' },
                                ]}
                            />
                            <TimelineAccordionDrawer
                                eventKey={2}
                                title="HapMap Cell Lines"
                                setCurrentTier={setCurrentTier}
                                values={[
                                    { number: 0, units: 'Cell Lines' },
                                    { number: 0, units: 'Files Generated' },
                                    { number: 0, units: 'Assay Types' },
                                ]}
                            />
                            <TimelineAccordionDrawer
                                eventKey={3}
                                title="iPSC & Fibroblasts"
                                setCurrentTier={setCurrentTier}
                                values={[
                                    { number: 0, units: 'Cell Lines' },
                                    { number: 0, units: 'Files Generated' },
                                    { number: 0, units: 'Assay Types' },
                                ]}
                            />
                            <TimelineAccordionDrawer
                                eventKey={4}
                                title="Tissue Benchmarking"
                                setCurrentTier={() =>
                                    setCurrentTier('benchmarking')
                                }
                                values={[
                                    { number: 0, units: 'Cell Lines' },
                                    { number: 0, units: 'Files Generated' },
                                    { number: 0, units: 'Assay Types' },
                                ]}
                            />
                        </TimelineAccordion>
                    </div>
                </div>

                <div className="timeline-item">
                    <div className="timeline-marker">Tier 1</div>
                    <div>
                        <h3 className="ml-6 text-left">Expansion</h3>
                    </div>
                    <div className="timeline-content">
                        <TimelineAccordion defaultActiveKey={0}>
                            <TimelineAccordionDrawer
                                eventKey={1}
                                title="Tissue"
                                setCurrentTier={() =>
                                    setCurrentTier('expansion')
                                }
                                values={[
                                    { number: 0, units: 'Cell Lines' },
                                    { number: 0, units: 'Files Generated' },
                                    { number: 0, units: 'Assay Types' },
                                ]}
                            />
                        </TimelineAccordion>
                    </div>
                </div>

                <div className="timeline-item">
                    <div className="timeline-marker">Tier 2</div>
                    <div>
                        <h3 className="ml-6 text-left">Production</h3>
                    </div>
                    <div className="timeline-content">
                        <TimelineAccordion defaultActiveKey={0}>
                            <TimelineAccordionDrawer
                                eventKey={1}
                                title="Tissue"
                                setCurrentTier={() =>
                                    setCurrentTier('production')
                                }
                                values={[
                                    { number: 0, units: 'Cell Lines' },
                                    { number: 0, units: 'Files Generated' },
                                    { number: 0, units: 'Assay Types' },
                                ]}
                            />
                        </TimelineAccordion>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ContextAwareToggle({ children, eventKey, callback, setCurrentTier }) {
    const currentEventKey = useContext(AccordionContext);

    const decoratedOnClick = useAccordionToggle(
        eventKey,
        () => callback && callback(eventKey)
    );

    const isCurrentEventKey = currentEventKey === eventKey;

    const openStatusIconCls = isCurrentEventKey
        ? 'icon icon-minus fas'
        : 'icon icon-plus fas';

    return (
        <div className="card-header-content">
            <button
                type="button"
                className="card-header-button border-0 bg-transparent"
                onClick={() => {
                    decoratedOnClick();
                    setCurrentTier('benchmarking');
                }}>
                <div className="d-flex justify-start">
                    <i className={openStatusIconCls + ' m-auto mr-1'} />
                    {children}
                </div>
            </button>
            <a className="card-header-link">
                <i className="icon icon-arrow-right fas" />
            </a>
        </div>
    );
}

function TimelineAccordion(props) {
    const { defaultActiveKey, children } = props;

    return <Accordion {...{ defaultActiveKey }}>{children}</Accordion>;
}

function TimelineAccordionDrawer(props) {
    const {
        eventKey,
        title = 'Click me!',
        values = [],
        setCurrentTier,
    } = props;
    return (
        <Card>
            <Card.Header>
                <ContextAwareToggle {...{ eventKey, setCurrentTier }}>
                    <span className="text-left">{title}</span>
                </ContextAwareToggle>
            </Card.Header>
            <Accordion.Collapse {...{ eventKey }}>
                <Card.Body>
                    <TimelineCardContent values={values} />
                </Card.Body>
            </Accordion.Collapse>
        </Card>
    );
}

const TimelineCardContent = ({ values }) => {
    return (
        <>
            {values.map(({ number, units }, i) => {
                return (
                    <a className="number-group" key={i}>
                        <h4>{number}</h4>
                        <span>{units}</span>
                    </a>
                );
            })}
        </>
    );
};
