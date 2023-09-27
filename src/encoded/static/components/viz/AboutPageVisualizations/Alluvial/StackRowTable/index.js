import React from 'react';
import {
    OverlayTrigger,
    Popover,
    PopoverContent,
    PopoverTitle,
} from 'react-bootstrap';
import graph from '../data/alluvial_data.json';

// Legend rendered below the table
const StackRowItemLegend = ({ text }) => {
    return (
        <div className="stackrow-item-legend">
            <div className="stackrow-item">
                <div className="stackrow-item-container clickable">
                    <span className="stackrow-item-value">#</span>
                </div>
            </div>
            <p className="text">{text}</p>
        </div>
    );
};

// A list of information provided to show in the Bootstrap Popover
const PopoverContents = ({ data }) => {
    return (
        <div className="stackrow-item-popover-list">
            <ul>
                {data.map((d, i) => {
                    return <li key={i}>{d}</li>;
                })}
            </ul>
        </div>
    );
};

// Component serving as a trigger for the Bootstrap Popover component
const OverlayTriggerContent = ({ ref, value, data, ...triggerHandler }) => {
    return (
        <div className="stackrow-item-container clickable" {...triggerHandler}>
            <span className="stackrow-item-value" ref={ref}>
                {value}
            </span>
        </div>
    );
};

/**
 * Renders an item to be shown on the table.
 * Note: [value] defaults to 0
 */
const StackRowItem = ({ value=0, data, data_generator }) => {
    return (
        <div
            className={`stackrow-item ${value === -1 ? 'empty-label-row' : ''}`}
            data-generator={data_generator}>
            {value > 0 ? (
                <OverlayTrigger
                    trigger={['hover', 'focus']}
                    placement="bottom"
                    rootClose
                    overlay={
                        <Popover id="popover-container">
                            <PopoverTitle>
                                {value +
                                    (value > 1
                                        ? ' sequencing platforms'
                                        : ' sequencing platform')}
                            </PopoverTitle>
                            <PopoverContent>
                                <PopoverContents data={data} />
                            </PopoverContent>
                        </Popover>
                    }>
                    <OverlayTriggerContent value={value} data={data} />
                </OverlayTrigger>
            ) : null}
        </div>
    );
};


// Header corresponding to each row on the table
const StackRow = ({ rowTitle }) => {
    return (
        <div className="stackrow" data-row-title={rowTitle}>
            <div className="stackrow-label-container">
                <div className="stackrow-label-container-primary">
                    <h4 className="stackrow-title">{rowTitle}</h4>
                </div>
            </div>
        </div>
    );
};

/**
 * StackRowTable is a table representing the information found in [data]
 * by rendering a list of columns, each with a header above them. Each
 * column, in turn, has a list of items which each have a portion of
 * [data] passed down to it.
 */
export const StackRowTable = ({ data }) => {
    return (
        <>
            <div className="stackrow-table">
                {/* Render the row labels (down the left side of table) */}
                <div className="stackrow-table-labels">
                    {Object.keys(graph.platforms).map((gcc, i) => {
                        return <StackRow key={i} rowTitle={gcc} />;
                    })}
                </div>
                <div className="stackrow-table-columns">
                    {/* Render the columns */}
                    { data.map((d, i) => {
                        return (
                            // Container for the content of an entire column
                            <div key={i} className="column">

                                {/* Diagonal lables across top with popover */}
                                <div className="column-label">
                                    <OverlayTrigger
                                        trigger={['hover', 'focus']}
                                        placement="bottom"
                                        rootClose
                                        overlay={
                                            <Popover id="popover-container">
                                                <PopoverTitle>
                                                    {d.assayType}
                                                </PopoverTitle>
                                                <PopoverContent>
                                                    {d.assayType}
                                                </PopoverContent>
                                            </Popover>
                                        }>
                                            <span
                                                key={i}
                                                data-tip={d.assayType}
                                                data-for="tooltip">
                                                {d.assayType}
                                            </span>
                                    </OverlayTrigger>
                                </div>

                                {/* Items for corrsesponding row */}
                                <div className="column-items">
                                    {Object.keys(graph.platforms).map(
                                        (gcc, j) => {
                                            if (
                                                graph.platforms[gcc][
                                                    d.assayType
                                                ]
                                            ) {
                                                return (
                                                    <StackRowItem
                                                        key={j}
                                                        data_generator={gcc}
                                                        value={
                                                            graph.platforms[
                                                                gcc
                                                            ][d.assayType]
                                                                .length
                                                        }
                                                        data={
                                                            graph.platforms[
                                                                gcc
                                                            ][d.assayType]
                                                        }
                                                    />
                                                );
                                            }
                                            // Empty item
                                            else
                                                return (
                                                    <StackRowItem
                                                        key={j}
                                                        data_generator={gcc}
                                                    />
                                                );
                                        }
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            <StackRowItemLegend
                text={'Number of samples profiled in benchmarking experiments.'}
            />
        </>
    );
};
