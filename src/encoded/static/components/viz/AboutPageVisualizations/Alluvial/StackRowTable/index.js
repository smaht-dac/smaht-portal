import React from 'react';
import { OverlayTrigger, Popover, PopoverContent, PopoverTitle } from "react-bootstrap";
import graph from '../data/alluvial_data.json';

// Legend rendered below the table
const StackRowItemLegend = ({text}) => {
    return (
        <div className="stackrow-item-legend">
            <div className="stackrow-item">
                <div className="stackrow-item-container clickable">
                    <span className="stackrow-item-value">#</span>
                </div>
            </div>
            <p className="text">{text}</p>
        </div>
    )
}

// Render a list of information provided by the data
const PopoverContents = ({ data }) => {
    return (
        <div className="stackrow-item-popover-list">
            <ul>
                {
                    data.map((d,i) => {
                        return <li key={i}>{d}</li>
                    })
                }
            </ul>
        </div>
    )
}

// 
const OverlayTriggerContent = ({ref, value, data, ...triggerHandler}) => {
    return (
        <div className="stackrow-item-container clickable" {...triggerHandler}>
            <span className="stackrow-item-value" ref={ref}>{ value }</span>
        </div>
    )
}

/**
 * Renders an item to be shown on the table.
 * Note: Value defaults to 0
 */
const StackRowItem = ({ value=0, data }) => {
    return (
        <div className={`stackrow-item ${ value === -1 ? "empty-label-row" : ""}`}>
            {
                value > 0 ?
                        <OverlayTrigger
                            trigger={["hover", "focus"]}
                            placement="bottom"
                            rootClose
                            overlay={
                                <Popover id="popover-container">
                                    <PopoverTitle>
                                        { value + (value > 1 ? " sequencing platforms" : " sequencing platform") }
                                    </PopoverTitle>
                                    <PopoverContent>
                                        <PopoverContents data={data} />
                                    </PopoverContent>
                                </Popover>
                            }
                        >
                            <OverlayTriggerContent value={value} data={data} />
                        </OverlayTrigger>
                    :
                    null
            }
        </div>
    );
}

const StackRow = ({ rowTitle }) => {

    return (
        <div className="stackrow">
            <div className="stackrow-label-container">
                <div className="stackrow-label-container-primary">
                    <h4 className="stackrow-title">{rowTitle}</h4>
                </div>
            </div>
            
        </div>
    );
}

export const StackRowTable = ({ data }) => {

    return (
        <>
            <div className={"stackrow-table"}>
                {/* Render the row labels (down the left side of table) */}
                <div className="stackrow-table-labels">
                    {   Object.keys(graph.platforms).map((gcc, i) => {
                            return (
                                <StackRow key={i} rowTitle={gcc} />
                            )
                        })
                    }
                </div>
                <div className="stackrow-table-columns">
                    {/* Render the columns */}
                    { data.map((d, i) => {
                        return (
                            // Columns are added at once
                            <div key={i} className="column">
                                
                                {/* Diagonal lables across top */}
                                <div className="column-label">
                                    <p key={i}>{d.assayType}</p>
                                </div>

                                {/* Items for corresponding row */}
                                <div className="column-items flex flex-column">
                                    {
                                        Object.keys(graph.platforms).map((gcc, j) => {
                                            
                                            if (graph.platforms[gcc][d.assayType]) {
                                                return (
                                                    <StackRowItem 
                                                        key={j} 
                                                        value={graph.platforms[gcc][d.assayType].length} 
                                                        data={graph.platforms[gcc][d.assayType]} 
                                                    />
                                                )
                                            }
                                            // Empty item
                                            else return <StackRowItem key={j} />
                                        })
                                    }
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
            <StackRowItemLegend text={"Number of samples profiled in benchmarking experiments."} />
        </>
    )
}