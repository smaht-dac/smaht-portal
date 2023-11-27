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
            <div id="timeline" className={`${currentTier}`}>
                <span className="latest-release ml-6">
                    <b>Latest Release: </b>September 29, 2023
                </span>
                <div
                    className={
                        'timeline-item ' +
                        (currentTier === 'benchmarking'
                            ? 'tier-active'
                            : 'tier-inactive')
                    }>
                    <div
                        className="timeline-marker"
                        onClick={() => setCurrentTier('benchmarking')}>
                        <span>Tier 0</span>
                    </div>
                    <div className="timeline-item-header">
                        <h3 className="ml-6 text-left">
                            Benchmarking&nbsp;
                            <i className="timeline-item-subheader">
                                <span className="d-none d-sm-inline d-lg-none d-xl-inline">
                                    -
                                </span>{' '}
                                with all technologies
                            </i>
                        </h3>
                    </div>
                    <div className="timeline-content">
                        <TimelineAccordion
                            defaultActiveKey={1}
                            tier="benchmarking"
                            currentTier={currentTier}
                            activeKey={
                                currentTier === 'benchmarking'
                                    ? undefined
                                    : null
                            }>
                            <TimelineAccordionDrawer
                                eventKey={1}
                                title="COLO829 Cell Line"
                                tier="benchmarking"
                                currentTier={currentTier}
                                setCurrentTier={() =>
                                    setCurrentTier('benchmarking')
                                }
                                values={[
                                    { number: '2', units: ['Cell', 'Lines'] },
                                    {
                                        number: '-',
                                        units: ['Assays'],
                                    },
                                    {
                                        number: '578',
                                        units: ['Files', 'Generated'],
                                    },
                                    {
                                        number: '-',
                                        units: ['Mutations'],
                                    },
                                ]}
                            />
                            <TimelineAccordionDrawer
                                eventKey={2}
                                title="HapMap Cell Line"
                                tier="benchmarking"
                                currentTier={currentTier}
                                setCurrentTier={() =>
                                    setCurrentTier('benchmarking')
                                }
                                values={[
                                    { number: '6', units: ['Cell', 'Lines'] },
                                    {
                                        number: '-',
                                        units: ['Files', 'Generated'],
                                    },
                                    {
                                        number: '-',
                                        units: ['Proposed', 'Assay Types'],
                                    },
                                ]}
                            />
                            <TimelineAccordionDrawer
                                eventKey={3}
                                title="iPSC & Fibroblasts"
                                tier="benchmarking"
                                currentTier={currentTier}
                                setCurrentTier={() =>
                                    setCurrentTier('benchmarking')
                                }
                                values={[
                                    { number: '5', units: ['Cell', 'Lines'] },
                                    {
                                        number: '-',
                                        units: ['Files', 'Generated'],
                                    },
                                    {
                                        number: '-',
                                        units: ['Proposed', 'Assay Types'],
                                    },
                                ]}
                            />
                            <TimelineAccordionDrawer
                                eventKey={4}
                                title="Primary Tissues"
                                tier="benchmarking"
                                currentTier={currentTier}
                                setCurrentTier={() =>
                                    setCurrentTier('benchmarking')
                                }
                                values={[
                                    { number: '-', units: ['Donors'] },
                                    {
                                        number: '-',
                                        units: ['Tissue', 'Types'],
                                    },
                                    {
                                        number: '-',
                                        units: ['Files', 'Generated'],
                                    },
                                    {
                                        number: '-',
                                        units: ['Assays'],
                                    },
                                ]}
                            />
                        </TimelineAccordion>
                    </div>
                </div>

                <div
                    className={
                        'timeline-item ' +
                        (currentTier === 'expansion'
                            ? 'tier-active'
                            : 'tier-inactive')
                    }>
                    <div
                        className="timeline-marker"
                        onClick={() => setCurrentTier('expansion')}>
                        <span>Tier 1</span>
                    </div>
                    <div className="timeline-item-header">
                        <h3 className="ml-6 text-left">
                            Expansion&nbsp;
                            <i className="timeline-item-subheader">
                                <span className="d-none d-sm-inline d-lg-none d-xl-inline">
                                    -
                                </span>{' '}
                                with select technologies
                            </i>
                        </h3>
                    </div>
                    <div className="timeline-content">
                        <TimelineAccordion
                            defaultActiveKey={1}
                            activeKey={
                                currentTier === 'expansion' ? undefined : null
                            }>
                            <TimelineAccordionDrawer
                                eventKey={1}
                                title="Primary Tissues"
                                tier="expansion"
                                currentTier={currentTier}
                                setCurrentTier={() =>
                                    setCurrentTier('expansion')
                                }
                                values={[
                                    {
                                        number: '-',
                                        units: ['Donors'],
                                    },
                                    {
                                        number: '-',
                                        units: ['Tissue', 'Types'],
                                    },
                                    {
                                        number: '-',
                                        units: ['Files', 'Generated'],
                                    },
                                    {
                                        number: '-',
                                        units: ['Proposed', 'Assay Types'],
                                    },
                                ]}
                            />
                        </TimelineAccordion>
                    </div>
                </div>

                <div
                    className={
                        'timeline-item ' +
                        (currentTier === 'production'
                            ? 'tier-active'
                            : 'tier-inactive')
                    }>
                    <div
                        className="timeline-marker"
                        onClick={() => setCurrentTier('production')}>
                        <span>Tier 2</span>
                    </div>
                    <div className="timeline-item-header">
                        <h3 className="ml-6 text-left">
                            Production&nbsp;
                            <i className="timeline-item-subheader">
                                <span className="d-none d-sm-inline d-lg-none d-xl-inline">
                                    -
                                </span>{' '}
                                with core technologies
                            </i>
                        </h3>
                    </div>
                    <div className="timeline-content">
                        <TimelineAccordion
                            defaultActiveKey={1}
                            activeKey={
                                currentTier === 'production' ? undefined : null
                            }>
                            <TimelineAccordionDrawer
                                eventKey={1}
                                title="Primary Tissues"
                                tier="production"
                                currentTier={currentTier}
                                setCurrentTier={() =>
                                    setCurrentTier('production')
                                }
                                values={[
                                    {
                                        number: '150',
                                        units: ['Donors'],
                                    },
                                    {
                                        number: '20',
                                        units: ['Primary', 'Tissues'],
                                    },
                                    {
                                        number: '-',
                                        units: ['Core', 'Assays'],
                                    },
                                    {
                                        number: '47',
                                        units: ['Files', 'Generated'],
                                    },
                                ]}
                            />
                        </TimelineAccordion>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ContextAwareToggle({
    children,
    eventKey,
    callback,
    currentTier,
    tier,
    setCurrentTier,
}) {
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
                    setCurrentTier(tier);
                }}>
                <div className="d-flex justify-start">
                    <i className={openStatusIconCls + ' m-auto mr-1'} />
                    {children}
                </div>
            </button>
            {/* {tier === 'benchmarking' ? (
                <a className="card-header-link">
                    <img
                        src={`/static/img/arrow-${
                            currentTier === 'benchmarking' ? 'green' : 'blue'
                        }.svg`}
                    />
                </a>
            ) : null} */}
        </div>
    );
}

function TimelineAccordion(props) {
    const { defaultActiveKey, children, activeKey } = props;

    return (
        <Accordion {...{ defaultActiveKey, activeKey }}>{children}</Accordion>
    );
}

function TimelineAccordionDrawer(props) {
    const {
        eventKey,
        title = 'Click me!',
        values = [],
        currentTier,
        tier,
        setCurrentTier,
    } = props;
    return (
        <Card>
            <Card.Header>
                <ContextAwareToggle
                    {...{ eventKey, tier, currentTier, setCurrentTier }}>
                    <span className="text-left">{title}</span>
                </ContextAwareToggle>
            </Card.Header>
            <Accordion.Collapse {...{ eventKey }}>
                <Card.Body>
                    <div className="card-divider"></div>
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
                    <div className="number-group" key={i}>
                        <h4>{number}</h4>
                        <div>
                            {units.map((line, i) => (
                                <span key={i}>{line}</span>
                            ))}
                        </div>
                    </div>
                );
            })}
        </>
    );
};
