'use strict';

import React from 'react';
import PropTypes from 'prop-types';

import {
    ajax,
    analytics,
    isServerSide,
    navigate,
    logger,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

import { OKTA_CONFIG_ENDPOINT, isOktaConfigured } from './oktaConfig';
import { clearBrowserOktaTokens, getOktaAuthClient } from './oktaClient';
import { performPortalLogout } from './oktaSession';

/**
 * Logout for both halves of the session.
 *
 * Order matters: the portal session is dropped first, so a failure to reach
 * Okta (network, blocked redirect, missing post-logout URI registration) can
 * never leave the user still logged in to the portal. Only then do we clear the
 * Okta token/session state.
 *
 * Replaces `LogoutController` from shared-portal-components, whose module also
 * contains the `auth0-lock` dynamic import - importing it at all would keep
 * that dependency in the bundle.
 */

/**
 * Clear the portal session and then Okta's.
 *
 * @param {Object} [args]
 * @param {Object} [args.oktaAuth] Okta client, when one is available.
 * @param {function} [args.fetchImpl]
 * @returns {Promise<{portalLoggedOut: boolean, oktaSignOutStarted: boolean}>}
 *   `oktaSignOutStarted` is true when a redirect to Okta's end-session
 *   endpoint was initiated (in which case this page is going away).
 */
export async function performFullLogout(args) {
    const { oktaAuth = null, fetchImpl } = args || {};
    try {
        await performPortalLogout(fetchImpl ? { fetchImpl } : undefined);

        if (!oktaAuth) {
            return { portalLoggedOut: true, oktaSignOutStarted: false };
        }
        try {
            // End the Okta session after the portal session is gone. Clear
            // immediately instead of relying on SDK background services;
            // signOut retains the ID token as the redirect's logout hint.
            await oktaAuth.signOut({ clearTokensBeforeRedirect: true });
            return { portalLoggedOut: true, oktaSignOutStarted: true };
        } catch (error) {
            // Local removal still runs below if Okta cannot be reached.
            logger.error('Okta sign-out failed, clearing local tokens: ' + error.message);
            return { portalLoggedOut: true, oktaSignOutStarted: false };
        }
    } finally {
        // Includes /logout failure and a click while /okta_config is pending.
        // Retain the portal error (and do not redirect), but never leave tokens
        // that the login controller could use to restore the portal session.
        clearBrowserOktaTokens(oktaAuth);
    }
}

export class OktaLogoutController extends React.PureComponent {
    static propTypes = {
        children: PropTypes.element.isRequired,
    };

    constructor(props) {
        super(props);
        this.performLogoutUI = this.performLogoutUI.bind(this);
        this.state = { isLoading: false };
        this.oktaAuth = null;
    }

    componentDidMount() {
        if (isServerSide()) return;
        // Fetched here rather than at logout time so a slow config request
        // cannot delay the click, and so a missing config simply means
        // "portal-only logout" instead of a failed one.
        ajax.promise(OKTA_CONFIG_ENDPOINT)
            .then((rawConfig) => {
                if (!isOktaConfigured(rawConfig)) return;
                this.oktaAuth = getOktaAuthClient(rawConfig);
            })
            .catch((error) => {
                logger.error(
                    'Could not initialize Okta client for logout: ' + error.message
                );
            });
    }

    performLogoutUI(evt = null) {
        if (evt && evt.preventDefault) {
            evt.preventDefault();
            evt.stopPropagation();
        }
        this.setState({ isLoading: true }, () => {
            performFullLogout({ oktaAuth: this.oktaAuth })
                .then(({ oktaSignOutStarted }) => {
                    this.setState({ isLoading: false });
                    analytics.setUserID(null);
                    if (oktaSignOutStarted) {
                        // Okta is navigating this page away; do not also
                        // re-render underneath it.
                        return;
                    }
                    const windowHash =
                        (typeof window !== 'undefined' &&
                            window.location &&
                            window.location.hash) ||
                        '';
                    navigate(windowHash, {
                        inPlace: true,
                        dontScrollToTop: !!windowHash,
                    });
                    if (typeof document !== 'undefined') {
                        // Dummy click to close the account dropdown, as before.
                        document.dispatchEvent(new MouseEvent('click'));
                    }
                })
                .catch((error) => {
                    this.setState({ isLoading: false });
                    logger.error('Logout failed: ' + error.message);
                });
        });
    }

    render() {
        const { children, ...passProps } = this.props;
        const { isLoading } = this.state;
        return React.cloneElement(children, {
            ...passProps,
            isLoading,
            performLogout: this.performLogoutUI,
        });
    }
}

export default OktaLogoutController;
