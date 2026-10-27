'use strict';

import React from 'react';
import { AliquotInfoCard, PathologyOutcomeBadge } from './helpers';

// `reports` entries come back as a bare @id string in the @@object frame, or
// a full embedded object in /search/'s embedded frame -- `display_title`
// (auto-embedded for any linkTo) is always long for a PathologyReport (e.g.
// "NDRI_NON-BRAIN-PATHOLOGY-REPORT_SMHT001-3T-003": encoded's shared
// Item.display_title override checks submitted_id, always present, before
// accession), so it's kept only as the link's title tooltip. `accession`
// (explicitly embedded via TissueSample.embedded_list, see
// types/tissue_sample.py) is short and used as the visible label instead
// when present; falls back to "View report"/"Report N" only for the rarer
// cases without one yet (not-yet-accessioned report, or the @@object frame,
// which carries neither field).
function getPathologyReportItems(reports) {
    return (reports || []).map((report, reportIndex, arr) => {
        const accession = typeof report === 'object' ? report?.accession : null;
        return {
            key: typeof report === 'string' ? report : report?.['@id'] || reportIndex,
            href: typeof report === 'string' ? report : report?.['@id'],
            title: typeof report === 'object' ? report?.display_title || null : null,
            label: accession || (arr.length > 1 ? `Report ${reportIndex + 1}` : 'View report'),
            outcome: typeof report === 'object' ? report?.outcome || null : null,
            unacceptableDescription: typeof report === 'object' ? report?.unacceptable_description || null : null,
        };
    });
}

// Body of the (wide) popover a Fixed slice opens -- same layout as
// FrozenAliquotPopoverBody.js: a slice swatch + donor/tissue/aliquot card on
// the left, this slice's pathology reports in a table on the right.
// Presentational only -- AliquotVisualization.js owns the popover itself.
export default function FixedAliquotPopoverBody({
    slice,
    sequenceLabel,
    swatchStyle,
    donorLabel,
    tissueLabel,
}) {
    const reportItems = getPathologyReportItems(slice?.pathologyReports);

    return (
        <div className="aliquot-detail-layout">
            <div className="aliquot-detail-left">
                <div className="aliquot-popover-visual">
                    <span className="aliquot-visual-swatch" style={swatchStyle} />
                </div>
                <AliquotInfoCard
                    donorLabel={donorLabel}
                    specimenLabel="Fixed"
                    tissueLabel={tissueLabel}
                    aliquotLabel={sequenceLabel}
                />
            </div>
            <div className="aliquot-detail-right">
                <section className="aliquot-detail-section">
                    <h4 className="aliquot-detail-section-title">Histology &amp; Pathology Data</h4>
                    <div className="aliquot-detail-table-scroll">
                        <table className="aliquot-detail-table is-fixed">
                            <thead>
                                <tr>
                                    <th>Pathology Report</th>
                                    <th>Outcome</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reportItems.length === 0 ? (
                                    <tr>
                                        <td className="aliquot-detail-table-empty" colSpan={2}>
                                            No report yet.
                                        </td>
                                    </tr>
                                ) : (
                                    reportItems.map((item) => (
                                        <tr
                                            key={item.key}
                                            className={item.href ? 'is-clickable' : undefined}
                                            // eslint-disable-next-line react/jsx-no-bind
                                            onClick={item.href ? (event) => {
                                                if (event.target.closest('a')) return;
                                                window.open(item.href, '_blank', 'noopener,noreferrer');
                                            } : undefined}>
                                            <td>
                                                <a
                                                    href={item.href}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title={item.title || undefined}>
                                                    {item.label}
                                                </a>
                                            </td>
                                            <td>
                                                <PathologyOutcomeBadge
                                                    outcome={item.outcome}
                                                    unacceptableDescription={item.unacceptableDescription}
                                                />
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </div>
    );
}
