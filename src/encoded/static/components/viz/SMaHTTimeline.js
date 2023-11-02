import React, { useContext } from 'react';
import {
    Accordion,
    AccordionContext,
    useAccordionToggle,
} from 'react-bootstrap';
import Card from 'react-bootstrap/esm/Card';

export default function SMaHTTimeline() {
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
                            />
                            <TimelineAccordionDrawer
                                eventKey={2}
                                title="HapMap Cell Lines"
                            />
                            <TimelineAccordionDrawer
                                eventKey={3}
                                title="iPSC & Fibroblasts"
                            />
                            <TimelineAccordionDrawer
                                eventKey={4}
                                title="Tissue Benchmarking"
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
                            />
                        </TimelineAccordion>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ContextAwareToggle({ children, eventKey, callback }) {
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
        <div className="d-flex justify-content-between align-items-center">
            <button
                type="button"
                className="border-0 bg-transparent"
                onClick={decoratedOnClick}>
                <div>
                    <i className={openStatusIconCls + ' mr-1'} />
                    {children}
                </div>
            </button>
            <i className="icon icon-arrow-right fas" />
        </div>
    );
}

function TimelineAccordion(props) {
    const { defaultActiveKey, children } = props;

    return <Accordion {...{ defaultActiveKey }}>{children}</Accordion>;
}

function TimelineAccordionDrawer(props) {
    const { eventKey, title = 'Click me!' } = props;
    return (
        <Card>
            <Card.Header>
                <ContextAwareToggle {...{ eventKey }}>
                    {title}
                </ContextAwareToggle>
            </Card.Header>
            <Accordion.Collapse {...{ eventKey }}>
                <Card.Body>Hello! I&apos;m the body</Card.Body>
            </Accordion.Collapse>
        </Card>
    );
}

// function BenchmarkingAccordions() {
//     return (

//     );
// }

// function ExpansionAccordion() {

// }
