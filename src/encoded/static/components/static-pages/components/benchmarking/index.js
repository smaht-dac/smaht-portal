import React, { useContext, useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
    BenchmarkingLayout,
    BenchmarkingUINav,
    HashBasedTabController,
} from './BenchmarkingUI';
import { BenchmarkingDataMap } from './BenchmarkingDataMap';

/**
 * In order to be used in static sections, the following componentes MUST be imported
 * as placeholders in /src/encoded/static/components/static-pages/placeholders/index.js
 */

export const BenchmarkingUI = (props) => {
    const { children, href } = props;

    // Note: each child needs to be passed schemas, session, facets, href, and context
    return (
        <div className="row">
            <div className="d-none d-lg-flex col-lg-2 border-right">
                <BenchmarkingUINav {...{ href }} />
            </div>
            <div className="col-12 col-lg-10 pl-2">{children}</div>
        </div>
    );
};

export const COLO829Data = ({ schemas, session, facets, href, context }) => {
    const colo829TabMapArray = BenchmarkingDataMap.COLO829.tabMapArray;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title="COLO829 Cell Line Data"
            description="For benchmarking analysis, COLO829 (melanoma) is mixed with
                COLO829BL (lymphoblast), derived from the same individual, at
                known mixture ratios of 1:10, 1:50, and 1:200.">
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                controllerId="COLO829-Tab-Renderer"
                tabMapArray={colo829TabMapArray}
            />
        </BenchmarkingLayout>
    );
};

export const HapMapData = ({ schemas, session, facets, href, context }) => {
    const hapMapTabMapArray = BenchmarkingDataMap.HapMap.tabMapArray;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title="HapMap Cell Line Data"
            description="<COPY NEEDED>">
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
    const iPSCTabMapArray = BenchmarkingDataMap.iPScFibroblasts.tabMapArray;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title="iPSc Cell Line Data"
            description="<COPY NEEDED>">
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                controllerId="IPSC-Tab-Renderer"
                tabMapArray={iPSCTabMapArray}
            />
        </BenchmarkingLayout>
    );
};

export const BrainData = ({ schemas, session, facets, href, context }) => {
    const brainTabMapArray = BenchmarkingDataMap.Brain.tabMapArray;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title="Brain Primary Tissue Data"
            description="<COPY NEEDED>">
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                controllerId="Brain-Tab-Renderer"
                tabMapArray={brainTabMapArray}
            />
        </BenchmarkingLayout>
    );
};

export const SkinData = ({ schemas, session, facets, href, context }) => {
    const skinTabMapArray = BenchmarkingDataMap.Skin.tabMapArray;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title="Skin Primary Tissue Data"
            description="<COPY NEEDED>">
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                controllerId="Skin-Tab-Renderer"
                tabMapArray={skinTabMapArray}
            />
        </BenchmarkingLayout>
    );
};

export const LiverData = ({ schemas, session, facets, href, context }) => {
    const liverTabMapArray = BenchmarkingDataMap.Liver.tabMapArray;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title="Liver Primary Tissue Data"
            description="<COPY NEEDED>">
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                controllerId="Liver-Tab-Renderer"
                tabMapArray={liverTabMapArray}
            />
        </BenchmarkingLayout>
    );
};

export const ColonData = ({ schemas, session, facets, href, context }) => {
    const HapMapTabMapArray = BenchmarkingDataMap.Colon.tabMapArray;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title="Colon Primary Tissue Data"
            description="<COPY NEEDED>">
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                controllerId="Colon-Tab-Renderer"
                tabMapArray={HapMapTabMapArray}
            />
        </BenchmarkingLayout>
    );
};

export const HeartData = ({ schemas, session, facets, href, context }) => {
    const heartTabMapArray = BenchmarkingDataMap.Heart.tabMapArray;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title="Heart Primary Tissue Data"
            description="<COPY NEEDED>">
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                controllerId="Heart-Tab-Renderer"
                tabMapArray={heartTabMapArray}
            />
        </BenchmarkingLayout>
    );
};
