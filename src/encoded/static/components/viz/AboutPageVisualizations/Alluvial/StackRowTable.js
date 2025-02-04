import React, { useState, forwardRef } from 'react';
import {
    OverlayTrigger,
    Popover,
    PopoverBody,
    PopoverHeader,
} from 'react-bootstrap';
import tableData from './data/stackrow_data.json';
import graph from './data/alluvial_data.json';

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
const OverlayTriggerContent = forwardRef(
    ({ value, data, ...triggerHandler }, ref) => {
        return (
            <div
                className="stackrow-item-container clickable"
                tabIndex={0}
                {...triggerHandler}>
                <span className="stackrow-item-value" ref={ref}>
                    {value}
                </span>
            </div>
        );
    }
);

/**
 * Renders an item to be shown on the table.
 * Note: [value] defaults to 0
 */
const StackRowItem = ({ value = 0, data = [], data_generator = '' }) => {
    return (
        <td
            className={
                'stackrow-item' + (value === 0 ? ' empty-label-row' : '')
            }>
            {value > 0 ? (
                <OverlayTrigger
                    trigger={['hover', 'focus', 'click']}
                    placement="bottom"
                    rootClose
                    overlay={
                        <Popover id="popover-consortium-data-alluvial-table">
                            <PopoverHeader>
                                {value +
                                    (value > 1
                                        ? ' sequencing platforms'
                                        : ' sequencing platform')}
                            </PopoverHeader>
                            <PopoverBody>
                                <PopoverContents data={data} />
                            </PopoverBody>
                        </Popover>
                    }>
                    <OverlayTriggerContent value={value} data={data} />
                </OverlayTrigger>
            ) : null}
        </td>
    );
};

// Top diagonal labels for table
const StackRowTopLabel = ({ assayType }) => {
    const [showPopover, setShowPopover] = useState(false);
    return (
        <th className="label">
            <OverlayTrigger
                scope="col"
                show={showPopover}
                placement="top"
                overlay={
                    <Popover
                        id="popover-consortium-data-alluvial-table"
                        as="div"
                        role="modal"
                        aria-labelledby={`Details about ${assayType.display_name}.`}
                        onMouseEnter={() => setShowPopover(true)}
                        onMouseLeave={() => setShowPopover(false)}>
                        <PopoverHeader>{assayType.display_name}</PopoverHeader>
                        <PopoverBody>
                            {assayType.description ? (
                                <p>{assayType.description}</p>
                            ) : null}
                            {assayType.link && (
                                <a
                                    className="read-more link-underline-hover"
                                    href={assayType.link}
                                    target="blank_">
                                    Read more
                                </a>
                            )}
                        </PopoverBody>
                    </Popover>
                }>
                <span
                    onMouseEnter={() => setShowPopover(true)}
                    onTouchStart={() => setShowPopover(true)}
                    onMouseLeave={() => setShowPopover(false)}
                    onTouchEnd={() => setShowPopover(false)}
                    onFocus={() => setShowPopover(true)}
                    onBlur={() => setShowPopover(false)}
                    data-tip={assayType.name}
                    aria-expanded={showPopover}
                    role="button"
                    tabIndex={0}
                    data-for="tooltip">
                    {assayType.display_name}
                </span>
            </OverlayTrigger>
        </th>
    );
};

// Header corresponding to each row on the table
const StackRow = ({ rowTitle, platforms, data }) => {
    return (
        <tr className="stackrow-row">
            <th
                className="stackrow-left-label"
                scope="row"
                data-row-title={rowTitle}>
                <div className="label">
                    <span className="">{rowTitle}</span>
                </div>
            </th>
            {data.map((d, j) => {
                const platformList = platforms[d.name] ?? [];

                return (
                    <StackRowItem
                        key={j}
                        value={platformList.length}
                        data={platformList}
                        data_generator={rowTitle}
                    />
                );
            })}
        </tr>
    );
};

/**
 * StackRowTable is a table representing [data] as a table with horizontal
 * and vertical headers representing Assay Types and GCC's, respectively.
 */
export const StackRowTable = ({ data = tableData }) => {
    return (
        <div className="stackrow-table-container">
            <p className="visualization-warning d-block d-sm-none">
                <span>Note:</span> for the best experience, please view the
                visualization below on a tablet or desktop.
            </p>
            <div className="table-container">
                <table className="stackrow-table">
                    {/* Render the row labels (across the top of table) */}
                    <thead className="stackrow-table-top-labels">
                        <tr>
                            {data.map((d, i) => {
                                return (
                                    <StackRowTopLabel assayType={d} key={i} />
                                );
                            })}
                        </tr>
                    </thead>
                    {/* Render the left labels and body of the table */}
                    <tbody className="stackrow-table-body">
                        {Object.keys(graph.platforms).map((gcc, i) => {
                            return (
                                <StackRow
                                    key={i}
                                    rowTitle={gcc}
                                    platforms={graph.platforms[gcc]}
                                    data={data}
                                />
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="stackrow-table-footnote">
                Scroll to the right to view more assays. <br />
                Hover over assay types to see additional details.
            </p>
            <StackRowItemLegend
                text={
                    'Number of sequencing platforms used in benchmarking experiments.'
                }
            />
        </div>
    );
};
