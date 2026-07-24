'use strict';

import React, { useState, useEffect, useMemo } from 'react';
import url from 'url';
import _ from 'underscore';
import { IconToggle } from '@hms-dbmi-bgm/shared-portal-components/es/components/forms/components/Toggle';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { normalizeQueryValuesForStringify } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/search-filters';
import { BrowseSummaryStatsViewer } from './BrowseSummaryStatController';
import { ChartDataController } from '../../viz/chart-data-controller';

// Groups the categories returned by item_utils/tissue.py::get_category() into
// the 4 display rows the germ-layer panel has always shown.
const GERM_LAYER_LABELS = [
    { key: 'ecto', label: 'ECTO', categories: ['Ectoderm'] },
    { key: 'meso', label: 'MESO', categories: ['Mesoderm'] },
    { key: 'endo', label: 'ENDO', categories: ['Endoderm'] },
    { key: 'germ-clin', label: 'GERM/CLIN', categories: ['Germ Cells', 'Clinically Accessible'] },
];

// Exported for unit testing.
export const countTissueTypesByGermLayer = (tissueCategoryByTerm = {}) => {
    const countsByCategory = _.countBy(Object.values(tissueCategoryByTerm), (c) => c);
    return GERM_LAYER_LABELS.map(({ key, label, categories }) => {
        const count = categories.reduce((sum, c) => sum + (countsByCategory[c] || 0), 0);
        return { key, label, count };
    });
};

const TissueGermLayerPanel = ({ href, session }) => {
    const [loading, setLoading] = useState(true);
    const [germLayerGroups, setGermLayerGroups] = useState(
        GERM_LAYER_LABELS.map(({ key, label }) => {
            return { key, label, count: 0 };
        })
    );

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
            {germLayerGroups.map(({ key, label, count }) => (
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
                            Array.from({ length: count }).map((_unused, i) => (
                                // eslint-disable-next-line react/no-array-index-key
                                <div className="tissue-germ-layer-bubble" key={i} />
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
