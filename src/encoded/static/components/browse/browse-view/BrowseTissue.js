'use strict';

import React from 'react';
import { Alerts } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts';
import { BrowseTissueVizWrapper } from './BrowseTissueVizWrapper';
import { BrowseTissueHeatmapTable } from './BrowseTissueHeatmapTable';

// Browse Tissue Body Component
// NOTE: the stat card, germ layer panel, and heatmap table below all render
// dummy/placeholder data for now; wire them up to real aggregation
// endpoints once Tissue-level summary data is available server-side.
export const BrowseTissueBody = (props) => {
    const { alerts } = props;
    return (
        <>
            <h2 className="browse-summary-header">SMaHT Tissue Summary</h2>
            <Alerts alerts={alerts} className="mt-2" />
            <BrowseTissueVizWrapper />
            <hr />
            <BrowseTissueHeatmapTable />
        </>
    );
};
