'use strict';

/**
 * Pure configuration layer for Okta login. No React, no Okta SDK, no network.
 *
 * The browser is a **public** OAuth client: it runs Authorization Code with
 * PKCE and never holds a client secret. `assertNoClientSecret` makes that a
 * checked property of the config object rather than a convention, so a future
 * edit that threads a secret-shaped value into browser configuration fails here
 * instead of shipping it in the bundle.
 */

/** Path the Okta redirect lands on. Must match `OKTA_CALLBACK_PATH` in `encoded/okta.py`. */
export const OKTA_CALLBACK_PATH = '/okta/callback';

/** Endpoint serving the public SPA configuration (`encoded.okta.okta_config_view`). */
export const OKTA_CONFIG_ENDPOINT = '/okta_config';

/** Substrings that mark a config key as secret-shaped and therefore forbidden here. */
export const SECRET_LIKE_KEY_FRAGMENTS = [
    'secret',
    'password',
    'private',
    'credential',
];

export class OktaConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'OktaConfigError';
    }
}

/**
 * Throw if `raw` carries anything secret-shaped.
 *
 * @param {Object} raw Candidate configuration.
 * @returns {Object} `raw`, unchanged, when it is clean.
 */
export function assertNoClientSecret(raw) {
    if (!raw || typeof raw !== 'object') return raw;
    Object.keys(raw).forEach(function (key) {
        const lowered = String(key).toLowerCase();
        SECRET_LIKE_KEY_FRAGMENTS.forEach(function (fragment) {
            if (lowered.indexOf(fragment) > -1) {
                throw new OktaConfigError(
                    'Okta browser configuration must not contain the key "' +
                        key +
                        '": the SPA is a public client and uses PKCE, not a client secret'
                );
            }
        });
    });
    return raw;
}

function requireString(raw, key) {
    const value = raw[key];
    if (typeof value !== 'string' || value.trim() === '') {
        throw new OktaConfigError(
            'Okta configuration is missing "' + key + '"'
        );
    }
    return value.trim();
}

/**
 * Normalize `scopes`, accepting either an array or a space/comma-separated string.
 */
export function normalizeScopes(scopes) {
    let list;
    if (Array.isArray(scopes)) {
        list = scopes;
    } else if (typeof scopes === 'string') {
        list = scopes.replace(/,/g, ' ').split(/\s+/);
    } else if (scopes === undefined || scopes === null) {
        list = [];
    } else {
        throw new OktaConfigError(
            'Okta "scopes" must be an array or a string, got ' + typeof scopes
        );
    }
    const cleaned = list
        .map(function (scope) {
            return String(scope).trim();
        })
        .filter(Boolean);
    if (cleaned.indexOf('openid') === -1) {
        throw new OktaConfigError(
            'Okta "scopes" must include "openid" to receive an ID token'
        );
    }
    if (cleaned.indexOf('email') === -1) {
        // The portal identifies users by email address; without the claim,
        // /login can succeed while /session-properties can never resolve a user.
        throw new OktaConfigError(
            'Okta "scopes" must include "email": the portal identifies users by email'
        );
    }
    return cleaned;
}

/**
 * Whether `raw` looks complete enough to attempt building a client.
 * Used to decide whether to offer Okta login at all, without throwing.
 */
export function isOktaConfigured(raw) {
    return !!(
        raw &&
        typeof raw.issuer === 'string' &&
        raw.issuer.trim() &&
        typeof raw.clientId === 'string' &&
        raw.clientId.trim()
    );
}

/**
 * Build the validated `OktaAuth` constructor options.
 *
 * @param {Object} raw           Response from `/okta_config`.
 * @param {Object} [options]
 * @param {string} [options.origin] Browser origin, used only to fill in a
 *   `redirectUri` the server did not supply.
 * @throws {OktaConfigError} when required values are absent or malformed, or
 *   when anything secret-shaped is present.
 * @returns {Object} Options for `new OktaAuth(...)`.
 */
export function buildOktaAuthConfig(raw, options) {
    if (!raw || typeof raw !== 'object') {
        throw new OktaConfigError(
            'Okta configuration response was empty or not an object'
        );
    }
    assertNoClientSecret(raw);

    const { origin = '' } = options || {};
    const issuer = requireString(raw, 'issuer');
    if (issuer.indexOf('https://') !== 0) {
        throw new OktaConfigError(
            'Okta "issuer" must be an https URL, got "' + issuer + '"'
        );
    }
    if (issuer.charAt(issuer.length - 1) === '/') {
        // Okta's own `iss` claim carries no trailing slash; keeping one makes
        // every issuer comparison fail in a way that looks like a key problem.
        throw new OktaConfigError(
            'Okta "issuer" must not end with "/", got "' + issuer + '"'
        );
    }
    const clientId = requireString(raw, 'clientId');

    let { redirectUri } = raw;
    if (typeof redirectUri !== 'string' || redirectUri.trim() === '') {
        if (!origin) {
            throw new OktaConfigError(
                'Okta configuration is missing "redirectUri" and no origin was available to derive one'
            );
        }
        redirectUri = origin.replace(/\/$/, '') + OKTA_CALLBACK_PATH;
    }
    redirectUri = redirectUri.trim();

    let { postLogoutRedirectUri } = raw;
    if (
        typeof postLogoutRedirectUri !== 'string' ||
        postLogoutRedirectUri.trim() === ''
    ) {
        postLogoutRedirectUri = origin
            ? origin.replace(/\/$/, '') + '/'
            : undefined;
    } else {
        postLogoutRedirectUri = postLogoutRedirectUri.trim();
    }

    const config = {
        issuer,
        clientId,
        redirectUri,
        scopes: normalizeScopes(raw.scopes),
        // Authorization Code with PKCE. Both are stated explicitly so a change
        // to either is a visible, reviewable edit rather than an SDK default.
        pkce: true,
        responseType: ['code'],
        // The SDK's own state/nonce handling and its transaction storage
        // (which holds the PKCE verifier) live in sessionStorage by default,
        // which is what we want: per-tab, cleared when the tab closes.
        tokenManager: { storage: 'localStorage' },
    };
    if (postLogoutRedirectUri) {
        config.postLogoutRedirectUri = postLogoutRedirectUri;
    }
    return assertNoClientSecret(config);
}
