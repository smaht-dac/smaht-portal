import _ from 'underscore';
const jose = require('jose');

import {
    navUserAcctDropdownBtnSelector,
    navUserAcctLoginBtnSelector,
} from './selectorVars';

/** Expected to throw error of some sort if not on search page, or no results. */
Cypress.Commands.add('searchPageTotalResultCount', function (options) {
    return cy
        .get('div.above-results-table-row #results-count')
        .invoke('text')
        .then(function (resultText) {
            return parseInt(resultText);
        });
});

Cypress.Commands.add('scrollToBottom', function (options) {
    return cy.get('body').then(($body) => {
        cy.scrollTo(0, $body[0].scrollHeight);
    });
});

Cypress.Commands.add(
    'scrollToCenterElement',
    { prevSubject: true },
    (subject, options) => {
        expect(subject.length).to.equal(1);
        const subjectElem = subject[0];
        var bounds = subjectElem.getBoundingClientRect();
        return cy.window().then((w) => {
            w.scrollBy(0, bounds.top - w.innerHeight / 2);
            return cy.wrap(subjectElem);
        });
    }
);

/* Hovering */
Cypress.Commands.add(
    'hoverIn',
    { prevSubject: true },
    function (subject, options) {
        expect(subject.length).to.equal(1);

        var subjElem = subject[0];

        var bounds = subjElem.getBoundingClientRect();
        var cursorPos = {
            clientX: bounds.left + bounds.width / 2,
            clientY: bounds.top + bounds.height / 2,
        };
        var commonEventVals = _.extend(
            { bubbles: true, cancelable: true },
            cursorPos
        );

        subjElem.dispatchEvent(new MouseEvent('mouseenter', commonEventVals));
        subjElem.dispatchEvent(new MouseEvent('mouseover', commonEventVals));
        subjElem.dispatchEvent(new MouseEvent('mousemove', commonEventVals));

        return subject;
    }
);

Cypress.Commands.add(
    'hoverOut',
    { prevSubject: true },
    function (subject, options) {
        expect(subject.length).to.equal(1);

        var subjElem = subject[0];

        var bounds = subjElem.getBoundingClientRect();
        var cursorPos = {
            clientX: Math.max(bounds.left - bounds.width / 2, 0),
            clientY: Math.max(bounds.top - bounds.height / 2, 0),
        };
        var commonEventValsIn = _.extend(
            { bubbles: true, cancelable: true },
            cursorPos
        );

        subjElem.dispatchEvent(new MouseEvent('mousemove', commonEventValsIn));
        subjElem.dispatchEvent(new MouseEvent('mouseover', commonEventValsIn));
        subjElem.dispatchEvent(
            new MouseEvent(
                'mouseleave',
                _.extend({ relatedTarget: subjElem }, commonEventValsIn, {
                    clientX: bounds.left - 5,
                    clientY: bounds.top - 5,
                })
            )
        );

        return subject;
    }
);

Cypress.Commands.add(
    'clickEvent',
    { prevSubject: true },
    function (subject, options) {
        expect(subject.length).to.equal(1);

        var subjElem = subject[0];

        var bounds = subjElem.getBoundingClientRect();
        var cursorPos = {
            clientX: bounds.left + bounds.width / 2,
            clientY: bounds.top + bounds.height / 2,
        };
        var commonEventValsIn = _.extend(
            { bubbles: true, cancelable: true },
            cursorPos
        );

        subjElem.dispatchEvent(new MouseEvent('mouseenter', commonEventValsIn));
        subjElem.dispatchEvent(new MouseEvent('mousemove', commonEventValsIn));
        subjElem.dispatchEvent(new MouseEvent('mouseover', commonEventValsIn));
        subjElem.dispatchEvent(new MouseEvent('mousedown', commonEventValsIn));
        subjElem.dispatchEvent(new MouseEvent('mouseup', commonEventValsIn));
        //subjElem.dispatchEvent(new MouseEvent('mouseleave', _.extend({ 'relatedTarget' : subjElem }, commonEventValsIn, { 'clientX' : bounds.left - 5, 'clientY' : bounds.top - 5 }) ) );

        return subject;
    }
);

/**
 * AUTHENTICATION COMMANDS
 * @todo - Once the authentication scheme for SMaHT is finalized, the following should be commented out and
 *         adjusted to work with the new means of authentication + session storage
 * @deprecated - This code is taken from CGAP in its entirety
 */

const auth0UserIds = {
    'cypress-main-scientist@cypress.hms.harvard.edu':
        'auth0|6536c07ac994c9180dba80d5',
};

Cypress.Commands.add('signJWT', (auth0secret, email, sub) => {
    cy.request({
        url: '/auth0_config?format=json',
        method: 'GET',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json; charset=UTF-8',
        },
        followRedirect: true,
    }).then(function (resp) {
        if (resp.status && resp.status === 200) {
            const auth0Config = resp.body;
            const secret = new TextEncoder().encode(auth0secret);
            const jwt = new jose.SignJWT({
                email: email,
                email_verified: true,
            });
            const token = jwt
                .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
                .setIssuedAt()
                .setIssuer(auth0Config.auth0Domain)
                .setExpirationTime('1h')
                .setAudience(auth0Config.auth0Client)
                .setSubject(sub)
                .sign(secret);
            return token;
        }
    });
});

/**
 * This emulates login.js. Perhaps we should adjust login.js somewhat to match this better re: navigate.then(...) .
 */
Cypress.Commands.add('loginSMaHT', function (options = { useEnvToken: true }) {
    function performLogin(token) {
        return cy
            .window()
            .then((w) => {
                cy.request({
                    url: '/login',
                    method: 'POST',
                    body: JSON.stringify({ id_token: token }),
                    headers: {
                        Authorization: 'Bearer ' + token,
                        Accept: 'application/json',
                        'Content-Type': 'application/json; charset=UTF-8',
                    },
                    followRedirect: true,
                })
                    .then(function (resp) {
                        if (resp.status && resp.status === 200) {
                            cy.request({
                                url: '/session-properties',
                                method: 'GET',
                                headers: {
                                    Accept: 'application/json',
                                    'Content-Type':
                                        'application/json; charset=UTF-8',
                                },
                            })
                                .then(function (userInfoResponse) {
                                    w.SMaHT.JWT.saveUserInfoLocalStorage(
                                        userInfoResponse.body
                                    );
                                    // Triggers app.state.session change (req'd to update UI)
                                    w.SMaHT.app.updateAppSessionState();
                                    // Refresh curr page/context
                                    w.SMaHT.navigate('', { inPlace: true });
                                })
                                .end();
                        }
                    })
                    .end();
            })
            .end();
    }

    if (options.useEnvToken) {
        const jwt_token = Cypress.env('JWT_TOKEN');
        console.log('ENV TOKEN', jwt_token);
        if (typeof jwt_token === 'string' && jwt_token) {
            console.log('Logging in with token');
            return performLogin(jwt_token);
        }
    }

    // If no token, we try to generate/impersonate one ourselves

    const email =
        options.email ||
        options.user ||
        Cypress.env('LOGIN_AS_USER') ||
        'cypress-main-scientist@cypress.hms.harvard.edu';
    const auth0secret = Cypress.env('Auth0Secret');

    if (!auth0secret)
        throw new Error('Cannot test login if no Auth0Secret in ENV vars.');

    Cypress.log({
        name: 'Login SMaHT',
        message: 'Attempting to impersonate-login for ' + email,
        consoleProps: () => {
            return { auth0secret, email };
        },
    });

    // Generate JWT
    cy.signJWT(auth0secret, email, auth0UserIds[email] || '').then((token) => {
        expect(token).to.have.length.greaterThan(0);
        Cypress.log({
            name: 'Login SMaHT',
            message: 'Generated own JWT with length ' + token.length,
        });
        return performLogin(token);
    });
});

Cypress.Commands.add('logoutSMaHT', function (options = { useEnvToken: true }) {
    cy.get(navUserAcctDropdownBtnSelector)
        .click()
        .end()
        .get('#logoutbtn')
        .click()
        .end()
        .get(navUserAcctLoginBtnSelector)
        .should('contain', 'Login')
        .end()
        .get('#slow-load-container')
        .should('not.have.class', 'visible')
        .end();
});

/** Session Caching */

var localStorageCache = { user_info: null };
var cookieCache = { jwtToken: null, searchSessionID: null };

Cypress.Commands.add('saveBrowserSession', function (options = {}) {
    _.forEach(_.keys(localStorageCache), function (storageKey) {
        localStorageCache[storageKey] =
            localStorage.getItem(storageKey) || null;
    });
    _.forEach(_.keys(cookieCache), function (cookieKey) {
        cookieCache[cookieKey] = cy.getCookie(cookieKey) || null;
    });
});

Cypress.Commands.add('loadBrowserSession', function (options = {}) {
    _.forEach(_.keys(localStorageCache), function (storageKey) {
        if (typeof localStorageCache[storageKey] === 'string') {
            localStorage.setItem(storageKey, localStorageCache[storageKey]);
        }
    });
    _.forEach(_.keys(cookieCache), function (cookieKey) {
        if (typeof cookieCache[cookieKey] === 'string') {
            cy.setCookie(cookieKey, cookieCache[cookieKey]);
        }
    });
});

Cypress.Commands.add('clearBrowserSession', function (options = {}) {
    _.forEach(_.keys(localStorageCache), function (storageKey) {
        localStorageCache[storageKey] = null;
    });
    _.forEach(_.keys(cookieCache), function (cookieKey) {
        cookieCache[cookieKey] = null;
    });
    cy.loadBrowserSession();
});

/*
 ** Hovering
 ** (Yes, these are truly not included in Cypress by default
 ** @see: https://docs.cypress.io/api/commands/hover)
 */
Cypress.Commands.add(
    'hoverIn',
    { prevSubject: true },
    function (subject, options) {
        expect(subject.length).to.equal(1);

        var subjElem = subject[0];

        var bounds = subjElem.getBoundingClientRect();
        var cursorPos = {
            clientX: bounds.left + bounds.width / 2,
            clientY: bounds.top + bounds.height / 2,
        };
        var commonEventVals = _.extend(
            { bubbles: true, cancelable: true },
            cursorPos
        );

        subjElem.dispatchEvent(new MouseEvent('mouseenter', commonEventVals));
        subjElem.dispatchEvent(new MouseEvent('mouseover', commonEventVals));
        subjElem.dispatchEvent(new MouseEvent('mousemove', commonEventVals));

        return subject;
    }
);

Cypress.Commands.add(
    'hoverOut',
    { prevSubject: true },
    function (subject, options) {
        expect(subject.length).to.equal(1);

        var subjElem = subject[0];

        var bounds = subjElem.getBoundingClientRect();
        var cursorPos = {
            clientX: Math.max(bounds.left - bounds.width / 2, 0),
            clientY: Math.max(bounds.top - bounds.height / 2, 0),
        };
        var commonEventValsIn = _.extend(
            { bubbles: true, cancelable: true },
            cursorPos
        );

        subjElem.dispatchEvent(new MouseEvent('mousemove', commonEventValsIn));
        subjElem.dispatchEvent(new MouseEvent('mouseover', commonEventValsIn));
        subjElem.dispatchEvent(
            new MouseEvent(
                'mouseleave',
                _.extend({ relatedTarget: subjElem }, commonEventValsIn, {
                    clientX: bounds.left - 5,
                    clientY: bounds.top - 5,
                })
            )
        );

        return subject;
    }
);

/**
 * Not 100% sure this is still necessary? Seems like cy.click() might do the job...
 * Remove if not in use after 2024 (it'll probably still be in fourfront)
 */
Cypress.Commands.add(
    'clickEvent',
    { prevSubject: true },
    function (subject, options) {
        expect(subject.length).to.equal(1);

        var subjElem = subject[0];

        var bounds = subjElem.getBoundingClientRect();
        var cursorPos = {
            clientX: bounds.left + bounds.width / 2,
            clientY: bounds.top + bounds.height / 2,
        };
        var commonEventValsIn = _.extend(
            { bubbles: true, cancelable: true },
            cursorPos
        );

        subjElem.dispatchEvent(new MouseEvent('mouseenter', commonEventValsIn));
        subjElem.dispatchEvent(new MouseEvent('mousemove', commonEventValsIn));
        subjElem.dispatchEvent(new MouseEvent('mouseover', commonEventValsIn));
        subjElem.dispatchEvent(new MouseEvent('mousedown', commonEventValsIn));
        subjElem.dispatchEvent(new MouseEvent('mouseup', commonEventValsIn));

        return subject;
    }
);

/*** Browse View Utils ****/

Cypress.Commands.add("getQuickInfoBar", () => {
    const infoTypes = ["file", "donor", "tissue", "assay", "file-size"];
    
    let result = {};
  
    cy.get(".browse-summary-stat").each(($el) => {
      const iconType = $el.find(".browse-link-icon").attr("data-icon-type");
      const valueText = $el.find(".browse-summary-stat-value").text().trim();
      const value = valueText === "-" ? 0 : Number(valueText);
  
      if (infoTypes.includes(iconType)) {
        result[iconType] = value;
      }
    }).then(() => result);
  });
  
