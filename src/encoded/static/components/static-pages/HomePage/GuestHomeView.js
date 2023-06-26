'use strict';

import React, { useEffect, useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import { Alerts } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts';
import { LoginController } from '@hms-dbmi-bgm/shared-portal-components/es/components/navigation/components/LoginController';
import { NotLoggedInAlert } from './../../navigation/components/LoginNavItem';
import { UserRegistrationModal } from './../../navigation/components/UserRegistrationModal';
import { auth0Options as navAuth0Options } from './../../navigation/components/AccountNav';


const auth0Options = {
    ...navAuth0Options,
    container: "homepage-login-container",
    // Reverts to using Auth0's logo:
    // theme: { ...navAuth0Options.theme, logo: null, icon: null }
};

export const GuestHomeView = React.memo(function GuestHomeView(props){
    const { updateAppSessionState } = props;

    // Upon mount, unset alerts from any other pages, to prevent vertical scroll.
    useEffect(function(){
        Alerts.deQueue(Alerts.LoggedOut);
        Alerts.deQueue(NotLoggedInAlert);
    }, []);

    return (
        <React.Fragment>
            <div className="homepage-contents">
                <div className="d-flex flex-column align-items-center justify-content-center">
                    <div className="d-inline-block mb-1 mt-36">
                        LOGO
                    </div>
                    <div className="coming-soon">
                        Coming Soon
                    </div>
                    <div className="text-center mb-3">
                        Welcome to the future home of the<br/>
                        Somatic Mosiacism across Human Tissues (SMaHT) Data Portal
                    </div>
                    <div>
                        <a href="/" className="btn btn-link btn-outline-primary">Learn about the consortium</a>
                    </div>
                </div>
            </div>
        </React.Fragment>
    );
});

const LoginBox = React.memo(function LoginBox (props) {
    const { showLock, isAuth0LibraryLoaded, unverifiedUserEmail } = props;

    useEffect(function(){
        // Also show lock again when unverifiedUserEmail is unset, since when registration modal pops up, LoginController will hide lock.
        if (!isAuth0LibraryLoaded || unverifiedUserEmail) return;
        showLock();
    }, [ isAuth0LibraryLoaded, unverifiedUserEmail ]);

    return (
        <React.Fragment>
            <LoginBoxContainerElement />
            { unverifiedUserEmail ? <UserRegistrationModal {...props} /> : null }
        </React.Fragment>
    );
});

/** Memoized with no props, never to be re-rendered since is root of Auth0 widget's own ReactDOM.render. */
const LoginBoxContainerElement = React.memo(function(){
    return (
        <div className="login-container text-center" id="homepage-login-container">
            <i className="icon icon-circle-notch icon-spin fas text-secondary icon-2x"/>
        </div>
    );
});

