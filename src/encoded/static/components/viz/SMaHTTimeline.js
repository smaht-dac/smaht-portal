import React, { useState, useEffect, useContext, useCallback } from 'react';
import {
    Accordion,
    AccordionContext,
    useAccordionButton,
} from 'react-bootstrap';
import Card from 'react-bootstrap/esm/Card';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import ReactTooltip from 'react-tooltip';

const TimelineItem = ({
    currentTier,
    setCurrentTier,
    data,
    itemKey,
    isError,
    loadData,
}) => {
    const { title, subtitle, categories } = data;

    return (
        <div
            className={
                'timeline-item ' +
                (currentTier === itemKey ? 'tier-active' : 'tier-inactive')
            }
            key={itemKey}>
            <div
                className="timeline-marker"
                onClick={() => setCurrentTier(itemKey)}></div>
            <div className="timeline-item-header">
                <h3 className="text-start">
                    {title}&nbsp;
                    {subtitle ? (
                        <i className="timeline-item-subheader">
                            <span className="d-none d-sm-inline d-lg-none d-xl-inline">
                                -
                            </span>{' '}
                            {subtitle}
                        </i>
                    ) : null}
                </h3>
            </div>
            <div className="timeline-content">
                <TimelineAccordion defaultActiveKey={itemKey === 0 ? 1 : 0}>
                    {categories.map((category, j) => {
                        return (
                            <TimelineAccordionDrawer
                                eventKey={j + 1}
                                title={category.title}
                                tier={itemKey}
                                currentTier={currentTier}
                                setCurrentTier={() => setCurrentTier(itemKey)}
                                values={category.figures}
                                link={category.link}
                                categoryKey={j}
                                key={j}
                                isError={isError}
                                loadData={loadData}
                            />
                        );
                    })}
                </TimelineAccordion>
            </div>
        </div>
    );
};

function ContextAwareToggle({
    children,
    eventKey,
    callback,
    currentTier,
    tier,
    setCurrentTier,
    link,
    isError,
    loadData,
}) {
    const { activeEventKey } = useContext(AccordionContext);

    const decoratedOnClick = useAccordionButton(
        eventKey,
        () => callback && callback(eventKey)
    );

    const isCurrentEventKey = activeEventKey === eventKey;

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
                    {!isError && (
                        <i className={openStatusIconCls + ' m-auto me-1'} />
                    )}
                    {children}
                </div>
            </button>
            {isError && (
                <button
                    type="button"
                    className="retry btn-xs btn-link btn"
                    onClick={loadData}>
                    Retry
                </button>
            )}
            {link ? (
                <a href={link} className="card-header-link">
                    <svg
                        width="22"
                        height="16"
                        viewBox="0 0 22 16"
                        fill={currentTier === tier ? '#74CFB2' : '#9CC7EF'}
                        xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 7C0.447715 7 0 7.44772 0 8C0 8.55228 0.447715 9 1 9V7ZM21.7071 8.70711C22.0976 8.31658 22.0976 7.68342 21.7071 7.29289L15.3431 0.928932C14.9526 0.538408 14.3195 0.538408 13.9289 0.928932C13.5384 1.31946 13.5384 1.95262 13.9289 2.34315L19.5858 8L13.9289 13.6569C13.5384 14.0474 13.5384 14.6805 13.9289 15.0711C14.3195 15.4616 14.9526 15.4616 15.3431 15.0711L21.7071 8.70711ZM1 9H21V7H1V9Z" />
                    </svg>
                </a>
            ) : null}
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
        link,
        isError,
        loadData,
    } = props;
    return (
        <Card>
            <Card.Header>
                <ContextAwareToggle
                    {...{
                        eventKey,
                        tier,
                        currentTier,
                        setCurrentTier,
                        link,
                        isError,
                        loadData,
                    }}>
                    <span className="text-start">{title}</span>
                </ContextAwareToggle>
            </Card.Header>
            <Accordion.Collapse {...{ eventKey }}>
                <Card.Body>
                    <div className="card-divider"></div>
                    <TimelineCardContent values={values} isError={isError} />
                </Card.Body>
            </Accordion.Collapse>
        </Card>
    );
}

const TimelineCardContent = ({ values, isError }) => {
    return (
        <>
            {values.map(({ value = null, unit }, i) => {
                return (
                    <div className="number-group" key={i}>
                        {isError ? (
                            <i
                                className="icon icon-exclamation-circle fas text-warning"
                                data-tip="Error: something went wrong while fetching statistics"
                            />
                        ) : (
                            <>
                                <h4>
                                    {value === null ? (
                                        <i className="icon icon-spin icon-circle-notch fas" />
                                    ) : (
                                        value || '-'
                                    )}
                                </h4>
                            </>
                        )}
                        <div>
                            {unit.split(' ').map((line, j) => {
                                return <span key={j}>{line}</span>;
                            })}
                        </div>
                    </div>
                );
            })}
        </>
    );
};

/**
 * Create empty data to render template before data loads
 */
const loadStateData = {
    timeline_content: [
        {
            title: 'Tier 0: Benchmarking',
            subtitle: 'with all technologies',
            categories: [
                {
                    title: 'COLO829 Cell Line',
                    figures: [
                        { unit: 'Cell Lines' },
                        { unit: 'Assays' },
                        { unit: 'Mutations' },
                        { unit: 'Files Generated' },
                    ],
                },
                { title: 'HapMap Cell Line' },
                { title: 'iPSC & Fibroblasts' },
                { title: 'Benchmarking Tissues' },
            ],
        },
        {
            title: 'Tier 1',
            subtitle: 'with core + additional technologies',
            categories: [{ title: 'Primary Tissues' }],
        },
        {
            title: 'Tier 2',
            subtitle: 'with core technologies',
            categories: [{ title: 'Primary Tissues' }],
        },
    ],
};

// Pase date string to human readable format
const getDateString = (string) => {
    if (!string) return null;

    const date = new Date(string.replace(/-/g, '/'));

    const options = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/New_York',
        timeZoneName: 'short',
    };

    return date.toLocaleString('en-US', options);
};

export default function SMaHTTimeline({ currentTier, setCurrentTier }) {
    const [data, setData] = useState(loadStateData);
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);

    const callbackFxn = useCallback((res) => {
        setIsLoading(false);
        setIsError(false);

        const release_date = getDateString(res['date']);
        const data = {
            release_date,
            timeline_content: res['@graph'],
        };
        setData(data);
    });

    const fallbackFxn = useCallback((resp) => {
        setIsLoading(false);
        setIsError(true);
    });

    const loadData = useCallback(() => {
        if (!isLoading) setIsLoading(true);
        if (isError) setIsError(false);

        ajax.load('/home', callbackFxn, 'GET', fallbackFxn);
    }, [callbackFxn, fallbackFxn]);

    // Load latest data from server and update state
    useEffect(() => {
        loadData();
    }, []);

    // When error is triggered, reload tooltips
    useEffect(() => {
        ReactTooltip.rebuild();
    }, [isError]);

    return (
        <div className="container">
            <div id="timeline" className={`tier-${currentTier}`}>
                <span className="latest-release">
                    <b>Latest Release: </b>
                    {data.release_date ?? (
                        <>
                            {isLoading && (
                                <span className="spinner">
                                    <i className="icon icon-spin icon-circle-notch fas" />
                                </span>
                            )}
                            {isError && (
                                <i
                                    className="icon icon-exclamation-circle fas text-warning"
                                    data-tip="Error: something went wrong while fetching statistics"
                                />
                            )}
                        </>
                    )}
                </span>

                {data.timeline_content.map((d, i) => {
                    return (
                        <TimelineItem
                            currentTier={currentTier}
                            setCurrentTier={setCurrentTier}
                            data={d}
                            itemKey={i}
                            key={i}
                            isError={isError}
                            loadData={loadData}
                        />
                    );
                })}
            </div>
        </div>
    );
}
