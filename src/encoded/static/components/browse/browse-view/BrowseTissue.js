'use strict';

import React, { useState, useEffect, useRef } from 'react';
import ReactTooltip from 'react-tooltip';
import { Alerts } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts';
import { BrowseTissueVizWrapper } from './BrowseTissueVizWrapper';
import { BrowseTissueHeatmapTable } from './BrowseTissueHeatmapTable';

// How long the one-time border-flash intro (see .tissue-detail-mode-toggle--intro
// in _search.scss) plays before this toggle settles back into its normal,
// deliberately understated look.
const INTRO_HIGHLIGHT_DURATION_MS = 2200;

// The TPC-code/4-letter-code sort toggle next to the Basic/Advanced one is
// built and working but hidden for now -- flip this to bring it back.
// tissueSortModeIndex stays 0 (TPC code order) while it's hidden.
const SHOW_TISSUE_SORT_TOGGLE = false;

// Hand-rolled rather than the shared IconToggle component -- same rendered
// markup/classes IconToggle itself produces (icon-toggle > .flex-grow-1[data-tip]
// > button), but IconToggle doesn't forward a `data-class` per option, which
// is what's needed here to scope the .tissue-detail-mode-toggle-tooltip
// nowrap override to just these toggles' tooltips (react-tooltip reads
// `data-class` off the hovered trigger and merges it into its own shared
// tooltip element's class list) -- see that class in _search.scss for why:
// these short tooltips were wrapping onto 2 lines even though their own box
// had plenty of room, and a global nowrap on every tooltip would've broken
// the several other, genuinely long, sentence-length tooltips elsewhere in
// the app that need to wrap.
const TissueHeaderToggle = ({ options, activeIndex, onChange, highlight = false }) => (
    <div className={'icon-toggle tissue-detail-mode-toggle' + (highlight ? ' tissue-detail-mode-toggle--intro' : '')}>
        {options.map(({ tip, icon }, index) => (
            <div
                className="flex-grow-1"
                key={tip}
                data-tip={tip}
                data-class="tissue-detail-mode-toggle-tooltip">
                <button
                    type="button"
                    // eslint-disable-next-line react/jsx-no-bind
                    onClick={() => onChange(index)}
                    aria-pressed={activeIndex === index}
                    aria-label={tip}
                    className={'btn btn-sm btn-' + (activeIndex === index ? 'primary-dark active pe-none' : 'link')}>
                    <i className={`icon fas icon-fas ${icon}`} />
                </button>
            </div>
        ))}
    </div>
);

// Browse Tissue Body Component
export const BrowseTissueBody = (props) => {
    const { alerts, href, session } = props;
    // Lifted up from BrowseTissueVizWrapper so the Basic/Advanced sub-toggle
    // can sit next to this header's own title instead of inside the
    // tissue/cohort content below -- toggleViewIndex is still passed down
    // since Basic/Advanced only makes sense while Tissue View is active.
    // 0 = Tissue View (the default), 1 = Cohort View.
    const [toggleViewIndex, setToggleViewIndex] = useState(0);
    // Tissue View: 0 = Basic, 1 = Advanced (the default).
    const [tissueDetailModeIndex, setTissueDetailModeIndex] = useState(1);
    const [tissueSortModeIndex, setTissueSortModeIndex] = useState(0);
    // Cohort View: 0 = the summary charts, 1 = the facet chart (the default).
    const [cohortModeIndex, setCohortModeIndex] = useState(1);
    const [showIntroHighlight, setShowIntroHighlight] = useState(false);
    // Guards the flash to the very first time Tissue View activates -- it
    // stays this minimal/borderless the rest of the session, so it should
    // only ever call attention to itself once, not every time someone
    // toggles back to Tissue View.
    const hasPlayedIntroHighlight = useRef(false);

    // The toggles' data-tip attributes (react-tooltip's static-attribute
    // API) only take effect on nodes present at the tooltip's last build --
    // each view has its own toggle(s) that only exist in the DOM while that
    // view is active (Tissue View's Basic/Advanced, Cohort View's charts
    // switch), so their buttons need an explicit rebuild once they mount.
    useEffect(() => {
        ReactTooltip.rebuild();
        if (toggleViewIndex !== 0 || hasPlayedIntroHighlight.current) return undefined;
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
                    <div className="tissue-header-toggles">
                        <TissueHeaderToggle
                            highlight={showIntroHighlight}
                            activeIndex={tissueDetailModeIndex}
                            onChange={setTissueDetailModeIndex}
                            options={[
                                { tip: 'Basic View', icon: 'icon-compress' },
                                { tip: 'Advanced View', icon: 'icon-expand' },
                            ]}
                        />
                        {SHOW_TISSUE_SORT_TOGGLE ? (
                            <TissueHeaderToggle
                                activeIndex={tissueSortModeIndex}
                                onChange={setTissueSortModeIndex}
                                options={[
                                    { tip: 'Sort by TPC code (3A, 3B…)', icon: 'icon-arrow-down-1-9' },
                                    { tip: 'Sort by 4-letter code (ADGL, ADGR…)', icon: 'icon-arrow-down-a-z' },
                                ]}
                            />
                        ) : null}
                    </div>
                ) : (
                    <div className="tissue-header-toggles">
                        <TissueHeaderToggle
                            activeIndex={cohortModeIndex}
                            onChange={setCohortModeIndex}
                            options={[
                                { tip: 'Summary Charts', icon: 'icon-chart-pie' },
                                { tip: 'Facet Chart', icon: 'icon-chart-column' },
                            ]}
                        />
                    </div>
                )}
            </div>
            <Alerts alerts={alerts} className="mt-2" />
            <BrowseTissueVizWrapper
                {...props}
                mapping="tissue"
                toggleViewIndex={toggleViewIndex}
                setToggleViewIndex={setToggleViewIndex}
                tissueDetailModeIndex={tissueDetailModeIndex}
                tissueSortModeIndex={tissueSortModeIndex}
                cohortModeIndex={cohortModeIndex}
            />
            <hr />
            <BrowseTissueHeatmapTable href={href} session={session} />
        </>
    );
};
