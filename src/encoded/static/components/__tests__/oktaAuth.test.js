import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The default Jest environment here is `node` (there is no jest config and no
// jsdom), so these tests exercise the adapter modules directly and render the
// callback view's presentational pieces to static markup - the same shape as
// the other suites in this directory, including their use of `jest.mock` to
// keep the ESM-published shared-portal-components and Okta SDKs out of the
// module graph.

const alertsQueued = [];

jest.mock('@hms-dbmi-bgm/shared-portal-components/es/components/util', () => ({
    JWT: {
        saveUserInfoLocalStorage: () => true,
        remove: () => true,
        getUserInfo: () => null,
        getUserDetails: () => ({}),
    },
    ajax: {
        fetch: () => Promise.reject(new Error('ajax.fetch must be injected in tests')),
        promise: () => Promise.reject(new Error('ajax.promise must be injected in tests')),
        load: () => {},
    },
    analytics: { setUserID: () => {}, event: () => {} },
    // Jest runs in the `node` environment, which is genuinely server-side.
    isServerSide: () => true,
    navigate: () => {},
    logger: { error: () => {} },
}));

jest.mock('@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts', () => ({
    Alerts: {
        queue: (alert) => alertsQueued.push(alert),
        deQueue: () => {},
        LoginFailed: { title: 'Login Failed' },
    },
}));

jest.mock('@okta/okta-auth-js', () => ({
    OktaAuth: function OktaAuth(config) {
        this.config = config;
    },
}));

jest.mock('@okta/okta-react', () => ({
    Security: ({ children }) => children,
    LoginCallback: () => null,
}));

const {
    OKTA_CALLBACK_PATH,
    OktaConfigError,
    assertNoClientSecret,
    buildOktaAuthConfig,
    isOktaConfigured,
    normalizeScopes,
    SECRET_LIKE_KEY_FRAGMENTS,
} = require('../auth/oktaConfig');

const {
    PortalSessionError,
    establishPortalSession,
    performPortalLogout,
    profileUrlFromUserInfo,
    unverifiedEmailFromIdToken,
} = require('../auth/oktaSession');

const { createOktaAuthClient } = require('../auth/oktaClient');
const { performFullLogout } = require('../auth/OktaLogoutController');
const { OktaLoginController } = require('../auth/OktaLoginController');
const {
    default: OktaLoginCallbackView,
    CallbackError,
} = require('../auth/OktaLoginCallbackView');

const VALID_RAW_CONFIG = Object.freeze({
    // Synthetic values only; these are not a real Okta tenant.
    issuer: 'https://example.okta.com/oauth2/default',
    clientId: '0oa1example2client3id',
    redirectUri: 'https://portal.example.org/okta/callback',
    postLogoutRedirectUri: 'https://portal.example.org/',
    scopes: ['openid', 'email', 'profile'],
});

/** Minimal unsigned JWT-shaped string carrying `claims`. Never verified here. */
function fakeJwt(claims) {
    const encode = (obj) =>
        Buffer.from(JSON.stringify(obj))
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    return [encode({ alg: 'RS256' }), encode(claims), 'signature'].join('.');
}

describe('oktaConfig - configuration validation', () => {
    it('builds an Authorization Code + PKCE config from a valid response', () => {
        const config = buildOktaAuthConfig(VALID_RAW_CONFIG, {
            origin: 'https://portal.example.org',
        });
        expect(config.issuer).toBe(VALID_RAW_CONFIG.issuer);
        expect(config.clientId).toBe(VALID_RAW_CONFIG.clientId);
        expect(config.redirectUri).toBe(VALID_RAW_CONFIG.redirectUri);
        expect(config.pkce).toBe(true);
        expect(config.responseType).toEqual(['code']);
        expect(config.scopes).toEqual(['openid', 'email', 'profile']);
    });

    it('derives the redirect URI from the origin when the server omits it', () => {
        const { redirectUri, ...withoutRedirect } = VALID_RAW_CONFIG;
        const config = buildOktaAuthConfig(withoutRedirect, {
            origin: 'https://portal.example.org/',
        });
        expect(config.redirectUri).toBe(
            'https://portal.example.org' + OKTA_CALLBACK_PATH
        );
    });

    it('fails loudly rather than building a client without an issuer', () => {
        const { issuer, ...noIssuer } = VALID_RAW_CONFIG;
        expect(() => buildOktaAuthConfig(noIssuer, {})).toThrow(OktaConfigError);
        expect(() => buildOktaAuthConfig(noIssuer, {})).toThrow(/issuer/);
    });

    it('rejects a non-https issuer', () => {
        expect(() =>
            buildOktaAuthConfig(
                { ...VALID_RAW_CONFIG, issuer: 'http://example.okta.com' },
                {}
            )
        ).toThrow(/https/);
    });

    it('rejects a trailing slash on the issuer, which would break iss comparison', () => {
        expect(() =>
            buildOktaAuthConfig(
                { ...VALID_RAW_CONFIG, issuer: 'https://example.okta.com/oauth2/default/' },
                {}
            )
        ).toThrow(/must not end with/);
    });

    it('rejects a missing client ID', () => {
        const { clientId, ...noClient } = VALID_RAW_CONFIG;
        expect(() => buildOktaAuthConfig(noClient, {})).toThrow(/clientId/);
    });

    it('rejects an empty or non-object response', () => {
        expect(() => buildOktaAuthConfig(null, {})).toThrow(OktaConfigError);
        expect(() => buildOktaAuthConfig('nope', {})).toThrow(OktaConfigError);
    });

    it('reports incomplete configuration without throwing', () => {
        expect(isOktaConfigured(VALID_RAW_CONFIG)).toBe(true);
        expect(isOktaConfigured({ issuer: 'https://example.okta.com' })).toBe(false);
        expect(isOktaConfigured({})).toBe(false);
        expect(isOktaConfigured(null)).toBe(false);
    });
});

describe('oktaConfig - scopes', () => {
    it('accepts a space- or comma-separated string', () => {
        expect(normalizeScopes('openid email profile')).toEqual([
            'openid',
            'email',
            'profile',
        ]);
        expect(normalizeScopes('openid, email')).toEqual(['openid', 'email']);
    });

    it('requires openid so an ID token is actually issued', () => {
        expect(() => normalizeScopes(['email'])).toThrow(/openid/);
    });

    it('requires email because the portal identifies users by email', () => {
        expect(() => normalizeScopes(['openid'])).toThrow(/email/);
    });
});

describe('oktaConfig - no client secret reaches the browser', () => {
    it.each(SECRET_LIKE_KEY_FRAGMENTS)(
        'refuses a config key containing "%s"',
        (fragment) => {
            expect(() =>
                assertNoClientSecret({ ...VALID_RAW_CONFIG, ['okta' + fragment]: 'x' })
            ).toThrow(OktaConfigError);
        }
    );

    it('refuses the exact keys the Okta SDK would use for a confidential client', () => {
        expect(() =>
            buildOktaAuthConfig({ ...VALID_RAW_CONFIG, clientSecret: 'shh' }, {})
        ).toThrow(/public client/);
        expect(() =>
            buildOktaAuthConfig({ ...VALID_RAW_CONFIG, client_secret: 'shh' }, {})
        ).toThrow(/public client/);
    });

    it('produces a config with no secret-shaped key at all', () => {
        const config = buildOktaAuthConfig(VALID_RAW_CONFIG, {});
        Object.keys(config).forEach((key) => {
            SECRET_LIKE_KEY_FRAGMENTS.forEach((fragment) => {
                expect(key.toLowerCase()).not.toContain(fragment);
            });
        });
        // The SDK only sends a client_secret when this option is present.
        expect(config.clientSecret).toBeUndefined();
    });
});

describe('oktaClient', () => {
    it('constructs the SDK client with exactly the validated config', () => {
        const seen = [];
        function FakeOktaAuth(config) {
            seen.push(config);
        }
        const config = buildOktaAuthConfig(VALID_RAW_CONFIG, {});
        createOktaAuthClient(config, FakeOktaAuth);
        expect(seen).toHaveLength(1);
        expect(seen[0]).toBe(config);
        expect(seen[0].pkce).toBe(true);
    });

    it('refuses to construct a client when the SDK is not a constructor', () => {
        const config = buildOktaAuthConfig(VALID_RAW_CONFIG, {});
        expect(() => createOktaAuthClient(config, {})).toThrow(OktaConfigError);
    });
});

describe('oktaSession - establishing the portal session', () => {
    const idToken = fakeJwt({ email: 'someone@example.org' });

    function fetchStub(responses) {
        const calls = [];
        const fetchImpl = (url, options) => {
            calls.push({ url, options });
            const next = responses[url];
            if (typeof next === 'function') return Promise.resolve(next());
            return Promise.resolve(next);
        };
        return { calls, fetchImpl };
    }

    it('POSTs the ID token to /login then reads /session-properties', async () => {
        const { calls, fetchImpl } = fetchStub({
            '/login': { saved_cookie: true },
            '/session-properties': {
                details: { email: 'someone@example.org', uuid: 'u-1' },
                user_actions: [{ id: 'profile', href: '/users/u-1/' }],
            },
        });
        const userInfo = await establishPortalSession({ idToken, fetchImpl });
        expect(calls[0].url).toBe('/login');
        expect(calls[0].options.method).toBe('POST');
        expect(JSON.parse(calls[0].options.body)).toEqual({ id_token: idToken });
        expect(calls[1].url).toBe('/session-properties');
        expect(userInfo.details.email).toBe('someone@example.org');
        expect(profileUrlFromUserInfo(userInfo)).toBe('/users/u-1/');
    });

    it('surfaces a 401 from /session-properties as the registration signal', async () => {
        const { fetchImpl } = fetchStub({
            '/login': { saved_cookie: true },
            '/session-properties': { code: 401, title: 'Login Failure' },
        });
        await expect(establishPortalSession({ idToken, fetchImpl })).rejects.toMatchObject(
            { name: 'PortalSessionError', code: 401 }
        );
    });

    it('fails when /login did not save the cookie', async () => {
        const { fetchImpl } = fetchStub({ '/login': { saved_cookie: false } });
        await expect(
            establishPortalSession({ idToken, fetchImpl })
        ).rejects.toMatchObject({ type: 'login-failed' });
    });

    it('fails when the session carries no email', async () => {
        const { fetchImpl } = fetchStub({
            '/login': { saved_cookie: true },
            '/session-properties': { details: {}, user_actions: [] },
        });
        await expect(
            establishPortalSession({ idToken, fetchImpl })
        ).rejects.toMatchObject({ type: 'no-user-details' });
    });

    it('refuses to call /login without a token', async () => {
        const { calls, fetchImpl } = fetchStub({});
        await expect(
            establishPortalSession({ idToken: null, fetchImpl })
        ).rejects.toMatchObject({ type: 'no-token' });
        expect(calls).toHaveLength(0);
    });

    it('reads the email claim for registration without verifying the token', () => {
        expect(unverifiedEmailFromIdToken(idToken)).toBe('someone@example.org');
        expect(unverifiedEmailFromIdToken(fakeJwt({ sub: 'no-email' }))).toBeNull();
        expect(unverifiedEmailFromIdToken('not-a-jwt')).toBeNull();
        expect(unverifiedEmailFromIdToken(null)).toBeNull();
    });
});

describe('oktaSession - logout', () => {
    it('drops the portal cookie', async () => {
        const calls = [];
        await performPortalLogout({
            fetchImpl: (url) => {
                calls.push(url);
                return Promise.resolve({ deleted_cookie: true });
            },
        });
        expect(calls).toEqual(['/logout']);
    });

    it('reports a failed portal logout', async () => {
        await expect(
            performPortalLogout({
                fetchImpl: () => Promise.resolve({ deleted_cookie: false }),
            })
        ).rejects.toBeInstanceOf(PortalSessionError);
    });
});

describe('OktaLogoutController - full logout', () => {
    const okLogout = () => Promise.resolve({ deleted_cookie: true });

    it('clears the portal session before signing out of Okta', async () => {
        const order = [];
        const oktaAuth = {
            signOut: (options) => {
                expect(options).toEqual({ clearTokensBeforeRedirect: true });
                order.push('okta');
                return Promise.resolve();
            },
            tokenManager: { clear: () => order.push('clear') },
        };
        const result = await performFullLogout({
            oktaAuth,
            fetchImpl: (url) => {
                order.push('portal:' + url);
                return okLogout();
            },
        });
        expect(order).toEqual(['portal:/logout', 'okta']);
        expect(result).toEqual({ portalLoggedOut: true, oktaSignOutStarted: true });
    });

    it('clears local Okta tokens when the Okta sign-out cannot be reached', async () => {
        let cleared = false;
        const result = await performFullLogout({
            oktaAuth: {
                signOut: () => Promise.reject(new Error('network down')),
                tokenManager: {
                    clear: () => {
                        cleared = true;
                    },
                },
            },
            fetchImpl: okLogout,
        });
        expect(cleared).toBe(true);
        expect(result.portalLoggedOut).toBe(true);
        expect(result.oktaSignOutStarted).toBe(false);
    });

    it('still logs out of the portal when Okta was never configured', async () => {
        const result = await performFullLogout({ oktaAuth: null, fetchImpl: okLogout });
        expect(result).toEqual({ portalLoggedOut: true, oktaSignOutStarted: false });
    });
});

describe('OktaLoginController - login redirect', () => {
    function makeController(props, oktaAuth) {
        const controller = new OktaLoginController({
            updateAppSessionState: () => {},
            children: null,
            ...props,
        });
        controller.setState = (nextState, callback) => {
            controller.state = { ...controller.state, ...nextState };
            if (typeof callback === 'function') callback();
        };
        controller.oktaAuth = oktaAuth || null;
        return controller;
    }

    it('records where the user was, then starts the Okta redirect', () => {
        const seen = { originalUri: null, redirected: false };
        const controller = makeController(
            { href: 'https://portal.example.org/browse/?type=File' },
            {
                setOriginalUri: (uri) => {
                    seen.originalUri = uri;
                },
                signInWithRedirect: () => {
                    seen.redirected = true;
                    return Promise.resolve();
                },
            }
        );
        controller.showLock();
        expect(seen.originalUri).toBe('https://portal.example.org/browse/?type=File');
        expect(seen.redirected).toBe(true);
        expect(controller.state.isLoading).toBe(true);
    });

    it('does nothing when the client has not been built yet', () => {
        const controller = makeController({ href: '/' }, null);
        expect(() => controller.showLock()).not.toThrow();
        expect(controller.state.isLoading).toBe(false);
    });

    it('does not start a redirect when configuration failed', () => {
        let redirected = false;
        const controller = makeController(
            { href: '/' },
            {
                setOriginalUri: () => {},
                signInWithRedirect: () => {
                    redirected = true;
                    return Promise.resolve();
                },
            }
        );
        controller.state = { ...controller.state, configError: 'okta.issuer is not configured' };
        controller.showLock();
        expect(redirected).toBe(false);
    });
});

describe('OktaLoginController - restoring the session on page load', () => {
    function makeController(props, oktaAuth) {
        const controller = new OktaLoginController({
            updateAppSessionState: () => {},
            children: null,
            ...props,
        });
        controller.setState = (nextState, callback) => {
            controller.state = { ...controller.state, ...nextState };
            if (typeof callback === 'function') callback();
        };
        controller.oktaAuth = oktaAuth;
        return controller;
    }

    it('does not attempt a restore when the portal session already exists', () => {
        let read = false;
        const controller = makeController(
            { session: true },
            {
                tokenManager: {
                    getTokensSync: () => {
                        read = true;
                        return { idToken: { idToken: 'token' } };
                    },
                },
            }
        );
        controller.restorePortalSession();
        expect(read).toBe(false);
    });

    it('does nothing when the browser holds no Okta tokens', () => {
        const controller = makeController(
            { session: false },
            { tokenManager: { getTokensSync: () => ({}) } }
        );
        controller.restorePortalSession();
        expect(controller.state.isLoading).toBe(false);
    });

    it('attempts the restore at most once per mount', () => {
        let reads = 0;
        const controller = makeController(
            { session: false },
            {
                tokenManager: {
                    getTokensSync: () => {
                        reads += 1;
                        return {};
                    },
                },
            }
        );
        controller.restorePortalSession();
        controller.restorePortalSession();
        expect(reads).toBe(1);
    });

    it('offers registration when Okta knows the user but the portal does not', () => {
        const idToken = fakeJwt({ email: 'newcomer@example.org' });
        const controller = makeController(
            { session: false },
            { getIdToken: () => idToken, tokenManager: { clear: () => {} } }
        );
        controller.beginRegistration(idToken);
        expect(controller.state.unverifiedUserEmail).toBe('newcomer@example.org');
        expect(typeof controller.onRegistrationCompleteBoundWithToken).toBe('function');
    });

    it('drops the Okta tokens when registration is declined, so it does not re-prompt', () => {
        let cleared = false;
        const controller = makeController(
            { session: false },
            {
                getIdToken: () => 'token',
                tokenManager: {
                    clear: () => {
                        cleared = true;
                    },
                },
            }
        );
        controller.state = { ...controller.state, unverifiedUserEmail: 'x@example.org' };
        controller.onRegistrationCancel();
        expect(cleared).toBe(true);
        expect(controller.state.unverifiedUserEmail).toBeNull();
    });
});

describe('OktaLoginCallbackView - rendering', () => {
    it('renders a pending state during server-side render, never an SDK client', () => {
        const markup = renderToStaticMarkup(
            React.createElement(OktaLoginCallbackView, { context: {} })
        );
        expect(markup).toContain('okta-login-callback');
        expect(markup).toContain('icon-spin');
    });

    it('renders a useful message when the callback fails', () => {
        const markup = renderToStaticMarkup(
            React.createElement(CallbackError, {
                error: new Error('state parameter did not match'),
            })
        );
        expect(markup).toContain('Login failed');
        expect(markup).toContain('state parameter did not match');
    });

    it('renders an Okta errorSummary when that is all the SDK reports', () => {
        const markup = renderToStaticMarkup(
            React.createElement(CallbackError, {
                error: { errorSummary: 'PKCE code verifier missing' },
            })
        );
        expect(markup).toContain('PKCE code verifier missing');
    });
});
