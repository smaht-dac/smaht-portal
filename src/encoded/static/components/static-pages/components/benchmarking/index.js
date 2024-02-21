import React, { useContext, useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { BenchmarkingLayout, HashBasedTabController } from './BenchmarkingUI';
import { BenchmarkingDataMap } from './BenchmarkingDataMap';
import { BenchmarkingUINav } from './BenchmarkingNav';

/**
 * In order to be used in static sections, the following componentes MUST be imported
 * as placeholders in /src/encoded/static/components/static-pages/placeholders/index.js
 */

export const BenchmarkingUI = (props) => {
    const { children, href } = props;

    // Note: each child needs to be passed schemas, session, facets, href, and context
    return (
        <div className="benchmarking-ui-container row">
            <BenchmarkingUINav {...{ href }} />
            <div className="col-12 col-lg-10 pl-2">{children}</div>
        </div>
    );
};

export const COLO829Data = ({ schemas, session, facets, href, context }) => {
    const colo829TabMapArray = BenchmarkingDataMap.COLO829?.tabMapArray;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            showBamQCLink={true}
            title="COLO829 Cell Line Data"
            description="COLO829 (COLO829T) is a metastatic melanoma cancer cell line, which has a matched normal lymphoblast cell line, COLO892BL, derived from the same individual. For benchmarking analysis, COLO829T cells were mixed with COLO829BL cells at a mixture ratio of 1:50 (COLO829BLT50).">
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                controllerId="COLO829-Tab-Renderer"
                tabMapArray={colo829TabMapArray}
            />
        </BenchmarkingLayout>
    );
};

export const HapMapData = ({ schemas, session, facets, href, context }) => {
    const hapMapTabMapArray = BenchmarkingDataMap.HapMap?.tabMapArray;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title="HapMap Cell Line Data"
            description="">
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                controllerId="HapMap-Tab-Renderer"
                tabMapArray={hapMapTabMapArray}
            />
        </BenchmarkingLayout>
    );
};

export const IPSCFibroblastData = ({
    schemas,
    session,
    facets,
    href,
    context,
}) => {
    const iPSCTabMapArray = BenchmarkingDataMap.iPScFibroblasts?.tabMapArray;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title="iPSC Cell Line Data"
            description="">
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                controllerId="IPSC-Tab-Renderer"
                tabMapArray={iPSCTabMapArray}
            />
        </BenchmarkingLayout>
    );
};

// TODO: Not in use currently
export const BrainData = ({ schemas, session, facets, href, context }) => {
    const brainTabMapArray = BenchmarkingDataMap.Brain?.tabMapArray;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title="Brain Primary Tissue Data"
            description="">
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                controllerId="Brain-Tab-Renderer"
                tabMapArray={brainTabMapArray}
            />
        </BenchmarkingLayout>
    );
};

// TODO: Not in use currently
export const SkinData = ({ schemas, session, facets, href, context }) => {
    const skinTabMapArray = BenchmarkingDataMap.Skin?.tabMapArray;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title="Skin Primary Tissue Data"
            description="">
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                controllerId="Skin-Tab-Renderer"
                tabMapArray={skinTabMapArray}
            />
        </BenchmarkingLayout>
    );
};

export const LiverData = ({ schemas, session, facets, href, context }) => {
    const liverTabMapArray = BenchmarkingDataMap.Liver?.tabMapArray;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title="Liver Primary Tissue Data"
            description="">
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                controllerId="Liver-Tab-Renderer"
                tabMapArray={liverTabMapArray}
            />
        </BenchmarkingLayout>
    );
};

export const LungData = ({ schemas, session, facets, href, context }) => {
    const lungTabMapArray = BenchmarkingDataMap.Lung?.tabMapArray;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title="Lung Primary Tissue Data"
            description="">
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                controllerId="Lung-Tab-Renderer"
                tabMapArray={lungTabMapArray}
            />
        </BenchmarkingLayout>
    );
};

export const ColonData = ({ schemas, session, facets, href, context }) => {
    const HapMapTabMapArray = BenchmarkingDataMap.Colon?.tabMapArray;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title="Colon Primary Tissue Data"
            description="">
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                controllerId="Colon-Tab-Renderer"
                tabMapArray={HapMapTabMapArray}
            />
        </BenchmarkingLayout>
    );
};

// TODO: Not in use currently
export const HeartData = ({ schemas, session, facets, href, context }) => {
    const heartTabMapArray = BenchmarkingDataMap.Heart?.tabMapArray;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title="Heart Primary Tissue Data"
            description="">
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                controllerId="Heart-Tab-Renderer"
                tabMapArray={heartTabMapArray}
            />
        </BenchmarkingLayout>
    );
};
