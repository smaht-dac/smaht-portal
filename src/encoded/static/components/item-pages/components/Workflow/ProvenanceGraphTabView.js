'use strict';

import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import memoize from 'memoize-one';
import Graph, { GraphParser, parseAnalysisSteps, parseBasicIOAnalysisSteps } from '@hms-dbmi-bgm/react-workflow-viz';
import { console } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { WorkflowGraphSectionControls, WorkflowGraphSection } from './WorkflowGraphSectionControls';
import { FullHeightCalculator } from './../FullHeightCalculator';
import { ProvenanceGraphOptionsStateController } from './ProvenanceGraphOptionsStateController';

export const ProvenanceGraphTabView = React.memo(function ProvenanceGraphTabView(props){
    const {
        heading = <span>Provenance</span>,
        graphSteps = null,
        height: fullVizSpaceHeight,
        windowWidth,
        toggleAllRuns,
        onToggleShowDetailsInPopup,
        showDetailsInPopup,
        includeAllRunsInSteps,
        isLoadingGraphSteps,
        rowSpacingType,
        parsingOptionsForControls, parsingOptsForGraph,
        anyGroupNodes,
        renderNodeElement, renderDetailPane, isNodeCurrentContext,
        onParsingOptChange, onRowSpacingTypeSelect,
        context
    } = props;
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);

        return () => {
            setMounted(false);
        };
    }, []);

    if (!Array.isArray(graphSteps) || graphSteps.length === 0){
        return (
            <div>
                <h3 className="tab-section-title container-wide">
                    { heading }
                </h3>
                <hr className="tab-section-title-horiz-divider mb-5"/>
                <div className="container-wide text-center">
                    { isLoadingGraphSteps?
                        <i className="icon icon-fw icon-circle-notch icon-spin fas text-secondary icon-2x"/>
                        :
                        <h5 className="text-400">
                            No steps available
                        </h5>
                    }
                </div>
            </div>
        );
    }

    const lastStep = graphSteps[graphSteps.length - 1];
    const graphProps = {
        rowSpacingType,
        minimumHeight: fullVizSpaceHeight || 300,
        renderNodeElement, renderDetailPane, isNodeCurrentContext,
        context
    };

    return <WorkflowGraphSection {..._.omit(props, 'graphSteps')} mounted={mounted} width={windowWidth} steps={graphSteps} />
});

ProvenanceGraphTabView.getTabObject = function(props){
    const { windowWidth, windowHeight, isLoadingGraphSteps, graphSteps } = props;
    const stepsExist = Array.isArray(graphSteps) && graphSteps.length > 0;
    let icon;
    if (isLoadingGraphSteps){
        icon = <i className="icon icon-circle-notch icon-spin fas icon-fw"/>;
    } else if (!stepsExist){
        icon = <i className="icon icon-times fas icon-fw"/>;
    } else {
        icon = <i className="icon icon-sitemap icon-rotate-90 fas icon-fw"/>;
    }
    return {
        'tab' : (
            <React.Fragment>
                { icon }
                <span>Provenance</span>
            </React.Fragment>
        ),
        'key' : 'provenance',
        'disabled'  : false,
        'content' : (
            <FullHeightCalculator windowHeight={windowHeight} windowWidth={windowWidth}>
                <ProvenanceGraphOptionsStateController {...props}>
                    <ProvenanceGraphTabView />
                </ProvenanceGraphOptionsStateController>
            </FullHeightCalculator>
        )
    };
};
