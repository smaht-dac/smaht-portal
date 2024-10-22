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
// import { Fade } from 'react-bootstrap';

import { HomepageFigure } from '../../viz/HomepageFigure';

const auth0Options = {
    ...navAuth0Options,
    container: 'homepage-login-container',
    // Reverts to using Auth0's logo:
    // theme: { ...navAuth0Options.theme, logo: null, icon: null }
};

export const GuestHomeView = React.memo(function GuestHomeView(props) {
    const [currentTier, setCurrentTier] = useState(0);
    const { updateAppSessionState, alerts } = props;

    // Upon mount, unset alerts from any other pages, to prevent vertical scroll.
    useEffect(function () {
        Alerts.deQueue(Alerts.LoggedOut);
        Alerts.deQueue(NotLoggedInAlert);
    }, []);

    return (
        <div className="homepage-contents">
            <div className="container d-flex flex-column justify-content-around">
                <div className="row">
                    <div className="homepage-header col-12">
                        <h1 className="mb-1">
                            Somatic Mosaicism across Human Tissues Data Portal
                        </h1>
                        <h2 className="">
                            A platform to search, visualize, and download
                            somatic mosaic variants in normal tissues.
                        </h2>
                    </div>
                </div>
                <div className="row my-2 flex-column flex-lg-row">
                    <div className="col-12 col-lg-4 col-xl-5">
                        <SMaHTTimeline
                            currentTier={currentTier}
                            setCurrentTier={setCurrentTier}
                        />
                    </div>
                    <div className="col-12 col-lg-8 col-xl-7 d-flex justify-content-center align-items-center mb-2 my-lg-2 ">
                        <HomepageFigure
                            currentTier={currentTier}
                            setCurrentTier={setCurrentTier}
                        />
                    </div>
                </div>
                <div className="row g-0">
                    <Card className="about-consortium col-12 w-100 mb-3">
                        <h3 className="">About the Consortium</h3>
                        <div className="row">
                            <div className="col-12 col-lg-4">
                                <a
                                    href="https://commonfund.nih.gov/smaht"
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    role="button"
                                    className="w-100 py-2 btn">
                                    NIH SMaHT Homepage
                                    <i className="icon-external-link-alt icon fas ms-2" />
                                </a>
                            </div>
                            <div className="col-12 col-lg-4">
                                <a
                                    href="https://www.smaht.org"
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    role="button"
                                    className="w-100 py-2 btn">
                                    SMaHT OC Homepage
                                    <i className="icon-external-link-alt icon fas ms-2" />
                                </a>
                            </div>
                            <div className="col-12 col-lg-4">
                                <a
                                    href="https://www.youtube.com/watch?v=8KX3lkMB5nU"
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    role="button"
                                    className="w-100 py-2 btn">
                                    SMaHT Overview Video
                                    <i className="icon-external-link-alt icon fas ms-2" />
                                </a>
                            </div>
                            {/** @TODO: Link might change */}
                            {/* <div className="col-12 col-md-6 col-lg-3">
                                <a
                                    href="/about"
                                    role="button"
                                    className="w-100 py-2 btn">
                                    SMaHT Consortium Map <span className="fst-italic">(coming soon)</span>
                                </a>
                            </div> */}
                        </div>
                    </Card>
                </div>
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
