'use strict';

import React, { useState } from 'react';
import { IconToggle } from '@hms-dbmi-bgm/shared-portal-components/es/components/forms/components/Toggle';
import { BrowseSummaryStat } from './BrowseSummaryStatController';

// TODO: replace with a real /bar_plot_aggregations/ (or similar) fetch once
// Tissue-level summary + germ layer aggregations are available server-side.
const TISSUE_SUMMARY_STATS_DUMMY = {
    files: 151,
    donors: 3,
    tissues: 5,
    assays: 10,
    file_size: '2.5TB',
};

const GERM_LAYER_GROUPS = [
    { key: 'ecto', label: 'ECTO', count: 7 },
    { key: 'meso', label: 'MESO', count: 6 },
    { key: 'endo', label: 'ENDO', count: 5 },
    { key: 'germ-clin', label: 'GERM/CLIN', count: 4 },
];

const TISSUE_STATS_CONTAINER_CLS = 'ms-15 pt-1 d-flex align-items-center';

const TissueGermLayerPanel = () => (
    <div className="tissue-germ-layer-panel">
        {GERM_LAYER_GROUPS.map(({ key, label, count }) => (
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
                    {Array.from({ length: count }).map((_, i) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <div className="tissue-germ-layer-bubble" key={i} />
                    ))}
                </div>
            </div>
        ))}
    </div>
);

export const BrowseTissueVizWrapper = () => {
    const [toggleViewIndex, setToggleViewIndex] = useState(1);

    return (
        <div className="row browse-viz-container tissue-viz-container">
            <div className="stats-column col-auto">
                <div className="browse-summary stats-compact d-flex flex-column mt-2 mb-25 flex-wrap">
                    <BrowseSummaryStat
                        type="File"
                        value={TISSUE_SUMMARY_STATS_DUMMY.files}
                        loading={false}
                        units=""
                        containerCls={TISSUE_STATS_CONTAINER_CLS}
                    />
                    <BrowseSummaryStat
                        type="Donor"
                        value={TISSUE_SUMMARY_STATS_DUMMY.donors}
                        loading={false}
                        units=""
                        containerCls={TISSUE_STATS_CONTAINER_CLS}
                    />
                    <BrowseSummaryStat
                        type="Tissue"
                        value={TISSUE_SUMMARY_STATS_DUMMY.tissues}
                        loading={false}
                        units=""
                        containerCls={TISSUE_STATS_CONTAINER_CLS}
                    />
                    <BrowseSummaryStat
                        type="Assay"
                        value={TISSUE_SUMMARY_STATS_DUMMY.assays}
                        loading={false}
                        units=""
                        containerCls={TISSUE_STATS_CONTAINER_CLS}
                    />
                    <hr />
                    <BrowseSummaryStat
                        type="File Size"
                        value={TISSUE_SUMMARY_STATS_DUMMY.file_size}
                        loading={false}
                        units=""
                        containerCls={TISSUE_STATS_CONTAINER_CLS}
                    />
                </div>
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
                <TissueGermLayerPanel />
            </div>
        </div>
    );
};
