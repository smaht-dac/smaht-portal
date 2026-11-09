'use strict';

/**
 * The portal-session half of Okta login, kept free of React and of the Okta SDK
 * so it can be tested directly.
 *
 * Migrating the browser to Okta does not change the portal's session contract:
 * the SPA POSTs its Okta **ID token** to `/login`, the server stores it as the
 * httpOnly `jwtToken` cookie, and `/session-properties` then reports the
 * in-system user. Every later request is authenticated by verifying that
 * cookie (see `encoded/okta.py`). Only the identity provider and the token's
 * signature scheme changed.
 */

import {
    JWT,
    ajax,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

/** How long to wait for `/login` before giving up, matching the previous flow. */
export const LOGIN_TIMEOUT_MS = 90000;

/** Error thrown when the portal session could not be established. */
export class PortalSessionError extends Error {
    /**
     * @param {string} message
     * @param {Object} [options]
     * @param {number} [options.code] HTTP-ish status, when known. `401` means
     *   "authenticated with Okta but no matching portal user", i.e. registration.
     * @param {string} [options.type] Short machine-readable kind.
     */
    constructor(message, options) {
        super(message);
        const { code = null, type = null } = options || {};
        this.name = 'PortalSessionError';
        this.code = code;
        this.type = type;
    }
}

/**
 * A rejecting timer plus its cancel function.
 *
 * The timer is cleared once the race settles: leaving a 90-second timeout
 * pending after a successful login keeps the event loop alive for no reason.
 */
function timeoutPromise(ms) {
    let timer = null;
    const promise = new Promise(function (resolve, reject) {
        timer = setTimeout(function () {
            reject(
                new PortalSessionError('Timed out establishing portal session', {
                    type: 'timed-out',
                })
            );
        }, ms);
    });
    return {
        promise,
        cancel() {
            if (timer !== null) clearTimeout(timer);
            timer = null;
        },
    };
}

/**
 * Read the email claim from an ID token **without verifying it**.
 *
 * Only ever used to prefill the registration form for a user the server has
 * already told us it does not know. Nothing is authorized on the strength of
 * this value; the server independently verifies the same token's signature,
 * issuer and audience before accepting a registration.
 *
 * @param {string} idToken
 * @returns {string|null}
 */
export function unverifiedEmailFromIdToken(idToken) {
    if (typeof idToken !== 'string') return null;
    const parts = idToken.split('.');
    if (parts.length < 2) return null;
    try {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64 + '==='.slice((base64.length + 3) % 4);
        // `atob` is global in every supported browser and in Node >= 16, which
        // is what the Jest suite runs on; no polyfill is warranted.
        if (typeof atob !== 'function') return null;
        const { email = null } = JSON.parse(atob(padded)) || {};
        return typeof email === 'string' && email ? email : null;
    } catch (e) {
        return null;
    }
}

/**
 * Exchange a verified-by-the-server Okta ID token for a portal session.
 *
 * @param {Object}   args
 * @param {string}   args.idToken       Okta ID token from the SDK.
 * @param {function} [args.fetchImpl]   Injected for tests; defaults to SPC ajax fetch.
 * @param {number}   [args.timeoutMs]
 * @returns {Promise<Object>} The `/session-properties` payload.
 * @throws {PortalSessionError} `code === 401` when the user has no portal account.
 */
export async function establishPortalSession(args) {
    const {
        idToken,
        fetchImpl = ajax.fetch,
        timeoutMs = LOGIN_TIMEOUT_MS,
    } = args || {};

    if (!idToken) {
        throw new PortalSessionError('No Okta ID token to log in with', {
            type: 'no-token',
        });
    }

    const timeout = timeoutPromise(timeoutMs);
    let loginResponse;
    try {
        loginResponse = await Promise.race([
            fetchImpl('/login', {
                method: 'POST',
                body: JSON.stringify({ id_token: idToken }),
            }),
            timeout.promise,
        ]);
    } finally {
        timeout.cancel();
    }

    const { saved_cookie: savedCookie = false } = loginResponse || {};
    if (!savedCookie) {
        throw new PortalSessionError("Couldn't set session in /login", {
            code: (loginResponse || {}).code || null,
            type: 'login-failed',
        });
    }

    // Returns 401 for an Okta-authenticated user with no portal account, which
    // is the signal to offer self-registration rather than an error.
    const userInfo = await fetchImpl('/session-properties');
    if (userInfo && (userInfo.code || userInfo.status)) {
        throw new PortalSessionError(
            userInfo.title || 'Could not read session properties',
            { code: userInfo.code || null, type: 'session-properties-failed' }
        );
    }

    const { details: { email = null } = {} } = userInfo || {};
    if (!email) {
        throw new PortalSessionError(
            'Did not receive user details from /session-properties, login failed.',
            { type: 'no-user-details' }
        );
    }

    JWT.saveUserInfoLocalStorage(userInfo);
    return userInfo;
}

/**
 * Find the profile URL in a `/session-properties` payload, if present.
 * @param {Object} userInfo
 * @returns {string|null}
 */
export function profileUrlFromUserInfo(userInfo) {
    const { user_actions: userActions = [] } = userInfo || {};
    for (let i = 0; i < userActions.length; i++) {
        const action = userActions[i] || {};
        if (action.id === 'profile' && action.href) return action.href;
    }
    return null;
}

/**
 * Drop the portal session: delete the server cookie and the local user info.
 *
 * Deliberately separate from the Okta side of logout so the portal session is
 * always cleared first - if the Okta redirect fails or is blocked, the user is
 * still logged out of the portal.
 *
 * @param {Object}   [args]
 * @param {function} [args.fetchImpl]
 * @returns {Promise<void>}
 */
export async function performPortalLogout(args) {
    const { fetchImpl = ajax.fetch } = args || {};
    const response = await fetchImpl('/logout');
    const { deleted_cookie: deletedCookie = false } = response || {};
    // Remove userInfo from localStorage whether or not the server confirmed,
    // so a network failure cannot leave the UI believing it is logged in.
    JWT.remove();
    if (!deletedCookie) {
        throw new PortalSessionError(
            "Couldn't delete session cookie, check network",
            { type: 'logout-failed' }
        );
    }
}
