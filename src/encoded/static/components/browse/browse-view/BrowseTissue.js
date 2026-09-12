'use strict';

import React, { useState, useEffect, useRef } from 'react';
import ReactTooltip from 'react-tooltip';
import { Alerts } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts';
import { IconToggle } from '@hms-dbmi-bgm/shared-portal-components/es/components/forms/components/Toggle';
import { BrowseTissueVizWrapper } from './BrowseTissueVizWrapper';
import { BrowseTissueHeatmapTable } from './BrowseTissueHeatmapTable';

// How long the one-time border-flash intro (see .tissue-detail-mode-toggle--intro
// in _search.scss) plays before this toggle settles back into its normal,
// deliberately understated look.
const INTRO_HIGHLIGHT_DURATION_MS = 2200;

// Browse Tissue Body Component
export const BrowseTissueBody = (props) => {
    const { alerts, href, session } = props;
    // Lifted up from BrowseTissueVizWrapper so the Basic/Advanced sub-toggle
    // can sit next to this header's own title instead of inside the
    // tissue/cohort content below -- toggleViewIndex is still passed down
    // since Basic/Advanced only makes sense while Tissue View is active.
    const [toggleViewIndex, setToggleViewIndex] = useState(1);
    const [tissueDetailModeIndex, setTissueDetailModeIndex] = useState(0);
    const [showIntroHighlight, setShowIntroHighlight] = useState(false);
    // Guards the flash to the very first time Tissue View activates -- it
    // stays this minimal/borderless the rest of the session, so it should
    // only ever call attention to itself once, not every time someone
    // toggles back to Tissue View.
    const hasPlayedIntroHighlight = useRef(false);

    // The toggle's data-tip attributes (react-tooltip's static-attribute
    // API) only take effect on nodes present at the tooltip's last build --
    // since this toggle only exists in the DOM once toggleViewIndex flips to
    // Tissue View, its two buttons need an explicit rebuild once they mount.
    useEffect(() => {
        if (toggleViewIndex !== 0) return;
        ReactTooltip.rebuild();
        if (hasPlayedIntroHighlight.current) return;
        hasPlayedIntroHighlight.current = true;
        setShowIntroHighlight(true);
        const timer = setTimeout(() => setShowIntroHighlight(false), INTRO_HIGHLIGHT_DURATION_MS);
        return () => clearTimeout(timer);
    }, [toggleViewIndex]);

    return (
        <>
            <div className="browse-summary-header-row">
                <h2 className="browse-summary-header">SMaHT Tissue Summary</h2>
                {toggleViewIndex === 0 ? (
                    <IconToggle
                        options={[
                            {
                                title: <i className="icon fas icon-fas icon-compress" />,
                                dataTip: 'Basic View',
                                btnCls: 'btn-sm',
                                onClick: () => setTissueDetailModeIndex(0),
                            },
                            {
                                title: <i className="icon fas icon-fas icon-expand" />,
                                dataTip: 'Advanced View',
                                btnCls: 'btn-sm',
                                onClick: () => setTissueDetailModeIndex(1),
                            },
                        ]}
                        activeIdx={tissueDetailModeIndex}
                        divCls={
                            'tissue-detail-mode-toggle' +
                            (showIntroHighlight ? ' tissue-detail-mode-toggle--intro' : '')
                        }
                    />
                ) : null}
            </div>
            <Alerts alerts={alerts} className="mt-2" />
            <BrowseTissueVizWrapper
                {...props}
                mapping="tissue"
                toggleViewIndex={toggleViewIndex}
                setToggleViewIndex={setToggleViewIndex}
                tissueDetailModeIndex={tissueDetailModeIndex}
            />
            <hr />
            <BrowseTissueHeatmapTable href={href} session={session} />
        </>
    );
};
