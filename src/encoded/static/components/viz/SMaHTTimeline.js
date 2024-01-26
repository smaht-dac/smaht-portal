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
                <span className="latest-release">
                    <b>Latest Release: </b>February 1<sup>st</sup>, 2024
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
                        onClick={() => setCurrentTier('benchmarking')}></div>
                    <div className="timeline-item-header">
                        <h3 className="text-left">
                            Tier 0: Benchmarking&nbsp;
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
                                        number: '3',
                                        units: ['Assays'],
                                    },
                                    {
                                        number: '1',
                                        units: ['Mutations'],
                                    },
                                    {
                                        number: '31',
                                        units: ['Files', 'Generated'],
                                    },
                                ]}
                                href="/data/benchmarking/COLO829#main"
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
                                        units: ['Assays'],
                                    },
                                    {
                                        number: '-',
                                        units: ['Mutations'],
                                    },
                                    {
                                        number: '-',
                                        units: ['Files', 'Generated'],
                                    },
                                ]}
                                href="/data/benchmarking/HapMap#main"
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
                                        units: ['Assays'],
                                    },
                                    {
                                        number: '-',
                                        units: ['Mutations'],
                                    },
                                    {
                                        number: '-',
                                        units: ['Files', 'Generated'],
                                    },
                                ]}
                                href="/data/benchmarking/iPSC-fibroblasts#main"
                            />
                            <TimelineAccordionDrawer
                                eventKey={4}
                                title="Benchmarking Tissues"
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
                                        units: ['Assays'],
                                    },
                                    {
                                        number: '-',
                                        units: ['Files', 'Generated'],
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
                        onClick={() => setCurrentTier('expansion')}></div>
                    <div className="timeline-item-header">
                        <h3 className="text-left">
                            Tier 1&nbsp;
                            <i className="timeline-item-subheader">
                                <span className="d-none d-sm-inline d-lg-none d-xl-inline">
                                    -
                                </span>{' '}
                                with core + additional technologies
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
                                    { number: '-', units: ['Donors'] },
                                    {
                                        number: '-',
                                        units: ['Tissue', 'Types'],
                                    },
                                    {
                                        number: '-',
                                        units: ['Assays'],
                                    },
                                    {
                                        number: '-',
                                        units: ['Files', 'Generated'],
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
                        onClick={() => setCurrentTier('production')}></div>
                    <div className="timeline-item-header">
                        <h3 className="text-left">
                            Tier 2&nbsp;
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
                                    { number: '-', units: ['Donors'] },
                                    {
                                        number: '-',
                                        units: ['Tissue', 'Types'],
                                    },
                                    {
                                        number: '-',
                                        units: ['Assays'],
                                    },
                                    {
                                        number: '-',
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
    href,
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
            <a href={href} className="card-header-link">
                <svg
                    width="22"
                    height="16"
                    viewBox="0 0 22 16"
                    fill={currentTier === tier ? '#74CFB2' : '#9CC7EF'}
                    xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 7C0.447715 7 0 7.44772 0 8C0 8.55228 0.447715 9 1 9V7ZM21.7071 8.70711C22.0976 8.31658 22.0976 7.68342 21.7071 7.29289L15.3431 0.928932C14.9526 0.538408 14.3195 0.538408 13.9289 0.928932C13.5384 1.31946 13.5384 1.95262 13.9289 2.34315L19.5858 8L13.9289 13.6569C13.5384 14.0474 13.5384 14.6805 13.9289 15.0711C14.3195 15.4616 14.9526 15.4616 15.3431 15.0711L21.7071 8.70711ZM1 9H21V7H1V9Z" />
                </svg>
            </a>
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
        href,
    } = props;
    return (
        <Card>
            <Card.Header>
                <ContextAwareToggle
                    {...{ eventKey, tier, currentTier, setCurrentTier, href }}>
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
