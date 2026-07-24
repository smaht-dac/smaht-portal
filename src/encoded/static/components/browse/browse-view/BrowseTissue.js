'use strict';

import React from 'react';
import { Alerts } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts';
import { BrowseTissueVizWrapper } from './BrowseTissueVizWrapper';
import { BrowseTissueHeatmapTable } from './BrowseTissueHeatmapTable';

// Browse Tissue Body Component
export const BrowseTissueBody = (props) => {
    const { alerts, href, session } = props;
    return (
        <>
            <h2 className="browse-summary-header">SMaHT Tissue Summary</h2>
            <Alerts alerts={alerts} className="mt-2" />
            <BrowseTissueVizWrapper {...props} mapping="tissue" />
            <hr />
            <BrowseTissueHeatmapTable href={href} session={session} />
        </>
    );
};
