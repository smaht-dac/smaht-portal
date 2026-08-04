'use strict';

import React, { useState, useEffect, useMemo } from 'react';
import url from 'url';
import _ from 'underscore';
import ReactTooltip from 'react-tooltip';
import { IconToggle } from '@hms-dbmi-bgm/shared-portal-components/es/components/forms/components/Toggle';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { normalizeQueryValuesForStringify } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/search-filters';
import { BrowseSummaryStatsViewer } from './BrowseSummaryStatController';
import { ChartDataController } from '../../viz/chart-data-controller';
import { formUrlEncode } from './BrowseTissueHeatmapTable';

// Groups the categories returned by item_utils/tissue.py::get_category() into
// the 4 display rows the germ-layer panel has always shown.
const GERM_LAYER_LABELS = [
    { key: 'ecto', label: 'ECTO', categories: ['Ectoderm'] },
    { key: 'meso', label: 'MESO', categories: ['Mesoderm'] },
    { key: 'endo', label: 'ENDO', categories: ['Endoderm'] },
    { key: 'germ-clin', label: 'GERM/CLIN', categories: ['Germ Cells', 'Clinically Accessible'] },
];

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

const TissueGermLayerPanel = ({ href, session }) => {
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

    // The Ischemic Time/Autolysis Score/Target Tissue % tabs below this
    // panel live in their own DotRouter and only change `href`'s hash
    // fragment (e.g. "#tissue-heatmap.autolysis-score") when clicked --
    // `url.parse(href, true).query` (what this aggregation request is
    // actually built from) never includes the hash, so that click doesn't
    // change the query this panel needs. Depending on the raw `href` string
    // anyway re-ran this effect on every such click, flashing back to the
    // loading placeholders and re-fetching identical data. Depending on just
    // the query-string portion (search) skips that.
    const hrefSearch = useMemo(() => url.parse(href).search || '', [href]);

    useEffect(() => {
        setLoading(true);
        const hrefParts = url.parse(href, true);
        const hrefQuery = normalizeQueryValuesForStringify(_.clone(hrefParts.query));
        delete hrefQuery.limit;
        delete hrefQuery.field;
        ChartDataController.transformFilterDonorToFile(hrefQuery, 'tissue');

        const requestBody = {
            search_query_params: hrefQuery,
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
    }, [hrefSearch, session]);

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
                            tissueTypes.map((tissueType) => (
                                <a
                                    className="tissue-germ-layer-bubble"
                                    key={tissueType}
                                    href={`/tissue-overview/?tissue_type=${formUrlEncode(tissueType)}`}
                                    data-tip={tissueType}
                                    aria-label={tissueType}
                                />
                            ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

export const BrowseTissueVizWrapper = (props) => {
    const { href, session, windowWidth } = props;
    const [toggleViewIndex, setToggleViewIndex] = useState(1);
    const useCompactFor = ['xs', 'sm', 'md', 'xxl'];

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
                <TissueGermLayerPanel href={href} session={session} />
            </div>
        </div>
    );
};
