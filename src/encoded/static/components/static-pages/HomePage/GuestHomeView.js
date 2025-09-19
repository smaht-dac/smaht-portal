'use strict';

import React, { useEffect, useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import { Alerts } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts';
import { LoginController } from '@hms-dbmi-bgm/shared-portal-components/es/components/navigation/components/LoginController';
import { NotLoggedInAlert } from './../../navigation/components/LoginNavItem';
import { UserRegistrationModal } from './../../navigation/components/UserRegistrationModal';
import { auth0Options as navAuth0Options } from './../../navigation/components/AccountNav';
import SMaHTTimeline from '../../viz/SMaHTTimeline';
import Card from 'react-bootstrap/esm/Card';
import { NotificationsPanel } from '../components/NotificationsPanel';
// import { Fade } from 'react-bootstrap';

import { HomepageFigure } from '../../viz/HomepageFigure';

const auth0Options = {
    ...navAuth0Options,
    container: 'homepage-login-container',
    // Reverts to using Auth0's logo:
    // theme: { ...navAuth0Options.theme, logo: null, icon: null }
};

export const GuestHomeView = React.memo(function GuestHomeView(props) {
    const [currentTier, setCurrentTier] = useState(1);
    const { updateAppSessionState, alerts } = props;

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

const LoginBox = React.memo(function LoginBox(props) {
    const { showLock, isAuth0LibraryLoaded, unverifiedUserEmail } = props;

    useEffect(
        function () {
            // Also show lock again when unverifiedUserEmail is unset, since when registration modal pops up, LoginController will hide lock.
            if (!isAuth0LibraryLoaded || unverifiedUserEmail) return;
            showLock();
        },
        [isAuth0LibraryLoaded, unverifiedUserEmail]
    );

    return (
        <React.Fragment>
            <LoginBoxContainerElement />
            {unverifiedUserEmail ? <UserRegistrationModal {...props} /> : null}
        </React.Fragment>
    );
});

/** Memoized with no props, never to be re-rendered since is root of Auth0 widget's own ReactDOM.render. */
const LoginBoxContainerElement = React.memo(function () {
    return (
        <div
            className="login-container text-center"
            id="homepage-login-container">
            <i className="icon icon-circle-notch icon-spin fas text-secondary icon-2x" />
        </div>
    );
});
