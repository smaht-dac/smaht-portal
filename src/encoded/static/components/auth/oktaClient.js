'use strict';

import { OktaAuth } from '@okta/okta-auth-js';
import { isServerSide } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

import {
    buildOktaAuthConfig,
    OktaConfigError,
    OKTA_CONFIG_ENDPOINT,
} from './oktaConfig';

/**
 * Single owner of the `OktaAuth` instance.
 *
 * The client is created lazily and only in the browser: it reads
 * `window.location`, uses WebCrypto for PKCE, and persists tokens, none of
 * which is meaningful during server-side rendering.
 *
 * It is a module singleton because both the navigation login control and the
 * `/okta/callback` page must share one instance - the PKCE verifier and the
 * `state`/`nonce` written when login starts have to be read back by the same
 * client when the redirect returns.
 */
let cachedClient = null;
let cachedConfigKey = null;

function configKey(config) {
    return [config.issuer, config.clientId, config.redirectUri].join('|');
}

/**
 * Build an `OktaAuth` from an already-validated config object.
 * Exported for tests; prefer `getOktaAuthClient`.
 *
 * @param {Object} config Output of `buildOktaAuthConfig`.
 * @param {Function} [OktaAuthImpl] Injected for tests.
 * @returns {OktaAuth}
 */
export function createOktaAuthClient(config, OktaAuthImpl) {
    const Impl = OktaAuthImpl || OktaAuth;
    if (typeof Impl !== 'function') {
        throw new OktaConfigError(
            'The Okta SDK is not available in this environment; cannot construct a client'
        );
    }
    return new Impl(config);
}

/**
 * Get (or lazily build) the shared client for the given `/okta_config` payload.
 *
 * @param {Object} rawConfig Response from `/okta_config`.
 * @param {Object} [options]
 * @param {string} [options.origin]
 * @param {Function} [options.OktaAuthImpl]
 * @throws {OktaConfigError} on server-side use or invalid configuration.
 * @returns {OktaAuth}
 */
export function getOktaAuthClient(rawConfig, options) {
    const { origin, OktaAuthImpl } = options || {};
    if (isServerSide()) {
        throw new OktaConfigError(
            'The Okta client cannot be constructed during server-side rendering'
        );
    }
    const resolvedOrigin =
        origin ||
        (typeof window !== 'undefined' && window.location
            ? window.location.origin
            : '');
    const config = buildOktaAuthConfig(rawConfig, { origin: resolvedOrigin });
    const key = configKey(config);
    if (cachedClient && cachedConfigKey === key) {
        return cachedClient;
    }
    cachedClient = createOktaAuthClient(config, OktaAuthImpl);
    cachedConfigKey = key;
    return cachedClient;
}

/** Discard the memoized client. Exported for tests. */
export function resetOktaAuthClient() {
    cachedClient = null;
    cachedConfigKey = null;
}

export { OKTA_CONFIG_ENDPOINT };
