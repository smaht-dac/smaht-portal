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

const auth0Options = {
    ...navAuth0Options,
    container: 'homepage-login-container',
    // Reverts to using Auth0's logo:
    // theme: { ...navAuth0Options.theme, logo: null, icon: null }
};

export const GuestHomeView = React.memo(function GuestHomeView(props) {
    const { updateAppSessionState } = props;

    // Upon mount, unset alerts from any other pages, to prevent vertical scroll.
    useEffect(function () {
        Alerts.deQueue(Alerts.LoggedOut);
        Alerts.deQueue(NotLoggedInAlert);
    }, []);

    return (
        <div className="homepage-contents">
            <div className="container">
                <div className="row">
                    <div className="col-12">
                        <h1>
                            Somatic Mosaicism across Human Tissues Data Portal
                        </h1>
                        <h2>
                            A platform to search, visualize, and download
                            somatic mosaic variants in normal tissues.
                        </h2>
                    </div>
                </div>
                <div className="row">
                    <div className="col-md-6">
                        <SMaHTTimeline />
                    </div>
                    <div className="col-md-6 d-flex justify-content-center align-items-center">
                        Coming Soon!
                    </div>
                </div>
                <div className="row">
                    <Card className="col-12 w-100 m-3 p-3">
                        <h3 className="mt-0">About the Consortium</h3>
                        <div className="d-flex">
                            <button type="button" className="flex-fill">
                                NIH SMaHT Homepage
                            </button>
                            <button type="button" className="flex-fill">
                                SMaHT OC Homepage
                            </button>
                            <button type="button" className="flex-fill">
                                SMaHT Overview Video
                            </button>
                            <button type="button" className="flex-fill">
                                SMaHT Consortium Map
                            </button>
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
