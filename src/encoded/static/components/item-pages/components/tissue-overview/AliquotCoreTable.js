'use strict';

import React from 'react';

// "UWSC GCC" -> "UWSC" -- every real submission center name ends in its
// role suffix (see helpers.js's isTpcSubmissionCenter), which is just noise
// in a column already titled "Data Gen.".
export const formatCenterName = (center) => (center ? center.replace(/\s*GCC$/, '') : center);

// The Core / Data / Data Gen. table shared by the Frozen solid-tissue popover
// (FrozenAliquotPopoverBody.js) and the non-solid one
// (NonSolidAliquotVisualization.js) -- in both, one row is one real
// TissueSample. `rowLabel` names the first column: "Core" for solid tissue
// (a physical core at a plate position), "Sample" for non-solid, where a row
// is a share of one tube's material sent to a GCC, not a core.
//
// Each row: { key, coreLabel, coreColor?, coreHref?, coreTitle?, dataLabels[],
// centerLabel, centerHref?, centerTitle?, centerIsEmpty? } -- `hoverKey`
// (defaults to `key`) is what onHoverKey reports for the two-way hover with
// the plate dots in the Frozen popover.
export default function AliquotCoreTable({
    rows,
    hoveredKey = null,
    onHoverKey = null,
    emptyMessage = null,
    rowLabel = 'Core',
}) {
    return (
        <div className="aliquot-detail-table-scroll">
            <table className="aliquot-detail-table is-frozen">
                <thead>
                    <tr>
                        <th>{rowLabel}</th>
                        <th>Data</th>
                        <th>Data Gen.</th>
                    </tr>
                </thead>
                <tbody>
                    {emptyMessage ? (
                        <tr>
                            <td className="aliquot-detail-table-empty" colSpan={3}>
                                {emptyMessage}
                            </td>
                        </tr>
                    ) : null}
                    {rows.map((row) => {
                        const hoverKey = row.hoverKey || row.key;
                        const coreStyle = row.coreColor ? { color: row.coreColor } : undefined;
                        return (
                            <tr
                                key={row.key}
                                className={hoverKey === hoveredKey ? 'is-hovered' : undefined}
                                // eslint-disable-next-line react/jsx-no-bind
                                onMouseEnter={onHoverKey ? () => onHoverKey(hoverKey) : undefined}
                                // eslint-disable-next-line react/jsx-no-bind
                                onMouseLeave={onHoverKey ? () => onHoverKey(null) : undefined}>
                                <td className="aliquot-detail-core-cell" style={coreStyle}>
                                    {row.coreHref ? (
                                        <a
                                            href={row.coreHref}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title={row.coreTitle}
                                            style={coreStyle}>
                                            {row.coreLabel}
                                        </a>
                                    ) : (
                                        <span title={row.coreTitle}>{row.coreLabel}</span>
                                    )}
                                </td>
                                <td>
                                    {row.dataLabels.length > 0 ? (
                                        row.dataLabels.join(', ')
                                    ) : (
                                        <span className="aliquot-detail-na">N/A</span>
                                    )}
                                </td>
                                <td>
                                    {row.centerHref ? (
                                        <a
                                            href={row.centerHref}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title={row.centerTitle}>
                                            {row.centerLabel}
                                        </a>
                                    ) : row.centerIsEmpty ? (
                                        <span className="aliquot-detail-na">{row.centerLabel}</span>
                                    ) : (
                                        row.centerLabel
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
