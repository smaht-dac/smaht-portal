'use strict';

import React, { useMemo, useState } from 'react';
import { JWT } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import {
    HeatmapColorPicker,
    buildSequentialPaletteFromHex,
    SortableHeaderLabel,
    compareSortValues,
    FixedScoreLegend,
} from './BrowseTissueHeatmapTable';
import { formatDonorAge } from '../../item-pages/components/donor-overview/ProtectedDonorViewDataCards';
import {
    getDonorHref,
    getDisplayText,
    formatYesNo,
    getAutolysisScoreCellClass,
} from '../../item-pages/components/tissue-overview/helpers';

// TEMPORARY -- the Tissue Overview page's (TissueTypeView.js) Donor Details
// table exactly as it was before it was rebuilt on Browse by Tissue's
// heatmap metrics (TissueDonorDetailsTable.js), kept only so the 2 can be
// compared via that card's "Previous view" toggle. Delete this file and the
// toggle once the comparison is no longer needed.

// The Donor Details table's own 0=None..3=Severe legend (FixedScoreLegend,
// same component/format BrowseTissueHeatmapTable.js's Autolysis Score tab
// uses) -- a distinct `tissue-donor-score-N` class per swatch (not that
// tab's own `score-N`) so its color reads `--tissue-donor-score-N-bg`
// (_item-pages.scss), the same custom property this table's own
// .autolysis-score-cell reads and HeatmapColorPicker below overrides.
const TISSUE_DONOR_AUTOLYSIS_LEGEND_ENTRIES = [0, 1, 2, 3].map((value) => {
    return { className: `tissue-donor-score-${value}`, label: String(value) };
});

export function LegacyTissueDonorDetailsTable({
    donors = [],
    session,
    userDownloadAccess,
    enableConditionalColor = true,
}) {
    // Experimental Colors picker for the Donor Details table's Autolysis
    // Score column -- same admin-only, in-memory-only pattern as
    // BrowseTissueHeatmapTable.js's HeatmapColorPicker (imported directly
    // rather than reimplemented), just wired to this table's own,
    // independent `--tissue-donor-score-N-*` custom properties (see
    // _item-pages.scss) instead of the heatmap's `--heatmap-score-N-*`.
    const isAdminUser = useMemo(
        () => (JWT.getUserGroups() || []).includes('admin'),
        [session]
    );
    const [paletteBaseHex, setPaletteBaseHex] = useState(null);
    const donorTablePalette = useMemo(
        () => (paletteBaseHex ? buildSequentialPaletteFromHex(paletteBaseHex) : null),
        [paletteBaseHex]
    );
    const handlePickPaletteColor = (hex) => setPaletteBaseHex(hex);
    const handleResetPaletteColor = () => setPaletteBaseHex(null);
    const donorTablePaletteStyle = donorTablePalette
        ? donorTablePalette.reduce((style, { bg, text }, i) => {
            style[`--tissue-donor-score-${i}-bg`] = bg;
            style[`--tissue-donor-score-${i}-text`] = text;
            return style;
        }, {})
        : undefined;

    // Donor Details table sort -- same asc/desc/none click-cycle pattern as
    // BrowseTissueHeatmapTable.js's MetricHeatmapTable, adapted to this
    // table's donor-row (not donor x tissue-type) shape. Histology Viewer
    // has no entry here -- it's a link/count, not a meaningful ranking value.
    const [donorTableSortState, setDonorTableSortState] = useState(null);
    const handleDonorTableHeaderClick = (key) => {
        setDonorTableSortState((prev) => {
            if (!prev || prev.key !== key) return { key, direction: 'asc' };
            if (prev.direction === 'asc') return { key, direction: 'desc' };
            return null;
        });
    };
    const donorTableSortValueGetters = {
        donorId: ({ donor: d }) => getDisplayText(d),
        sex: ({ donor: d }) => d?.sex ?? null,
        age: ({ donor: d }) => (typeof d?.age === 'number' ? d.age : null),
        autolysisScore: ({ tissue: t }) => t?.pathology_summary?.autolysis_score ?? null,
        nonTargetPresence: ({ tissue: t }) => {
            const value = t?.pathology_summary?.non_target_tissue_present;
            return typeof value === 'boolean' ? Number(value) : null;
        },
        pathologicFinding: ({ tissue: t }) => {
            const value = t?.pathology_summary?.pathologic_finding_present;
            return typeof value === 'boolean' ? Number(value) : null;
        },
    };
    const displayDonors = useMemo(() => {
        if (!donorTableSortState) return donors;
        const getSortValue = donorTableSortValueGetters[donorTableSortState.key];
        if (!getSortValue) return donors;
        return [...donors].sort((entryA, entryB) =>
            compareSortValues(getSortValue(entryA), getSortValue(entryB), donorTableSortState.direction)
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [donors, donorTableSortState]);

    return (
        <div className="tissue-donor-table-card tissue-donor-table-card--unframed tissue-heatmap-card" style={donorTablePaletteStyle}>
            {isAdminUser ? (
                <div className="tissue-heatmap-toolbar">
                    <HeatmapColorPicker
                        baseHex={paletteBaseHex}
                        // eslint-disable-next-line react/jsx-no-bind
                        onPick={handlePickPaletteColor}
                        // eslint-disable-next-line react/jsx-no-bind
                        onReset={handleResetPaletteColor}
                    />
                </div>
            ) : null}
            {/*
                A plain static stand-in for DotRouter/DotRouterTab's
                own rendered markup (nav.dot-tab-nav > .dot-tab-nav-list
                > button.active > .btn-title, then .tab-router-contents)
                -- there's only ever 1 real tab here, and the real
                DotRouter (BrowseTissueHeatmapTable.js's own 3-tab
                tables, Ischemic Time/Autolysis Score/Target Tissue %,
                on the separate Browse-by-Tissue overview page)
                actually throws with just 1 child: DotRouter.getDefaultTab
                reads `children.length`, but React only wraps `props.children`
                in an array once there's more than 1 of them -- with
                exactly 1, `children` is that single element, `.length`
                comes back `undefined`, the loop never finds a default
                tab, and render() crashes destructuring `null.props`.
                Reusing just the CSS classes (`tissue-heatmap-tabs`, a
                real component's own click/URL routing has nothing to
                switch to here anyway) gives this table the exact same
                tab-strip card look for visual consistency without
                that crash.
            */}
            <div className="tab-router">
                <nav className="dot-tab-nav tissue-heatmap-tabs">
                    <div className="dot-tab-nav-list">
                        <button type="button" className="active">
                            <div className="btn-title">Donor Details</div>
                        </button>
                    </div>
                </nav>
                <div className="tab-router-contents">
                    <div className="tissue-heatmap-metric-heading">
                        <div className="tissue-heatmap-metric-heading-row">
                            <h2 className="tissue-heatmap-metric-title">Donor Details</h2>
                            <FixedScoreLegend
                                entries={TISSUE_DONOR_AUTOLYSIS_LEGEND_ENTRIES}
                                leftCaption="Minimal"
                                rightCaption="Severe"
                            />
                        </div>
                    </div>
                    <div className="body">
                        <table className="tissue-donor-table table">
                            <thead>
                                <tr>
                                    <th>
                                        <SortableHeaderLabel
                                            label="Donor ID"
                                            sortDirection={donorTableSortState?.key === 'donorId' ? donorTableSortState.direction : null}
                                            // eslint-disable-next-line react/jsx-no-bind
                                            onClick={() => handleDonorTableHeaderClick('donorId')}
                                        />
                                    </th>
                                    <th>
                                        <SortableHeaderLabel
                                            label="Sex"
                                            sortDirection={donorTableSortState?.key === 'sex' ? donorTableSortState.direction : null}
                                            // eslint-disable-next-line react/jsx-no-bind
                                            onClick={() => handleDonorTableHeaderClick('sex')}
                                        />
                                    </th>
                                    <th>
                                        <SortableHeaderLabel
                                            label="Age"
                                            sortDirection={donorTableSortState?.key === 'age' ? donorTableSortState.direction : null}
                                            // eslint-disable-next-line react/jsx-no-bind
                                            onClick={() => handleDonorTableHeaderClick('age')}
                                        />
                                    </th>
                                    <th>
                                        <SortableHeaderLabel
                                            label="Autolysis Score"
                                            sortDirection={donorTableSortState?.key === 'autolysisScore' ? donorTableSortState.direction : null}
                                            // eslint-disable-next-line react/jsx-no-bind
                                            onClick={() => handleDonorTableHeaderClick('autolysisScore')}
                                        />
                                    </th>
                                    <th>
                                        <SortableHeaderLabel
                                            label="Non-Target Tissue Presence"
                                            sortDirection={donorTableSortState?.key === 'nonTargetPresence' ? donorTableSortState.direction : null}
                                            // eslint-disable-next-line react/jsx-no-bind
                                            onClick={() => handleDonorTableHeaderClick('nonTargetPresence')}
                                        />
                                    </th>
                                    <th>
                                        <SortableHeaderLabel
                                            label="Unexpected/Pathologic Finding"
                                            sortDirection={donorTableSortState?.key === 'pathologicFinding' ? donorTableSortState.direction : null}
                                            // eslint-disable-next-line react/jsx-no-bind
                                            onClick={() => handleDonorTableHeaderClick('pathologicFinding')}
                                        />
                                    </th>
                                    <th>Histology Viewer</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayDonors.length > 0 ? (
                                    displayDonors.map(({ donor: d, tissue: t }) => {
                                        const donorHref = getDonorHref(d, userDownloadAccess);
                                        const pathologySummary = t?.pathology_summary || {};
                                        const histologyImages = pathologySummary.histology_images || [];
                                        return (
                                            <tr key={d.uuid}>
                                                <td>
                                                    {donorHref ? (
                                                        <a href={donorHref}>{getDisplayText(d)}</a>
                                                    ) : (
                                                        getDisplayText(d)
                                                    )}
                                                </td>
                                                <td>{getDisplayText(d.sex)}</td>
                                                <td>{getDisplayText(formatDonorAge(d.age))}</td>
                                                <td
                                                    className={
                                                        enableConditionalColor
                                                            ? getAutolysisScoreCellClass(
                                                                pathologySummary.autolysis_score
                                                            )
                                                            : ''
                                                    }>
                                                    {getDisplayText(pathologySummary.autolysis_score)}
                                                </td>
                                                <td>{formatYesNo(pathologySummary.non_target_tissue_present)}</td>
                                                <td>{formatYesNo(pathologySummary.pathologic_finding_present)}</td>
                                                <td>
                                                    {histologyImages.length > 0 ? (
                                                        <a
                                                            href={histologyImages[0]?.href || histologyImages[0]?.['@id']}
                                                            target="_blank"
                                                            rel="noopener noreferrer">
                                                            View{histologyImages.length > 1 ? ` (${histologyImages.length})` : ''}
                                                        </a>
                                                    ) : (
                                                        '-'
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={8}>No donor data available for this tissue type.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
