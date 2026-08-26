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
// TissueTypeView.js's identical constant -- keeps the GCC chart's file-count
// fetch consistent with the rest of the page's population instead of
// counting every File regardless of release status.
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

// Same per-value table layout as ProtectedDonorViewDataCards.js's Hardy
// Scale popover -- the x-axis now shows the raw score (matching that
// chart's own numeric axis convention), so the None/Mild/Moderate/Severe
// labels live here instead of doubling as tick text.
export const renderAutolysisScorePopover = (customId) => (
    <Popover id={customId || 'chart-info-popover-autolysis-score'} className="w-auto description-definitions-popover">
        <Popover.Body className="p-0">
            <table className="table">
                <thead>
                    <tr><th className="text-left px-4" colSpan={2}>Autolysis Score Distribution (by Tissue)</th></tr>
                </thead>
                <tbody>
                    <tr className="w-100">
                        <td className="fw-light text-left px-4 py-3" colSpan={2}>
                            Shows the number of tissue specimens by autolysis score. Each specimen
                            is counted once, using the highest score across its pathology reports.
                            <br />
                            <i>Score meanings:</i>
                        </td>
                    </tr>
                    {AUTOLYSIS_SCORE_GROUPS.map(({ value, label }) => (
                        <tr key={value}>
                            <td className="fs-5 align-middle text-center index-cell">{value}</td>
                            <td className="text-left">{label}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </Popover.Body>
    </Popover>
);

export const renderSubmissionCenterPopover = (customId) => (
    <Popover id={customId || 'chart-info-popover-submission-center'} className="w-auto description-definitions-popover">
        <Popover.Body className="p-0">
            <table className="table">
                <thead>
                    <tr><th className="text-left">GCC Distribution (by Tissue Sample)</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td className="text-left">
                            Shows the number of tissue sample records processed by each Genome
                            Characterization Center (GCC). Other center types (e.g. Tissue
                            Procurement Centers) are not shown.
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

const buildAutolysisScoreChartData = (tissueResults = []) => {
    const countsByScore = {};
    tissueResults.forEach((t) => {
        const score = t?.pathology_summary?.autolysis_score;
        if (score === null || score === undefined) return;
        countsByScore[score] = (countsByScore[score] || 0) + 1;
    });
    // `group` is the numeric score itself (matching BrowseDonorVizWrapper.js's
    // Hardy Scale chart, whose x-axis is also its own raw scale value) --
    // the None/Mild/Moderate/Severe labels move to the info popover instead
    // of doubling as axis tick text.
    return AUTOLYSIS_SCORE_GROUPS.map(({ value }) => ({
        group: String(value),
        value1: countsByScore[value] || 0,
        total: tissueResults.length,
        field: 'pathology_summary.autolysis_score',
        from: value,
        to: value,
    }));
};

// Tissue.submission_centers is always the procuring TPC (this program routes
// physical tissue procurement through a single TPC, confirmed against real
// data -- that dimension has no real variation to chart). The GCC diversity
// is a level down, on the individual TissueSample records a TPC's tissue
// gets aliquoted/processed into (see TissueTypeView.js's own
// `sample.submission_centers?.[0]?.display_title` on TissueSample, which
// already shows real TPC/GCC mixes like "NDRI TPC"/"UWSC GCC"/"BROAD GCC").
// Built from a `bar_plot_aggregations` bucket count (unlike Autolysis Score,
// which needs the full Tissue records for pathology_summary) since
// submission_centers.display_title is embedded/facetable on TissueSample --
// no need to pull every record client-side just to count them.
//
// Only GCC-suffixed centers are kept -- every submission_centers value ends
// in its role suffix (GCC/TPC/TTD/DAC/OC, confirmed against real fixture
// data; see helpers.js's getGccFilesBrowseHref, which uses this same
// `endsWith('GCC')` check), and this chart exists specifically to compare
// GCCs. TPC, TTD, DAC, etc. are a different kind of center entirely, not
// just noise to threshold away.
// `fileCountsByCenter` (from a separate type=File aggregation on
// sequencing_center.display_title -- see TissueCohortCharts) feeds the
// tooltip's "Files" line/link; the bar height itself stays the TissueSample
// count from `termsByCenter`, matching what the chart's own title/axis say.
const buildSubmissionCenterChartData = (termsByCenter = {}, fileCountsByCenter = {}) => {
    const gccEntries = Object.entries(termsByCenter).filter(([center]) =>
        center?.trim().endsWith('GCC')
    );
    const total = gccEntries.reduce((sum, [, bucket]) => sum + (bucket?.doc_count || 0), 0);
    return gccEntries
        .map(([center, bucket]) => ({
            group: center,
            value1: bucket?.doc_count || 0,
            value1FileCount: fileCountsByCenter[center] || 0,
            totalFileCount: fileCountsByCenter[center] || 0,
            total,
            field: 'sequencing_center.display_title',
            from: center,
            to: center,
        }))
        .sort((a, b) => b.value1 - a.value1 || a.group.localeCompare(b.group, undefined, { numeric: true }));
};

// Population-level Cohort View charts -- analogous to BrowseDonorVizWrapper.js's
// Age Groups/Hardy Scale/Donor Sequencing Progress charts, but built around
// tissue category, autolysis score, and submitting center instead of the
// donor-oriented demographic fields.
const TissueCohortCharts = ({ fileFilters, session }) => {
    const [tissueCategoryData, setTissueCategoryData] = useState();
    const [categoryLoading, setCategoryLoading] = useState(false);
    const [tissueResults, setTissueResults] = useState([]);
    const [tissueResultsLoading, setTissueResultsLoading] = useState(false);
    const [submissionCenterTerms, setSubmissionCenterTerms] = useState();
    const [submissionCenterLoading, setSubmissionCenterLoading] = useState(false);

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

    // Only Autolysis Score needs full Tissue records (pathology_summary
    // isn't a bucketable stored field, unlike sample_summary.category or
    // TissueSample's submission_centers below).
    useEffect(() => {
        setTissueResultsLoading(true);
        ajax.load(
            '/search/?type=Tissue&donor.study=Production&donor.tags=has_released_files&limit=all',
            (resp) => {
                setTissueResults(resp?.['@graph'] || []);
                setTissueResultsLoading(false);
            },
            'GET',
            () => {
                setTissueResults([]);
                setTissueResultsLoading(false);
            }
        );
    }, [session]);

    // TissueSample rather than Tissue -- Tissue.submission_centers is always
    // the procuring TPC (no variation to show, see buildSubmissionCenterChartData's
    // comment); the GCC diversity lives on TissueSample. Filtered to the same
    // released-donor Production population as the other two charts, via
    // sample_sources.donor.study/tags -- added to TissueSample's
    // embedded_list (types/tissue_sample.py) specifically so this filter
    // would be real rather than relying only on the GCC-suffix naming
    // convention (which doesn't itself guarantee "Production").
    useEffect(() => {
        setSubmissionCenterLoading(true);
        ajax.load(
            '/bar_plot_aggregations/',
            (resp) => {
                setSubmissionCenterTerms(resp?.terms);
                setSubmissionCenterLoading(false);
            },
            'POST',
            () => setSubmissionCenterLoading(false),
            JSON.stringify({
                search_query_params: {
                    type: ['TissueSample'],
                    'status!': ['deleted'],
                    'sample_sources.donor.study': ['Production'],
                    'sample_sources.donor.tags': ['has_released_files'],
                },
                fields_to_aggregate_for: ['submission_centers.display_title'],
            }),
            {},
            null
        );
    }, [session]);

    // File counts per GCC, for the GCC chart's tooltip "Files" line/link --
    // a separate File-scoped aggregation (not derivable from the
    // TissueSample-scoped fetch above, which never carries File counts,
    // see visualization.py's bar_plot_chart: `files` is 0 unless the search
    // itself is type=File). Filters by `fileFilters` (the same File-mapped,
    // released-donor population every other chart on this page uses).
    const [submissionCenterFileCounts, setSubmissionCenterFileCounts] = useState({});
    useEffect(() => {
        ajax.load(
            '/bar_plot_aggregations/',
            (resp) => {
                const countsByCenter = {};
                Object.entries(resp?.terms || {}).forEach(([center, bucket]) => {
                    countsByCenter[center] = bucket?.doc_count || 0;
                });
                setSubmissionCenterFileCounts(countsByCenter);
            },
            'POST',
            () => setSubmissionCenterFileCounts({}),
            JSON.stringify({
                search_query_params: {
                    ...fileFilters,
                    type: ['File'],
                    status: BROWSE_STATUS_VALUES,
                    'dataset!': ['No value'],
                },
                fields_to_aggregate_for: ['sequencing_center.display_title'],
            }),
            {},
            null
        );
    }, [fileFilters, session]);

    // Exact-match File browse link factory -- unlike BrowseDonorVizWrapper.js's
    // buildFilesHref (which builds `.from`/`.to` *range* filters for numeric
    // fields like age/hardy_scale), the GCC name and tissue category charts
    // below both group by a plain categorical value, so each just needs a
    // direct equality filter on the corresponding File field. Shared here
    // since both charts need the exact same shape, just a different field.
    const buildCategoricalFilesHref = (field) => (d) =>
        d?.group ? url.format({ pathname: '/browse/', query: { ...fileFilters, [field]: d.group } }) : null;
    // Same field/convention helpers.js's getGccFilesBrowseHref already uses
    // for GCC file links elsewhere in the app.
    const buildSubmissionCenterFilesHref = buildCategoricalFilesHref('sequencing_center.display_title');
    const buildTissueCategoryFilesHref = buildCategoricalFilesHref('sample_summary.category');

    const autolysisScoreData = useMemo(
        () => buildAutolysisScoreChartData(tissueResults),
        [tissueResults]
    );
    const submissionCenterData = useMemo(
        () => buildSubmissionCenterChartData(submissionCenterTerms, submissionCenterFileCounts),
        [submissionCenterTerms, submissionCenterFileCounts]
    );

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
                // eslint-disable-next-line react/jsx-no-bind
                buildFilesHref={buildTissueCategoryFilesHref}
                showXAxisTitle={true}
                popover={renderTissueCategoryPopover()}
                session={session}
                loading={categoryLoading}
            />

            <DonorCohortViewChart
                title="Autolysis Score Distribution (by Tissue)"
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
                loading={tissueResultsLoading}
            />

            <DonorCohortViewChart
                title="GCC Distribution (by Tissue Sample)"
                data={submissionCenterData}
                chartWidth="auto"
                chartHeight={420}
                chartType="horizontal"
                topStackColor="#4567CF"
                xAxisTitle="# of Tissue Samples"
                showYAxisTitle={false}
                showBarTooltip={true}
                tooltipTitles={{ crumb: null, left: 'GCC', right: '# of Tissue Samples' }}
                // eslint-disable-next-line react/jsx-no-bind
                buildFilesHref={buildSubmissionCenterFilesHref}
                showXAxisTitle={true}
                popover={renderSubmissionCenterPopover()}
                session={session}
                loading={submissionCenterLoading}
            />
        </div>
    );
};

export const BrowseTissueVizWrapper = (props) => {
    const { href, session, windowWidth } = props;
    const [toggleViewIndex, setToggleViewIndex] = useState(1);
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
            <div className="col ps-0 tissue-viz-content">
                {/* Both stay mounted (toggled via d-none, not a ternary that
                    unmounts) so switching back to a tab whose data already
                    loaded doesn't re-run its fetch effects from scratch --
                    same reasoning as BrowseTissueHeatmapTable.js's DotRouterTab
                    `cache` prop for its 3 tabs. */}
                <div className={toggleViewIndex === 0 ? '' : 'd-none'}>
                    <TissueGermLayerPanel fileFilters={fileFilters} session={session} />
                </div>
                <div className={toggleViewIndex === 1 ? '' : 'd-none'}>
                    <TissueCohortCharts fileFilters={fileFilters} session={session} />
                </div>
            </div>
        </div>
    );
};
