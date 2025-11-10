import React, { useContext, useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { BenchmarkingLayout, HashBasedTabController } from './BenchmarkingUI';
import { BenchmarkingDataMap } from './BenchmarkingDataMap';
import { BenchmarkingUINav } from './BenchmarkingNav';
import SlidingSidebarLayout from '../../../shared/SlidingSidebarLayout';
import { useUserDownloadAccess } from '../../../util/hooks';

/**
 * In order to be used in static sections, the following componentes MUST be imported
 * as placeholders in /src/encoded/static/components/static-pages/placeholders/index.js
 */

export const BenchmarkingUI = (props) => {
    console.log('BenchmarkingUI props:', props);
    const [showNav, setShowNav] = useState(true);
    const { children, href, session } = props;

    // Note: each child needs to be passed schemas, session, facets, href, and context
    return (
        <SlidingSidebarLayout>
            <BenchmarkingUINav {...{ showNav, setShowNav, href }} />
            <>{children}</>
        </SlidingSidebarLayout>
    );
};

export const COLO829Data = (props) => {
    const { schemas, session, facets, href, context } = props;
    const colo829TabMapArray = BenchmarkingDataMap.COLO829?.tabMapArray;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title={BenchmarkingDataMap.COLO829?.title}
            description={BenchmarkingDataMap.COLO829?.description}
            callout={BenchmarkingDataMap.COLO829?.callout}>
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                deniedAccessPopoverType="login"
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
            title={BenchmarkingDataMap.HapMap?.title}
            description={BenchmarkingDataMap.HapMap?.description}>
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                deniedAccessPopoverType="login"
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
    const userDownloadAccess = useUserDownloadAccess(session);
    const hasRestrictedAccess = userDownloadAccess?.['restricted'] || false;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title={BenchmarkingDataMap.iPScFibroblasts?.title}
            description={BenchmarkingDataMap.iPScFibroblasts?.description}
            callout={BenchmarkingDataMap.iPScFibroblasts?.callout}>
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                deniedAccessPopoverType={'protected'}
                controllerId="IPSC-Tab-Renderer"
                tabMapArray={iPSCTabMapArray}
            />
        </BenchmarkingLayout>
    );
};

export const Donor1Data = ({ schemas, session, facets, href, context }) => {
    const donor1TabMapArray = BenchmarkingDataMap.Donor1?.tabMapArray;
    const userDownloadAccess = useUserDownloadAccess(session);
    const hasRestrictedAccess = userDownloadAccess?.['restricted'] || false;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title={BenchmarkingDataMap.Donor1?.title}
            description={BenchmarkingDataMap.Donor1?.description}>
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                deniedAccessPopoverType={'protected'}
                controllerId="Donor1-Tab-Renderer"
                tabMapArray={donor1TabMapArray}
            />
        </BenchmarkingLayout>
    );
};

export const Donor2Data = ({ schemas, session, facets, href, context }) => {
    const donor2TabMapArray = BenchmarkingDataMap.Donor2?.tabMapArray;
    const userDownloadAccess = useUserDownloadAccess(session);
    const hasRestrictedAccess = userDownloadAccess?.['restricted'] || false;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title={BenchmarkingDataMap.Donor2?.title}
            description={BenchmarkingDataMap.Donor2?.description}>
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                deniedAccessPopoverType={'protected'}
                controllerId="Donor2-Tab-Renderer"
                tabMapArray={donor2TabMapArray}
            />
        </BenchmarkingLayout>
    );
};

export const Donor3Data = ({ schemas, session, facets, href, context }) => {
    const donor3TabMapArray = BenchmarkingDataMap.Donor3?.tabMapArray;
    const userDownloadAccess = useUserDownloadAccess(session);
    const hasRestrictedAccess = userDownloadAccess?.['restricted'] || false;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title={BenchmarkingDataMap.Donor3?.title}
            description={BenchmarkingDataMap.Donor3?.description}>
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                deniedAccessPopoverType={'protected'}
                controllerId="Donor3-Tab-Renderer"
                tabMapArray={donor3TabMapArray}
            />
        </BenchmarkingLayout>
    );
};

export const Donor4Data = ({ schemas, session, facets, href, context }) => {
    const donor4TabMapArray = BenchmarkingDataMap.Donor4?.tabMapArray;
    const userDownloadAccess = useUserDownloadAccess(session);
    const hasRestrictedAccess = userDownloadAccess?.['restricted'] || false;

    return (
        <BenchmarkingLayout
            {...{ schemas }}
            title={BenchmarkingDataMap.Donor4?.title}
            description={BenchmarkingDataMap.Donor4?.description}>
            <HashBasedTabController
                {...{ schemas, session, facets, href, context }}
                deniedAccessPopoverType={
                    hasRestrictedAccess ? null : 'protected'
                }
                controllerId="Donor4-Tab-Renderer"
                tabMapArray={donor4TabMapArray}
            />
        </BenchmarkingLayout>
    );
};
