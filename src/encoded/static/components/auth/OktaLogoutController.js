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
import { getOktaAuthClient } from './oktaClient';
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
    await performPortalLogout(fetchImpl ? { fetchImpl } : undefined);

    if (!oktaAuth) {
        return { portalLoggedOut: true, oktaSignOutStarted: false };
    }
    try {
        // `signOut` revokes the tokens and redirects to Okta's end-session
        // endpoint, which returns the browser to `postLogoutRedirectUri`. That
        // is the only way to end the Okta *session*, not just our copy of it.
        // The default signOut only marks tokens pendingRemove, relying on a
        // later SDK start() to delete them. Normal portal pages do not start
        // SDK services, so clear now; the SDK retains the ID-token logout hint.
        await oktaAuth.signOut({ clearTokensBeforeRedirect: true });
        return { portalLoggedOut: true, oktaSignOutStarted: true };
    } catch (error) {
        // Okta unreachable or the post-logout URI is not registered. The portal
        // session is already gone; drop the local tokens so this browser is not
        // left holding credentials it can silently log back in with.
        logger.error('Okta sign-out failed, clearing local tokens: ' + error.message);
        try {
            oktaAuth.tokenManager.clear();
        } catch (e) {
            logger.error('Could not clear Okta tokens: ' + e.message);
        }
        return { portalLoggedOut: true, oktaSignOutStarted: false };
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
