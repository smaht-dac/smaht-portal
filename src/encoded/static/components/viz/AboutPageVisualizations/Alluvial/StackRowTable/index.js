import React, { useState } from 'react';
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
const StackRowItem = ({ value=0, data=[], data_generator="" }) => {
    // console.log(value, data, data_generator)
    return (
        <td className={ value === 0 ? 'empty-label-row' : '' }>
            { value > 0 ? (
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
            ) : null }
        </td>
    );
};

const StackRowTopLabel = ({ assayType }) => {
    const [showPopover, setShowPopover] = useState(false);
    return (
        <td className="label">
            <OverlayTrigger
                show={showPopover}
                placement="top"
                overlay={
                    <Popover 
                        id="popover-container"
                        as="div"
                        onMouseEnter={() => setShowPopover(true)}
                        onMouseLeave={() => setShowPopover(false)}
                    >
                        <PopoverTitle>
                            {assayType.display_name}
                        </PopoverTitle>
                        <PopoverContent>
                            {assayType.description}
                            <br />
                            { assayType.link && <a href={assayType.link} target="blank_">Read more</a> }
                        </PopoverContent>
                    </Popover>
                }>
                    <span
                        onMouseEnter={() => setShowPopover(true)}
                        onMouseLeave={() => setShowPopover(false)}
                        data-tip={assayType.name}
                        data-for="tooltip">
                        {assayType.display_name}
                    </span>
            </OverlayTrigger>
        </td>
    )
}


// Header corresponding to each row on the table
const StackRow = ({ rowTitle, platforms, data }) => {
    return (
        <tr className="stackrow-row">
            <th className="stackrow-left-label" scope="row" data-row-title={rowTitle}>
                <div className="label">
                    <span className="">{rowTitle}</span>
                </div>
            </th>
            { data.map((d, j) => {
                const platformList = platforms[d.name] ?? [];

                return (
                    <StackRowItem
                        key={j}
                        value={platformList.length }
                        data={platformList}
                        data_generator={rowTitle}
                    />
                )
            })}
        </tr>
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
        <div className="stackrow-table-container container">
            <table className="stackrow-table">
                {/* Render the row labels (across the top of table) */}
                <thead className="stackrow-table-top-labels">
                    <tr>
                        { data.map((d, i) => {
                            return <StackRowTopLabel assayType={d} key={i} />
                        })}
                    </tr>
                </thead>
                {/* Render the left labels and body of the table */}
                <tbody className="stackrow-table-body">
                    { Object.keys(graph.platforms).map((gcc, i) => {
                        return <StackRow key={i} rowTitle={gcc} platforms={graph.platforms[gcc]} data={data} />
                    })}
                </tbody>
            </table>
            <p className="stackrow-table-footnote">Hover over assay types to see additional details.</p>
            <StackRowItemLegend
                text={'Number of samples profiled in benchmarking experiments.'}
            />
        </div>
    );
};