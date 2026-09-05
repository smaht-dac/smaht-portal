'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import { Security, LoginCallback } from '@okta/okta-react';

import {
    ajax,
    isServerSide,
    logger,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

import { OKTA_CONFIG_ENDPOINT, isOktaConfigured } from './oktaConfig';
import { getOktaAuthClient } from './oktaClient';
import { establishPortalSession } from './oktaSession';

/**
 * Page rendered at `/okta/callback`, the Okta redirect URI.
 *
 * Everything security-sensitive about the callback - matching the `state`
 * parameter, replaying the PKCE `code_verifier`, checking the ID token's
 * `nonce` - is done by the Okta SDK inside `LoginCallback`/`handleLoginRedirect`.
 * This component's own job is the portal-specific part: swap the resulting ID
 * token for a portal session and send the user back where they started.
 *
 * The server view for this route (`encoded.okta.okta_login_callback_view`)
 * deliberately ignores the query string; the authorization code is never seen
 * by the server, which is what keeps this a public-client PKCE flow.
 */

/** Shown while the SDK completes the exchange and `/login` is in flight. */
function CallbackPending({ message = 'Signing you in…' }) {
    return (
        <div className="container text-center py-5" id="okta-login-callback">
            <i className="icon icon-circle-notch icon-spin fas icon-2x text-secondary" />
            <h4 className="mt-3 text-400">{message}</h4>
        </div>
    );
}
CallbackPending.propTypes = { message: PropTypes.string };

/** Shown when the callback cannot be completed. */
export function CallbackError({ error }) {
    const message =
        (error && (error.message || error.errorSummary || String(error))) ||
        'An unknown error occurred.';
    return (
        <div className="container py-5" id="okta-login-callback-error">
            <h3 className="text-400">Login failed</h3>
            <p className="mb-2">{message}</p>
            <p className="mb-0">
                <a href="/" className="link-underline-hover">
                    Return to the homepage
                </a>{' '}
                and try logging in again.
            </p>
        </div>
    );
}
CallbackError.propTypes = { error: PropTypes.object };

/**
 * Send the browser to `uri`, defaulting to the homepage.
 *
 * A full document load (rather than an in-app navigation) is deliberate: the
 * portal session is an httpOnly cookie the server reads while rendering, so the
 * destination page must be fetched with it in place.
 */
function goTo(uri) {
    const target = uri || '/';
    if (typeof window !== 'undefined' && window.location) {
        window.location.replace(target);
    }
}

/**
 * The callback owns SDK services: Security starts them, and this boundary stops
 * them when the callback leaves (or a portal-session error replaces it). Navigation
 * controllers only use the client/token APIs; they never start renewal services
 * or rely on service startup to remove credentials left over from logout.
 */
export class OktaCallbackSecurity extends React.PureComponent {
    static propTypes = {
        oktaAuth: PropTypes.object.isRequired,
    };

    componentWillUnmount() {
        const { oktaAuth } = this.props;
        return oktaAuth.stop().catch((error) => {
            logger.error('Could not stop Okta callback services: ' + error.message);
        });
    }

    render() {
        return <Security {...this.props} />;
    }
}

export default class OktaLoginCallbackView extends React.PureComponent {
    static propTypes = {
        /** Portal context for this route; unused, present for content_views parity. */
        context: PropTypes.object,
    };

    constructor(props) {
        super(props);
        this.restoreOriginalUri = this.restoreOriginalUri.bind(this);
        this.state = { oktaAuth: null, error: null };
    }

    componentDidMount() {
        if (isServerSide()) return;
        ajax.promise(OKTA_CONFIG_ENDPOINT)
            .then((rawConfig) => {
                if (!isOktaConfigured(rawConfig)) {
                    throw new Error(
                        'Okta is not configured for this environment, so this' +
                            ' callback cannot be completed.'
                    );
                }
                this.setState({ oktaAuth: getOktaAuthClient(rawConfig) });
            })
            .catch((error) => {
                logger.error('Okta callback could not start: ' + error.message);
                this.setState({ error });
            });
    }

    /**
     * Called by the SDK once the code exchange has succeeded and tokens are stored.
     *
     * @param {Object} oktaAuth
     * @param {string} originalUri Where the user was when they clicked login.
     */
    async restoreOriginalUri(oktaAuth, originalUri) {
        const idToken = oktaAuth.getIdToken();
        try {
            await establishPortalSession({ idToken });
        } catch (error) {
            if (error.code === 401) {
                // Okta knows this person, the portal does not. Continue to the
                // intended page: the login controller mounted there detects the
                // same condition and offers self-registration.
                goTo(originalUri);
                return;
            }
            logger.error(
                'Could not establish a portal session after Okta login: ' +
                    error.message
            );
            this.setState({ error });
            return;
        }
        goTo(originalUri);
    }

    render() {
        const { oktaAuth, error } = this.state;
        if (error) {
            return <CallbackError error={error} />;
        }
        if (!oktaAuth) {
            // Also the server-rendered output: the SDK is browser-only, so the
            // page ships as a spinner and completes after hydration.
            return <CallbackPending message="Preparing sign-in…" />;
        }
        return (
            <OktaCallbackSecurity oktaAuth={oktaAuth} restoreOriginalUri={this.restoreOriginalUri}>
                <LoginCallback
                    errorComponent={CallbackError}
                    loadingElement={<CallbackPending />}
                />
            </OktaCallbackSecurity>
        );
    }
}
