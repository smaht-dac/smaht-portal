import React from 'react';
import { OktaAuth } from '@okta/okta-auth-js';

// Use the REAL locked Okta SDK. Only browser navigation, portal HTTP, and the
// revocation transport are replaced; no IdP, database, or network is contacted.
jest.mock('@hms-dbmi-bgm/shared-portal-components/es/components/util', () => {
    return {
        JWT: {
            remove: jest.fn(),
            getUserInfo: () => null,
            saveUserInfoLocalStorage: jest.fn(),
        },
        ajax: { fetch: jest.fn(), promise: jest.fn() },
        logger: { error: jest.fn() },
        analytics: {},
        isServerSide: () => false,
        navigate: jest.fn(),
    };
});
jest.mock('@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts', () => {
    return { Alerts: { queue: jest.fn() } };
});

const { ajax } = require('@hms-dbmi-bgm/shared-portal-components/es/components/util');
const { performFullLogout } = require('../auth/OktaLogoutController');
const { OktaLoginController } = require('../auth/OktaLoginController');
const { getOktaAuthClient, resetOktaAuthClient } = require('../auth/oktaClient');
const { OktaCallbackSecurity } = require('../auth/OktaLoginCallbackView');

const CONFIG = {
    issuer: 'https://example.okta.com/oauth2/default',
    clientId: 'synthetic-client',
    redirectUri: 'https://portal.example.invalid/okta/callback',
    postLogoutRedirectUri: 'https://portal.example.invalid/',
    scopes: ['openid', 'email', 'profile'],
};

const ID_TOKEN = 'header.' + Buffer.from(JSON.stringify({
    email: 'user@example.invalid',
})).toString('base64url') + '.signature';

let storage;
let stored;
let clients;
let previousWindow;

function clientForDocument() {
    // This storage provider survives simulated document reloads, exactly as the
    // configured localStorage does. The SDK, client factory, and restoration
    // controller are otherwise the production implementations.
    class PersistentOktaAuth extends OktaAuth {
        constructor(config) {
            super({ ...config, tokenManager: { ...config.tokenManager, storage } });
        }
    }
    const client = getOktaAuthClient(CONFIG, { OktaAuthImpl: PersistentOktaAuth });
    clients.push(client);
    return client;
}

function storeTokens(client) {
    const expiresAt = Math.floor(Date.now() / 1000) + 600;
    client.tokenManager.setTokens({
        idToken: {
            idToken: ID_TOKEN,
            claims: { sub: 'synthetic', email: 'user@example.invalid' },
            expiresAt,
            scopes: CONFIG.scopes,
            issuer: CONFIG.issuer,
            clientId: CONFIG.clientId,
        },
        accessToken: {
            accessToken: 'synthetic-access-token',
            claims: { sub: 'synthetic' },
            tokenType: 'Bearer',
            expiresAt,
            scopes: CONFIG.scopes,
        },
    });
}

async function restoreHomepage(client, mount = false) {
    const controller = new OktaLoginController({
        session: false,
        updateAppSessionState: jest.fn(),
        children: React.createElement('span'),
    });
    controller.oktaAuth = client;
    controller.setState = (state, callback) => {
        controller.state = { ...controller.state, ...state };
        if (callback) callback();
    };
    if (mount) controller.componentDidMount();
    else controller.restorePortalSession();
    await new Promise((resolve) => setImmediate(resolve));
    return controller;
}

beforeEach(() => {
    previousWindow = global.window;
    global.window = {
        location: {
            origin: 'https://portal.example.invalid',
            href: 'https://portal.example.invalid/',
            assign: jest.fn(),
        },
    };
    stored = {};
    storage = {
        getItem: (key) => stored[key],
        setItem: (key, value) => { stored[key] = value; },
        removeItem: (key) => { delete stored[key]; },
    };
    clients = [];
    resetOktaAuthClient();
    ajax.promise.mockReset();
    ajax.promise.mockResolvedValue(CONFIG);
    ajax.fetch.mockReset();
    ajax.fetch.mockImplementation(async (url) => {
        if (url === '/logout') return { deleted_cookie: true };
        if (url === '/login') return { saved_cookie: true };
        if (url === '/session-properties') {
            return { details: { email: 'user@example.invalid' } };
        }
        throw new Error('Unexpected portal request: ' + url);
    });
});

afterEach(async () => {
    await Promise.all(clients.map(async (client) => {
        await client.stop();
        client.tokenManager.clear();
    }));
    resetOktaAuthClient();
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
});

test('logout, document reload, and homepage restoration never re-create the portal session', async () => {
    const client = clientForDocument();
    storeTokens(client);
    const order = [];
    ajax.fetch.mockImplementationOnce(async () => {
        order.push('portal-cookie-deleted');
        return { deleted_cookie: true };
    });
    client.revokeAccessToken = jest.fn(async () => { order.push('revoke'); });
    let tokensAtRedirect;
    window.location.assign.mockImplementation(() => {
        order.push('redirect');
        tokensAtRedirect = client.tokenManager.getTokensSync();
    });
    await performFullLogout({ oktaAuth: client });

    resetOktaAuthClient(); // a new document/singleton, with persistent storage
    const reloaded = clientForDocument();
    await restoreHomepage(reloaded);

    expect(ajax.fetch.mock.calls.map(([url]) => url)).toEqual(['/logout']);
    expect(order).toEqual(['portal-cookie-deleted', 'revoke', 'redirect']);
    expect(tokensAtRedirect).toEqual({});
    expect(reloaded.tokenManager.getTokensSync()).toEqual({});
    expect(window.location.assign.mock.calls[0][0]).toContain(
        'id_token_hint=' + ID_TOKEN
    );
});

test('a login controller remounted during revocation cannot restore the portal cookie', async () => {
    const client = clientForDocument();
    storeTokens(client);
    const accessToken = client.tokenManager.getTokensSync().accessToken;
    let releaseRevocation;
    let revocationStarted;
    const started = new Promise((resolve) => { revocationStarted = resolve; });
    client.revokeAccessToken = jest.fn((token) => {
        expect(token).toEqual(accessToken);
        revocationStarted();
        return new Promise((resolve) => { releaseRevocation = resolve; });
    });
    let remount;
    ajax.fetch.mockImplementationOnce(async () => {
        remount = restoreHomepage(client, true);
        return { deleted_cookie: true };
    });
    const logout = performFullLogout({ oktaAuth: client });
    expect(client.tokenManager.getTokensSync()).toEqual({});
    await started;
    try {
        await remount;
        expect(ajax.promise).toHaveBeenCalledWith('/okta_config');
        expect(ajax.fetch.mock.calls.map(([url]) => url)).toEqual(['/logout']);
        expect(window.location.assign).not.toHaveBeenCalled();
    } finally {
        releaseRevocation();
        await logout;
    }
    expect(window.location.assign.mock.calls[0][0]).toContain('id_token_hint=' + ID_TOKEN);
});

test('expired stored tokens are cleared without attempting restoration or registration', async () => {
    const client = clientForDocument();
    storeTokens(client);
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 1200000);
    try {
        const controller = await restoreHomepage(client);
        expect(ajax.fetch).not.toHaveBeenCalled();
        expect(controller.state.unverifiedUserEmail).toBeNull();
        expect(client.tokenManager.getTokensSync()).toEqual({});
    } finally {
        clock.mockRestore();
    }
});

test('expiry during restoration is not mistaken for an unknown portal account', async () => {
    const client = clientForDocument();
    storeTokens(client);
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    ajax.fetch.mockImplementation(async (url) => {
        if (url === '/login') return { saved_cookie: true };
        clock.mockReturnValue(now + 1200000);
        throw { code: 401, message: 'Session Expired' };
    });
    try {
        const controller = await restoreHomepage(client);
        expect(ajax.fetch.mock.calls.map(([url]) => url)).toEqual(['/login', '/session-properties']);
        expect(controller.state.unverifiedUserEmail).toBeNull();
        expect(client.tokenManager.getTokensSync()).toEqual({});
    } finally {
        clock.mockRestore();
    }
});

test('a valid token with an unknown account still offers registration', async () => {
    const client = clientForDocument();
    storeTokens(client);
    ajax.fetch.mockImplementation(async (url) => {
        if (url === '/login') return { saved_cookie: true };
        throw { code: 401, message: 'Login Failure' };
    });
    const controller = await restoreHomepage(client);
    expect(controller.state.unverifiedUserEmail).toBe('user@example.invalid');
});

test('failed Okta revocation still prevents restoration after document reload', async () => {
    const client = clientForDocument();
    storeTokens(client);
    client.revokeAccessToken = jest.fn(async () => {
        throw new Error('Synthetic offline revocation');
    });
    const result = await performFullLogout({ oktaAuth: client });
    resetOktaAuthClient();
    await restoreHomepage(clientForDocument());
    expect(result).toEqual({ portalLoggedOut: true, oktaSignOutStarted: false });
    expect(ajax.fetch.mock.calls.map(([url]) => url)).toEqual(['/logout']);
    expect(client.tokenManager.getTokensSync()).toEqual({});
    expect(window.location.assign).not.toHaveBeenCalled();
});

test('tokens marked pendingRemove by an older page cannot be restored before SDK startup', async () => {
    const client = clientForDocument();
    storeTokens(client);
    client.tokenManager.addPendingRemoveFlags();
    resetOktaAuthClient();
    const reloaded = clientForDocument();
    expect(reloaded.tokenManager.getTokensSync().idToken.pendingRemove).toBe(true);
    await restoreHomepage(reloaded);
    expect(ajax.fetch).not.toHaveBeenCalled();
    expect(reloaded.tokenManager.getTokensSync()).toEqual({});
});

test('callback service ownership stops the real SDK on unmount', async () => {
    const client = clientForDocument();
    storeTokens(client);
    expect(client.tokenManager.isStarted()).toBe(false);
    // Security starts services on mount. Its enclosing callback boundary must
    // stop them on exit/error; ordinary navigation never starts them.
    await client.start();
    expect(client.tokenManager.isStarted()).toBe(true);
    const boundary = new OktaCallbackSecurity({ oktaAuth: client });
    await boundary.componentWillUnmount();
    expect(client.tokenManager.isStarted()).toBe(false);
});

test('an ordinary stored ID token can still restore the portal session', async () => {
    const client = clientForDocument();
    storeTokens(client);
    await restoreHomepage(client);
    expect(ajax.fetch.mock.calls.map(([url]) => url)).toEqual([
        '/login', '/session-properties',
    ]);
});
