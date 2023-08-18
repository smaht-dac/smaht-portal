import React, { useState } from 'react';
import { OverlayTrigger, Popover, PopoverContent, PopoverTitle } from "react-bootstrap";
import total_feature_counts from '../data/stackrow-data-totals.json';


const OverlayTriggerContent = ({ref, value, ...triggerHandler}) => {
    return (
        <div className="stackrow-item-container clickable" {...triggerHandler}>
            <span className="stackrow-item-value" ref={ref}>{ value }</span>
        </div>
    )
}


const getItemInfo = (data) => {

    let dataByInstitution = {};
    if (Array.isArray(data)) {
        data.forEach((feat) => {
            let dataGenerator = feat['Data Generators'];
            if (dataByInstitution[dataGenerator]) {
                dataByInstitution[dataGenerator].push(feat)
            }
            else {
                dataByInstitution[dataGenerator] = [feat];
            }
        })
    }
    else {
        for (let feature in data.molecular_feature_groups) {
            let features = data.molecular_feature_groups[feature]['features'];
            features.forEach((feat) => {
                let dataGenerator = feat['Data Generators'];
                if (dataByInstitution[dataGenerator]) {
                    dataByInstitution[dataGenerator].push(feat)
                }
                else {
                    dataByInstitution[dataGenerator] = [feat];
                }
            })
        }
    }

    return dataByInstitution
}

const PopoverContents = ({data}) => {
    const dataByInstitution = Object.entries(getItemInfo(data));

    return (
        <div className="stackrow-item-popover-list">
            <ul>
            {
                dataByInstitution.map((d, i) => { // Each pair of [dataGenerator, assays]
                    return(
                        // <div key={i}>
                                <li key={i}><span className="data-generator">{d[0]}</span><span className="assay-count">{d[1].length}</span></li> 
                                
                                // {/* {
                                //     d[1].map((assay, i) => {
                                //         return <li>{assay.}</li>
                                //     })
                                // } */}
                        // </div>
                    )
                })
            }
            </ul>
        </div>
    )
}


const StackRowItem = ({ value, data }) => {
    return (
        <div className="stackrow-item">
            {
                value && value > 0 ?
                        <OverlayTrigger
                            trigger="click"
                            placement="bottom"
                            rootClose
                            overlay={
                                <Popover id="popover-container">
                                    <PopoverTitle>
                                        {value} Assays
                                    </PopoverTitle>
                                    <PopoverContent>
                                        <PopoverContents data={data} />
                                    </PopoverContent>
                                </Popover>
                            }
                        >
                            <OverlayTriggerContent value={value} />
                        </OverlayTrigger>
                    :
                    null
            }
        </div>
    );
}

const StackRow = ({rowName, subrowNames, handleExpandedRow, expanded }) => {

    return (
        <div className="stackrow">
            <div className="stackrow-label-container">
                <div className="stackrow-label-container-primary">
                    <i 
                        className={`clickable icon fas icon-fw icon-${expanded ? 'minus' : 'plus'}`}
                        onClick={() => {handleExpandedRow(rowName)}}
                    >
                    </i>
                    <h4 className="stackrow-title">{rowName}</h4>
                </div>
                { expanded ?
                    <div className="stackrow-label-container-subrow">
                        {
                            subrowNames.map((d, i) => {
                                return (
                                    <div className="subrow" key={i} >
                                        <h4 className="subrow-title">{d}</h4>
                                    </div>
                                );
                            })
                        }
                    </div>
                    :
                    null
                }
            </div>
            
        </div>
    );
}

const SortButton = ({ assayType, selected, sortInfo, setSortInfo }) => {

    if (selected) {
        if (sortInfo.direction === "descending") { // descending, click should sort ascending
            return <i data-index={assayType} onClick={() => {setSortInfo({ sortIndex: assayType, direction: "ascending" })}} className={"fas icon icon-sort-down clickable selected"} />
        }
        else { // ascending, click should remove sorting
            return <i data-index={assayType} onClick={() => {setSortInfo({ sortIndex: "", direction: "" })}} className={"fas icon icon-sort-up clickable selected"} />
        }
    }
    else {
        return (
            <i data-index={assayType} onClick={() => {setSortInfo({ sortIndex: assayType, direction: "descending" })}} className={"fas icon icon-sort-down clickable"} />
        )
    }
}

export const StackRowTable = ({ data }) => {
    const [sortInfo, setSortInfo] = useState({sortIndex: '', direction: ''});

    // rowOrder := the order in which rows should be rendered as a list
    // (Facilitates rendering the labels down the left side)
    // rowOrder = 0, Genetics
    // rowOrder = 1, Epigenetic
    // rowOrder = 2, Transcriptomic
    // By default will be in this order, but will be able to be sorted by 
    const rowOrder = [
        { rowName: "Genetic", subrowNames: ["Assembled genome", "CNV", "InDel", "MEI", "Repeat elements", "SNV", "Telomere lengths"], },
        { rowName: "Epigenetic", subrowNames: ["Chromatin accessibility", "Chromatin conformation", "DNA methylation"] },
        { rowName: "Transcriptomic", subrowNames: ["Gene expression", "Gene expression - Spatial", "Transcript isoform"] }
    ].sort((row1, row2) => {
        const { sortIndex, direction } = sortInfo;
        if (direction === "descending") {
            return total_feature_counts[row2.rowName][sortIndex] ?? 0 - total_feature_counts[row1.rowName][sortIndex] ?? 0;
        }
        else if (sortInfo.direction === "ascending") {
            return total_feature_counts[row1.rowName][sortIndex] ?? 0 - total_feature_counts[row2.rowName][sortIndex] ?? 0;
        }
        else { // No direction specified
            return 0
        }
    })

    const [expandedRows, setExpandedRows] = useState([]);


    const handleExpandedRow = (rowName) => {
        // check if row is already expanded
        if ( expandedRows.includes(rowName) ) { 
            setExpandedRows(expandedRows.filter(d => d !== rowName))
        }
        else {
            setExpandedRows(expandedRows.concat(rowName));
        }
    }


    return (
        <div className="stackrow-table">
            <div className="stackrow-table-labels">
                {   rowOrder.map((row, i) => {
                        return (
                            <StackRow rowName={row.rowName} subrowNames={row.subrowNames} key={i} handleExpandedRow={handleExpandedRow} expanded={expandedRows.includes(row.rowName)}/>
                        )
                    })
                }
            </div>
            <div className="stackrow-table-columns">
                {
                    data.map((d, i) => {
                        return (
                            // Columns are added at once
                            <div key={i} className="column">
                                <div className="column-label">
                                    <p key={i}>{d.assayType}</p>
                                    <SortButton 
                                        key={d.assayType + i} 
                                        assayType={d.assayType} 
                                        selected={sortInfo.sortIndex === d.assayType} 
                                        sortInfo={sortInfo} 
                                        setSortInfo={setSortInfo} 
                                    />
                                </div>
                                <div className="column-items flex flex-column">
                                    {   rowOrder.map(({ rowName }, j) => {

                                        /**
                                         * If the row [rowName] is in [expandedRows], then show the values for 
                                         * the subrows, which are located in:
                                         * d.molecular_feature_categories[rowName]['molecular_feature_groups']
                                         */
                                        if (expandedRows.includes(rowName)) {
                                            let subrows = rowOrder.filter(row => row.rowName === rowName)[0]['subrowNames']; // Get the subrows

                                            return (
                                                <div key={j}>
                                                    {/* Empty item to preserve spacing */}
                                                    <StackRowItem /> 
                                                    {
                                                        subrows.map((subrow, k) => {
                                                            let count = 0;
                                                            if (d.molecular_feature_categories[rowName]) {
                                                                if (d.molecular_feature_categories[rowName]['molecular_feature_groups'][subrow]) { // has the particular molecular feature
                                                                    count = d.molecular_feature_categories[rowName]['molecular_feature_groups'][subrow]['features'].length;
                                                                    return <StackRowItem value={count} key={k} data={d.molecular_feature_categories[rowName]['molecular_feature_groups'][subrow]['features']} />
                                                                }
                                                            }
                                                            return (
                                                                <StackRowItem value={count} key={k} />
                                                            )
                                                        })
                                                    }
                                                </div>
                                            )
                                        }
                                        // Non-expanded rows
                                        if (d.molecular_feature_categories[rowName] != null) {
                                            return <StackRowItem value={total_feature_counts[rowName][d.assayType]} key={j} data={d.molecular_feature_categories[rowName]} />
                                        }
                                        // Empty Item
                                        else {
                                            return <StackRowItem key={j} />
                                        }
                                        })
                                    }
                                </div>
                            </div>
                        )
                    })
                }
            </div>
        </div>
    )
}