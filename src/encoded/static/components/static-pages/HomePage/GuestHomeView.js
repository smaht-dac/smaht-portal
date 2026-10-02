'use strict';

import React, { useEffect, useState } from 'react';
import _ from 'underscore';
import { Alerts } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts';
import { NotLoggedInAlert } from './../../navigation/components/LoginNavItem';
import SMaHTTimeline from '../../viz/SMaHTTimeline';
import { NotificationsPanel } from './NotificationsPanel';
import { HomepageFigure } from '../../viz/HomepageFigure';

export const GuestHomeView = React.memo(function GuestHomeView(props) {
    const [currentTier, setCurrentTier] = useState(0);

    // Upon mount, unset alerts from any other pages, to prevent vertical scroll.
    useEffect(function () {
        Alerts.deQueue(Alerts.LoggedOut);
        Alerts.deQueue(NotLoggedInAlert);
    }, []);

    return (
        <div className="homepage-contents">
            <div className="container d-flex flex-column justify-content-around justify-content-xxl-start">
                <div className="row">
                    <div className="homepage-header col-12">
                        <h1 className="">
                            Somatic Mosaicism across Human Tissues Data Portal
                        </h1>
                        <h2 className="">
                            A platform to search, visualize, and download
                            somatic mosaic variants in normal tissues.
                        </h2>
                    </div>
                </div>
                <div className="homepage-timeline-figure-container row flex-column flex-lg-row">
                    <div className="col-12 col-lg-4 col-xl-5 col-xxl-4">
                        <SMaHTTimeline
                            currentTier={currentTier}
                            setCurrentTier={setCurrentTier}
                        />
                    </div>
                    <div className="homepage-figure-container col-12 col-lg-8 col-xl-7 col-xxxl-6 d-flex mb-2 my-lg-2 ">
                        <HomepageFigure
                            currentTier={currentTier}
                            setCurrentTier={setCurrentTier}
                        />
                    </div>
                </div>
                <NotificationsPanel {...props} />
            </div>
        </div>
    );
});
