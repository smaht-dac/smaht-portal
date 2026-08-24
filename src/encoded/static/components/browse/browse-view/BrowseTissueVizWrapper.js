'use strict';

import React, { useState, useEffect, useMemo } from 'react';
import url from 'url';
import _ from 'underscore';
import { Popover } from 'react-bootstrap';
import ReactTooltip from 'react-tooltip';
import { IconToggle } from '@hms-dbmi-bgm/shared-portal-components/es/components/forms/components/Toggle';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { normalizeQueryValuesForStringify } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/search-filters';
import { BrowseSummaryStatsViewer } from './BrowseSummaryStatController';
import { ChartDataController } from '../../viz/chart-data-controller';
import DonorCohortViewChart from '../components/DonorCohortViewChart';
import { formUrlEncode } from './BrowseTissueHeatmapTable';
import { BROWSE_STATUS_FILTERS } from '../BrowseView';
import {
    getTissueIconSrc,
    getTissueDisplayLabel,
    getTissueColorHex,
    hexToRgba,
} from '../../item-pages/components/tissue-overview/helpers';

// Groups the categories returned by item_utils/tissue.py::get_category() into
// the 4 display rows the germ-layer panel has always shown.
const GERM_LAYER_LABELS = [
    { key: 'ecto', label: 'ECTO', categories: ['Ectoderm'] },
    { key: 'meso', label: 'MESO', categories: ['Mesoderm'] },
    { key: 'endo', label: 'ENDO', categories: ['Endoderm'] },
    { key: 'germ-clin', label: 'GERM/CLIN', categories: ['Germ Cells', 'Clinically Accessible'] },
];

// Fixed display order for the 5 raw categories item_utils/tissue.py's
// get_category() returns -- used (unlike GERM_LAYER_LABELS above) by the
// Cohort View charts, which chart each category on its own rather than
// folding Germ Cells/Clinically Accessible into one row.
const TISSUE_CATEGORY_ORDER = ['Ectoderm', 'Mesoderm', 'Endoderm', 'Germ Cells', 'Clinically Accessible'];

// Same population filter Browse by Donor/Browse by File use, mirrored from
// TissueTypeView.js's identical constant -- keeps the coverage chart's file
// population consistent with the rest of the app instead of counting every
// File regardless of release status.
const BROWSE_STATUS_VALUES = new URLSearchParams(BROWSE_STATUS_FILTERS).getAll('status');

// pathology_summary.autolysis_score is an integer 0-3 (see
// item-pages/components/tissue-overview/helpers.js's getAutolysisScoreCellClass
// for the same 0=None/1=mild/2=moderate/3=severe scale).
const AUTOLYSIS_SCORE_GROUPS = [
    { value: 0, label: 'None' },
    { value: 1, label: 'Mild' },
    { value: 2, label: 'Moderate' },
    { value: 3, label: 'Severe' },
];

export const renderTissueCategoryPopover = (customId) => (
    <Popover id={customId || 'chart-info-popover-tissue-category'} className="w-auto description-definitions-popover">
        <Popover.Body className="p-0">
            <table className="table">
                <thead>
                    <tr><th className="text-left">Tissue Category Distribution</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td className="text-left">
                            Shows the number of donors with released files, grouped by germ-layer category.
                        </td>
                    </tr>
                </tbody>
            </table>
        </Popover.Body>
    </Popover>
);

export const renderAutolysisScorePopover = (customId) => (
    <Popover id={customId || 'chart-info-popover-autolysis-score'} className="w-auto description-definitions-popover">
        <Popover.Body className="p-0">
            <table className="table">
                <thead>
                    <tr><th className="text-left">Autolysis Score Distribution</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td className="text-left">
                            Counts individual tissue specimens (not donors) by autolysis score
                            (0 = None, 3 = Severe). A donor with multiple procured tissues
                            contributes one count per tissue. Each tissue&rsquo;s score is the
                            highest reported across its pathology reports.
                        </td>
                    </tr>
                </tbody>
            </table>
        </Popover.Body>
    </Popover>
);

export const renderTissueCoveragePopover = (customId) => (
    <Popover id={customId || 'chart-info-popover-tissue-coverage'} className="w-auto description-definitions-popover">
        <Popover.Body className="p-0">
            <table className="table">
                <thead>
                    <tr><th className="text-left">Coverage per Tissue Category</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td className="text-left">
                            Shows total sequencing coverage (and file count, in the tooltip) per germ-layer category.
                        </td>
                    </tr>
                </tbody>
            </table>
        </Popover.Body>
    </Popover>
);

// Exported for unit testing. `tissueCategoryByTerm` keys are the actual
// tissue_type term strings (e.g. "Liver") -- previously only their count per
// germ layer was kept and the terms themselves were discarded, so each
// bubble below was an unlabeled, unclickable placeholder. Keeping the terms
// lets each bubble link to its own /tissue-overview/ page instead.
export const countTissueTypesByGermLayer = (tissueCategoryByTerm = {}) => {
    const termsByCategory = {};
    Object.entries(tissueCategoryByTerm).forEach(([term, category]) => {
        if (!termsByCategory[category]) termsByCategory[category] = [];
        termsByCategory[category].push(term);
    });
    return GERM_LAYER_LABELS.map(({ key, label, categories }) => {
        const tissueTypes = categories
            .reduce((terms, c) => terms.concat(termsByCategory[c] || []), [])
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        return { key, label, tissueTypes };
    });
};

const TissueGermLayerPanel = ({ fileFilters, session }) => {
    const [loading, setLoading] = useState(true);
    const [germLayerGroups, setGermLayerGroups] = useState(
        GERM_LAYER_LABELS.map(({ key, label }) => {
            return { key, label, tissueTypes: [] };
        })
    );

    // data-tip is react-tooltip's static-attribute API (see app.js's global
    // <ReactTooltip/> mount) -- it only picks up nodes present at its last
    // build, so newly rendered bubbles need an explicit rebuild once loaded.
    useEffect(() => {
        if (!loading) ReactTooltip.rebuild();
    }, [loading, germLayerGroups]);

    useEffect(() => {
        setLoading(true);

        const requestBody = {
            search_query_params: fileFilters,
            fields_to_aggregate_for: ['sample_summary.tissues'],
            include_meta_tissue_categories: true,
        };

        ajax.load(
            '/bar_plot_aggregations/',
            (resp) => {
                setGermLayerGroups(countTissueTypesByGermLayer(resp?.meta?.tissue_category_by_term));
                setLoading(false);
            },
            'POST',
            () => setLoading(false),
            JSON.stringify(requestBody),
            {},
            null
        );
    }, [fileFilters, session]);

    return (
        <div className="tissue-germ-layer-panel">
            {germLayerGroups.map(({ key, label, tissueTypes }) => (
                <div className="tissue-germ-layer-row" key={key}>
                    <div className="tissue-germ-layer-label">
                        {label.split('/').map((part, i, arr) => (
                            <React.Fragment key={part}>
                                {part}
                                {i < arr.length - 1 ? (
                                    <>
                                        /<br />
                                    </>
                                ) : null}
                            </React.Fragment>
                        ))}
                    </div>
                    <div className="tissue-germ-layer-bubbles">
                        {!loading &&
                            tissueTypes.map((tissueType) => {
                                // Same per-tissue anatomy icon and 4-letter
                                // code label used on the Tissue Overview
                                // header and Browse-by-Tissue table headers
                                // (getTissueIconSrc/getTissueDisplayLabel) --
                                // this tooltip previously showed the raw
                                // tissue_type string (leading TPC code, e.g.
                                // "3AM - Brain, Cerebellum") instead of that
                                // already-adopted display convention.
                                const bubbleIconSrc = getTissueIconSrc(tissueType);
                                const bubbleLabel = getTissueDisplayLabel(tissueType);
                                // Official per-tissue color (smaht_tissue_colors.json),
                                // same one used to fill the anatomy icon here as the
                                // rest of the app uses for this tissue elsewhere --
                                // falls back to the panel's neutral default color (set
                                // in SCSS) for the handful of tissue_type values that
                                // scheme doesn't cover.
                                const bubbleColorHex = getTissueColorHex(tissueType);
                                // Color lives only on the ring now -- an
                                // earlier version also tinted the bubble's
                                // background and the icon's own fill, but
                                // that read as too much color competing with
                                // the rest of the page (its blue links/
                                // toggle accent especially). The icon stays
                                // the panel's plain neutral fill (CSS
                                // default, no per-tissue color); only the
                                // border carries the tissue's own color, a
                                // bit thicker than the plain/uncovered
                                // fallback ring so it still reads clearly.
                                const bubbleStyle = bubbleColorHex
                                    ? {
                                        borderColor: hexToRgba(bubbleColorHex, 0.85),
                                        borderStyle: 'solid',
                                        borderWidth: '2.5px',
                                    }
                                    : undefined;
                                return (
                                    <a
                                        className="tissue-germ-layer-bubble"
                                        key={tissueType}
                                        href={`/tissue-overview/?tissue_type=${formUrlEncode(tissueType)}`}
                                        data-tip={bubbleLabel}
                                        aria-label={bubbleLabel}
                                        style={bubbleStyle}>
                                        {bubbleIconSrc ? (
                                            <i
                                                className="tissue-germ-layer-bubble-icon"
                                                style={{
                                                    WebkitMaskImage: `url(${bubbleIconSrc})`,
                                                    maskImage: `url(${bubbleIconSrc})`,
                                                }}
                                            />
                                        ) : null}
                                    </a>
                                );
                            })}
                    </div>
                </div>
            ))}
        </div>
    );
};

// Builds the fixed-order, 5-category chart data array the three Cohort View
// charts below share -- same shape DonorCohortViewChart already expects from
// BrowseDonorVizWrapper.js's Age Groups/Hardy Scale charts (group/value1/
// value1FileCount/total), just with a single ('single' chartType) series.
const buildTissueCategoryChartData = (termsByCategory = {}, totalDonors = 0) =>
    TISSUE_CATEGORY_ORDER.map((category) => {
        const bucket = termsByCategory[category];
        return {
            group: category,
            value1: bucket?.donors || 0,
            value1FileCount: bucket?.files || 0,
            totalFileCount: bucket?.files || 0,
            total: totalDonors,
            field: 'sample_summary.category',
            from: category,
            to: category,
        };
    });

const buildTissueCoverageChartData = (columnTotals = []) => {
    const countsByCategory = {};
    columnTotals.forEach((entry) => {
        const category = entry?.['sample_summary.category'];
        if (category) countsByCategory[category] = entry.counts || {};
    });
    const totalCoverage = TISSUE_CATEGORY_ORDER.reduce(
        (sum, category) => sum + (countsByCategory[category]?.total_coverage || 0),
        0
    );
    return TISSUE_CATEGORY_ORDER.map((category) => {
        const counts = countsByCategory[category] || {};
        return {
            group: category,
            value1: Math.round((counts.total_coverage || 0) * 10) / 10,
            value1FileCount: counts.files || 0,
            totalFileCount: counts.files || 0,
            total: totalCoverage,
            field: 'sample_summary.category',
            from: category,
            to: category,
        };
    });
};

const buildAutolysisScoreChartData = (tissueResults = []) => {
    const countsByScore = {};
    tissueResults.forEach((t) => {
        const score = t?.pathology_summary?.autolysis_score;
        if (score === null || score === undefined) return;
        countsByScore[score] = (countsByScore[score] || 0) + 1;
    });
    return AUTOLYSIS_SCORE_GROUPS.map(({ value, label }) => ({
        group: label,
        value1: countsByScore[value] || 0,
        total: tissueResults.length,
        field: 'pathology_summary.autolysis_score',
        from: value,
        to: value,
    }));
};

// Population-level Cohort View charts -- analogous to BrowseDonorVizWrapper.js's
// Age Groups/Hardy Scale/Donor Sequencing Progress charts, but built around
// tissue category, autolysis score, and per-category coverage instead of the
// donor-oriented demographic fields.
const TissueCohortCharts = ({ fileFilters, session }) => {
    const [tissueCategoryData, setTissueCategoryData] = useState();
    const [coverageData, setCoverageData] = useState();
    const [autolysisScoreData, setAutolysisScoreData] = useState();
    const [categoryLoading, setCategoryLoading] = useState(false);
    const [coverageLoading, setCoverageLoading] = useState(false);
    const [autolysisLoading, setAutolysisLoading] = useState(false);

    useEffect(() => {
        setCategoryLoading(true);
        ajax.load(
            '/bar_plot_aggregations/',
            (resp) => {
                setTissueCategoryData(
                    buildTissueCategoryChartData(resp?.terms, resp?.total?.donors || 0)
                );
                setCategoryLoading(false);
            },
            'POST',
            () => setCategoryLoading(false),
            JSON.stringify({
                search_query_params: fileFilters,
                fields_to_aggregate_for: ['sample_summary.category'],
            }),
            {},
            null
        );
    }, [fileFilters, session]);

    useEffect(() => {
        setCoverageLoading(true);
        ajax.load(
            '/data_matrix_aggregations/',
            (resp) => {
                setCoverageData(buildTissueCoverageChartData(resp?.column_totals));
                setCoverageLoading(false);
            },
            'POST',
            () => setCoverageLoading(false),
            JSON.stringify({
                search_query_params: {
                    ...fileFilters,
                    type: ['File'],
                    status: BROWSE_STATUS_VALUES,
                    'dataset!': ['No value'],
                },
                column_agg_fields: ['sample_summary.category'],
                row_agg_fields: ['status'],
                max_bucket_count: 20,
            }),
            {},
            null
        );
    }, [fileFilters, session]);

    useEffect(() => {
        setAutolysisLoading(true);
        ajax.load(
            '/search/?type=Tissue&donor.study=Production&donor.tags=has_released_files&limit=all',
            (resp) => {
                setAutolysisScoreData(buildAutolysisScoreChartData(resp?.['@graph']));
                setAutolysisLoading(false);
            },
            'GET',
            () => setAutolysisLoading(false)
        );
    }, [session]);

    return (
        <div className="donor-cohort-view-chart-container">
            <DonorCohortViewChart
                title="Tissue Category Distribution"
                data={tissueCategoryData}
                chartWidth="auto"
                chartHeight={420}
                chartType="single"
                topStackColor="#30975E"
                xAxisTitle="Tissue category"
                yAxisTitle="# of Donors"
                showBarTooltip={true}
                tooltipTitles={{ crumb: null, left: 'Tissue Category', right: '# of Donors' }}
                showXAxisTitle={true}
                popover={renderTissueCategoryPopover()}
                session={session}
                loading={categoryLoading}
            />

            <DonorCohortViewChart
                title="Autolysis Score Distribution"
                data={autolysisScoreData}
                chartWidth="auto"
                chartHeight={420}
                chartType="single"
                topStackColor="#56A9F5"
                xAxisTitle="Autolysis score"
                yAxisTitle="# of Tissues"
                showBarTooltip={false}
                showXAxisTitle={true}
                popover={renderAutolysisScorePopover()}
                session={session}
                loading={autolysisLoading}
            />

            <DonorCohortViewChart
                title="Coverage per Tissue Category"
                data={coverageData}
                chartWidth="auto"
                chartHeight={420}
                chartType="single"
                topStackColor="#4567CF"
                xAxisTitle="Tissue category"
                yAxisTitle="Total coverage"
                showBarTooltip={true}
                tooltipTitles={{ crumb: null, left: 'Tissue Category', right: 'Total Coverage' }}
                showXAxisTitle={true}
                popover={renderTissueCoveragePopover()}
                session={session}
                loading={coverageLoading}
            />
        </div>
    );
};

export const BrowseTissueVizWrapper = (props) => {
    const { href, session, windowWidth } = props;
    const [toggleViewIndex, setToggleViewIndex] = useState(0);
    const useCompactFor = ['xs', 'sm', 'md', 'xxl'];

    // The Ischemic Time/Autolysis Score/Target Tissue % tabs below this
    // panel live in their own DotRouter and only change `href`'s hash
    // fragment (e.g. "#tissue-heatmap.autolysis-score") when clicked --
    // `url.parse(href, true).query` (what the aggregation requests below are
    // actually built from) never includes the hash, so that click doesn't
    // change the query these need. Depending on the raw `href` string anyway
    // re-ran those effects on every such click, flashing back to loading
    // placeholders and re-fetching identical data. Depending on just the
    // query-string portion (search) skips that.
    const hrefSearch = useMemo(() => url.parse(href).search || '', [href]);

    // Shared by TissueGermLayerPanel and TissueCohortCharts -- both need the
    // same File-mapped, tissue-population-filtered query params.
    const fileFilters = useMemo(() => {
        const hrefParts = url.parse(href, true);
        const hrefQuery = normalizeQueryValuesForStringify(_.clone(hrefParts.query));
        delete hrefQuery.limit;
        delete hrefQuery.field;
        ChartDataController.transformFilterDonorToFile(hrefQuery, 'tissue');
        return hrefQuery;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hrefSearch, session]);

    return (
        <div className="row browse-viz-container tissue-viz-container">
            <div className="stats-column col-auto">
                <BrowseSummaryStatsViewer
                    {...{ session, href, windowWidth, useCompactFor }}
                    mapping="tissue"
                />
                <IconToggle
                    options={[
                        {
                            title: (
                                <React.Fragment>
                                    <i className="icon fas icon-fas icon-lungs me-1" />{' '}
                                    Tissue View
                                </React.Fragment>
                            ),
                            dataTip: 'Toggle tissue view',
                            btnCls: 'w-100 btn-sm',
                            onClick: () => setToggleViewIndex(0),
                        },
                        {
                            title: (
                                <React.Fragment>
                                    <i className="icon fas icon-fas icon-users me-1" />{' '}
                                    Cohort View
                                </React.Fragment>
                            ),
                            dataTip: 'Toggle cohort view',
                            btnCls: 'w-100 btn-sm',
                            onClick: () => setToggleViewIndex(1),
                        },
                    ]}
                    activeIdx={toggleViewIndex}
                    divCls="view-toggle p-1"
                />
            </div>
            <div className="col ps-0">
                {toggleViewIndex === 0 ? (
                    <TissueGermLayerPanel fileFilters={fileFilters} session={session} />
                ) : (
                    <TissueCohortCharts fileFilters={fileFilters} session={session} />
                )}
            </div>
        </div>
    );
};
