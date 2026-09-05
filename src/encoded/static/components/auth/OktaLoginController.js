'use strict';

import React from 'react';
import PropTypes from 'prop-types';

import { Alerts } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts';
import {
    JWT,
    ajax,
    analytics,
    isServerSide,
    navigate,
    logger,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

import {
    OKTA_CONFIG_ENDPOINT,
    OktaConfigError,
    isOktaConfigured,
} from './oktaConfig';
import { getOktaAuthClient } from './oktaClient';
import {
    establishPortalSession,
    profileUrlFromUserInfo,
    unverifiedEmailFromIdToken,
} from './oktaSession';

/**
 * Re-render the current view now that a session cookie exists, preserving any
 * hash without scrolling to it (matching the previous Auth0 flow).
 */
function reloadCurrentView() {
    const windowHash =
        (typeof window !== 'undefined' && window.location && window.location.hash) ||
        '';
    navigate(windowHash, { inPlace: true, dontScrollToTop: !!windowHash });
}

/**
 * Owns the browser side of Okta login for the navigation bar.
 *
 * Replaces `LoginController` from shared-portal-components, which was built
 * around the `auth0-lock` modal widget. The child-prop contract is kept
 * (`showLock`, `isLoading`, `unverifiedUserEmail`, `isLoginLibraryLoaded`,
 * `onRegistrationComplete`, `onRegistrationCancel`) so `LoginNavItem` and the
 * guest homepage login box keep working as before.
 *
 * Login is a redirect, not a modal: `showLock` sends the browser to Okta and
 * the response lands on `/okta/callback`, handled by `OktaLoginCallbackView`.
 * This component additionally restores the portal session on page load when
 * the Okta tokens are still valid but the portal cookie is not, and surfaces
 * the self-registration modal for an Okta user with no portal account.
 */
export class OktaLoginController extends React.PureComponent {
    static propTypes = {
        updateAppSessionState: PropTypes.func.isRequired,
        children: PropTypes.node.isRequired,
        session: PropTypes.bool,
        href: PropTypes.string,
        onLogin: PropTypes.func,
    };

    constructor(props) {
        super(props);
        this.showLock = this.showLock.bind(this);
        this.onRegistrationComplete = this.onRegistrationComplete.bind(this);
        this.onRegistrationCancel = this.onRegistrationCancel.bind(this);
        this.state = {
            /** Whether the Okta SDK client has been built and login can start. */
            isLoginLibraryLoaded: false,
            /** True while a login / session-establishment request is in flight. */
            isLoading: false,
            /** Set when Okta authenticated someone with no portal account. */
            unverifiedUserEmail: null,
            /** Developer-facing configuration failure, if any. */
            configError: null,
        };
        this.oktaAuth = null;
        this.didAttemptRestore = false;
    }

    componentDidMount() {
        if (isServerSide()) return;
        ajax.promise(OKTA_CONFIG_ENDPOINT)
            .then((rawConfig) => {
                if (!isOktaConfigured(rawConfig)) {
                    throw new OktaConfigError(
                        'Okta is not configured for this environment (' +
                            OKTA_CONFIG_ENDPOINT +
                            ' returned no issuer/clientId)'
                    );
                }
                this.oktaAuth = getOktaAuthClient(rawConfig);
                this.setState({ isLoginLibraryLoaded: true }, () => {
                    this.restorePortalSession();
                });
            })
            .catch((error) => {
                // Leave login disabled and say why, rather than presenting a
                // button that builds a broken client when clicked.
                logger.error('Could not initialize Okta login: ' + error.message);
                this.setState({
                    configError: error.message || String(error),
                    isLoginLibraryLoaded: false,
                });
            });
    }

    /**
     * Re-establish the portal session from Okta tokens held in the browser.
     *
     * Runs once per mount. It matters after a reload whose portal cookie has
     * expired or been dropped while the Okta session is still good, and it is
     * also what detects an Okta-authenticated user who has no portal account.
     */
    restorePortalSession() {
        const { session, updateAppSessionState } = this.props;
        if (this.didAttemptRestore || session || !this.oktaAuth) return;
        this.didAttemptRestore = true;

        // Read the token object, not getIdToken()'s bare string: older pages
        // and other tabs can leave a pendingRemove credential after logout.
        // Restoration must be safe even before any SDK services have started.
        const { idToken: storedToken } = this.oktaAuth.tokenManager.getTokensSync();
        if (storedToken && storedToken.pendingRemove) {
            this.clearOktaTokens();
            return;
        }
        const idToken = storedToken && storedToken.idToken;
        if (!idToken) return; // Not logged in to Okta; nothing to restore.
        if (JWT.getUserInfo()) return; // Portal already believes it has a session.

        this.setState({ isLoading: true }, () => {
            establishPortalSession({ idToken })
                .then(() => {
                    this.setState({ isLoading: false });
                    updateAppSessionState();
                    reloadCurrentView();
                })
                .catch((error) => {
                    this.setState({ isLoading: false });
                    if (error.code === 401) {
                        // Authenticated with Okta but unknown to the portal:
                        // offer self-registration, as the Auth0 flow did.
                        this.beginRegistration(idToken);
                        return;
                    }
                    // A silent restore that fails must not leave a half state
                    // or nag the user; drop the Okta tokens and stay logged out.
                    logger.error(
                        'Could not restore portal session from Okta tokens: ' +
                            error.message
                    );
                    this.clearOktaTokens();
                });
        });
    }

    /** Show the registration modal for `idToken`'s (unverified) email. */
    beginRegistration(idToken) {
        const unverifiedUserEmail = unverifiedEmailFromIdToken(idToken);
        if (!unverifiedUserEmail) {
            logger.error('Okta ID token carried no email claim; cannot register');
            Alerts.queue(Alerts.LoginFailed);
            this.clearOktaTokens();
            return;
        }
        // Bound in a closure rather than held in state so the token is not
        // parked on the component for the life of the modal.
        this.onRegistrationCompleteBoundWithToken = this.onRegistrationComplete.bind(
            this,
            idToken
        );
        this.setState({ unverifiedUserEmail });
    }

    clearOktaTokens() {
        if (!this.oktaAuth) return;
        try {
            this.oktaAuth.tokenManager.clear();
        } catch (e) {
            logger.error('Could not clear Okta tokens: ' + e.message);
        }
    }

    /** Start an Okta Authorization Code + PKCE redirect login. */
    showLock() {
        const { href } = this.props;
        const { configError } = this.state;
        if (configError) {
            Alerts.queue({
                title: 'Login Unavailable',
                message:
                    'Login is not available because Okta is not configured for this deployment.',
                style: 'danger',
            });
            return;
        }
        if (!this.oktaAuth) return; // Not initialized yet; button is disabled.

        // Remember where the user was so the callback can send them back.
        // The SDK stores this alongside the PKCE/state/nonce transaction.
        const returnTo =
            href ||
            (typeof window !== 'undefined' && window.location
                ? window.location.href
                : '/');
        try {
            this.oktaAuth.setOriginalUri(returnTo);
        } catch (e) {
            logger.error('Could not record the original URI: ' + e.message);
        }

        this.setState({ isLoading: true }, () => {
            this.oktaAuth.signInWithRedirect().catch((error) => {
                this.setState({ isLoading: false });
                logger.error('Okta redirect login failed: ' + error.message);
                Alerts.queue(Alerts.LoginFailed);
            });
        });
    }

    /** Called by the registration form once `/create-unauthorized-user` succeeded. */
    onRegistrationComplete(idToken) {
        const { updateAppSessionState, onLogin = null } = this.props;
        const { unverifiedUserEmail } = this.state;
        delete this.onRegistrationCompleteBoundWithToken;

        this.setState({ isLoading: true }, () => {
            establishPortalSession({ idToken })
                .then((userInfo) => {
                    const userDetails = JWT.getUserDetails() || {};
                    const {
                        uuid: userUUID,
                        first_name: firstName,
                        last_name: lastName,
                    } = userDetails;
                    const userFullName =
                        firstName && lastName
                            ? firstName + ' ' + lastName
                            : firstName || lastName || null;
                    Alerts.queue({
                        title: 'Registered & Logged In',
                        message: (
                            <ul className="mb-0">
                                <li>
                                    You are now logged in as{' '}
                                    <span className="text-500">
                                        {userFullName
                                            ? userFullName +
                                              ' (' +
                                              unverifiedUserEmail +
                                              ')'
                                            : unverifiedUserEmail}
                                    </span>
                                    .
                                </li>
                                <li>
                                    Please visit{' '}
                                    <b>
                                        <a href={'/users/' + userUUID + '/'}>
                                            your profile
                                        </a>
                                    </b>{' '}
                                    to edit your account settings or information.
                                </li>
                            </ul>
                        ),
                        style: 'success',
                        navigateDisappearThreshold: 2,
                    });
                    this.setState({ isLoading: false, unverifiedUserEmail: null });
                    updateAppSessionState();
                    if (typeof onLogin === 'function') onLogin(userInfo);
                    this.trackLogin(userInfo);
                    reloadCurrentView();
                })
                .catch((error) => {
                    logger.error('Registration login failed: ' + error.message);
                    this.setState({ isLoading: false, unverifiedUserEmail: null });
                    JWT.remove();
                    analytics.setUserID(null);
                    this.clearOktaTokens();
                    Alerts.queue(Alerts.LoginFailed);
                });
        });
    }

    onRegistrationCancel() {
        delete this.onRegistrationCompleteBoundWithToken;
        JWT.remove();
        // Drop the Okta tokens too, or the registration prompt would reappear
        // on the next page load for a user who just declined it.
        this.clearOktaTokens();
        this.setState({ unverifiedUserEmail: null });
    }

    /** Segment public vs. internal audience in analytics, as the Auth0 flow did. */
    trackLogin(userInfo) {
        const profileURL = profileUrlFromUserInfo(userInfo);
        if (!profileURL) return;
        ajax.load(
            profileURL,
            function (profile) {
                const { uuid: userId, groups = null } = profile;
                analytics.setUserID(userId);
                analytics.event(
                    'login',
                    'UILogin',
                    'Authenticated ClientSide',
                    null,
                    {
                        user_uuid: userId,
                        user_groups: groups && JSON.stringify(groups.slice().sort()),
                    }
                );
            },
            'GET',
            function () {
                logger.error('Request to profile URL failed.');
            }
        );
    }

    render() {
        const { children, ...passProps } = this.props;
        const {
            isLoading,
            isLoginLibraryLoaded,
            unverifiedUserEmail,
            configError,
        } = this.state;
        const childProps = {
            ...passProps,
            isLoading,
            unverifiedUserEmail,
            isLoginLibraryLoaded,
            oktaConfigError: configError,
            showLock: this.showLock,
        };
        if (unverifiedUserEmail) {
            childProps.onRegistrationComplete = this.onRegistrationCompleteBoundWithToken;
            childProps.onRegistrationCancel = this.onRegistrationCancel;
        }
        return React.Children.map(children, function (child) {
            if (!React.isValidElement(child) || typeof child.type === 'string') {
                return child;
            }
            return React.cloneElement(child, childProps);
        });
    }
}

export default OktaLoginController;
