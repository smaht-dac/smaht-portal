import React from 'react';

import { AboveTableControlsBase } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/above-table-controls/AboveTableControlsBase';

export const BrowseViewAboveSearchTableControls = React.memo(
    function BrowseViewAboveSearchTableControls(props) {
        const {
            topLeftChildren,
            children,
            isFullscreen,
            windowWidth,
            toggleFullScreen,
            sortBy,
        } = props;

        return (
            <AboveTableControlsBase
                useSmahtLayout
                {...{
                    children,
                    topLeftChildren,
                    isFullscreen,
                    windowWidth,
                    toggleFullScreen,
                    sortBy,
                }}
                panelMap={AboveTableControlsBase.getCustomColumnSelectorPanelMapDefinition(
                    props
                )}></AboveTableControlsBase>
        );
    }
);
