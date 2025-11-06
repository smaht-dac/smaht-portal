import _ from 'underscore';
const jose = require('jose');

import {
    navUserAcctDropdownBtnSelector,
    navUserAcctLoginBtnSelector,
} from './selectorVars';

/** Expected to throw error of some sort if not on search page, or no results. */
Cypress.Commands.add('searchPageTotalResultCount', function (options) {
    return cy
        .get('div.above-results-table-row #results-count, div.above-facets-table-row #results-count')
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

Cypress.Commands.add('scrollToCenterElement', { prevSubject: true }, (subject, options) => {
    expect(subject.length).to.equal(1);
    const subjectElem = subject[0];
    var bounds = subjectElem.getBoundingClientRect();
    return cy.window().then((w) => {
        w.scrollBy(0, bounds.top - w.innerHeight / 2);
        return cy.wrap(subjectElem);
    });
}
);

export const escapeElementWithNumericId = (selector) =>
    /^#\d/.test(selector) ? `[id="${selector.substring(1)}"]` : selector;

Cypress.Commands.add('getLoadedMenuItem', (selector) => {
    // 1) Scroll separately (may trigger layout / rerender)
    cy.get(selector).scrollIntoView();

    // 2) Do all assertions inside .should(($el) => {...})
    //    This makes them retry-safe if the element detaches / rerenders.
    return cy.get(selector, { timeout: 20000 }).should(($el) => {
        // visible + class check
        expect($el, 'menu item is visible').to.be.visible;
        expect($el, 'has dropdown-toggle class').to.have.class('dropdown-toggle');

        // verify pseudo-element ::after rendered
        const el = $el[0];
        const win = el.ownerDocument.defaultView || window;
        const after = win.getComputedStyle(el, '::after');

        // Some browsers return quoted strings (e.g. '"▼"'), we just care it's not 'none'
        expect(after && after.content, '::after content exists').to.not.equal('none');
    })
        // 3) Hand back a fresh, attached subject for further chaining
        .then(() => cy.get(selector));
});

Cypress.Commands.add('clickEvent', { prevSubject: true }, function (subject, options) {
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

Cypress.Commands.add('loginSMaHT', function (role, options = { useEnvToken: false }) {
    Cypress.log({
        name: 'Login SMaHT',
        message: 'Attempting to login as role ' + role
    });

    //ensure user is logged out first
    cy.get('body').then(($body) => {
        if ($body.find(navUserAcctDropdownBtnSelector + '#account-menu-item').length > 0) {
            cy.logoutSMaHT().end();
        }
    });

    function performLogin(token, userDisplayName = '') {
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
            .validateUser(userDisplayName)
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

    cy.fixture('roles.json').then((roles) => {
        let email, auth0UserId, shortname;
        if (roles && roles[role] && roles[role].email && roles[role].auth0UserId) {
            ({ email, auth0UserId, shortname } = roles[role]);
        } else {
            ({ email = options.user || Cypress.env('LOGIN_AS_USER'), auth0UserId, shortname } = options);
        }

        const auth0secret = Cypress.env('Auth0Secret');

        if (!auth0secret)
            throw new Error('Cannot test login if no Auth0Secret in ENV vars.');

        Cypress.log({
            name: 'Login SMaHT',
            message: 'Attempting to impersonate-login for ' + email,
            consoleProps: () => {
                return { auth0secret, email, auth0UserId };
            },
        });

        // Generate JWT
        cy.signJWT(auth0secret, email, auth0UserId || '').then((token) => {
            expect(token).to.have.length.greaterThan(0);
            Cypress.log({
                name: 'Login SMaHT',
                message: 'Generated own JWT with length ' + token.length,
            });
            return performLogin(token, shortname);
        });
    });
});

Cypress.Commands.add('validateUser', function (userDisplayName = '') {
    return cy.get(navUserAcctDropdownBtnSelector)
        .should('not.contain.text', 'Login / Register')
        .then((accountListItem) => {
            Cypress.log({
                name: 'Validate User',
                message: 'Validating user is ' + userDisplayName,
            });
            expect(accountListItem.text()).to.contain(userDisplayName);
        }).end();
});

Cypress.Commands.add('logoutSMaHT', function (options = { useEnvToken: true }) {
    cy.getLoadedMenuItem(navUserAcctDropdownBtnSelector)
        .click({ force: true })
        .end()
        .get('#logoutbtn')
        .click()
        .end()
        .getLoadedMenuItem(navUserAcctLoginBtnSelector)
        .should('contain', 'Login / Register')
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
Cypress.Commands.add('hoverIn', { prevSubject: true }, function (subject, options) {
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

Cypress.Commands.add('hoverOut', { prevSubject: true }, function (subject, options) {
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
Cypress.Commands.add('clickEvent', { prevSubject: true }, function (subject, options) {
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
    const result = {};

    cy.get(".browse-summary-stat").each(($el) => {
        const iconType = $el.find(".browse-link-icon").attr("data-icon-type");

        if (infoTypes.includes(iconType)) {
            // wait till fully loaded
            cy.wrap($el)
                .find(".browse-summary-stat-value .icon-circle-notch.icon-spin")
                .should("not.exist");

            // read value
            cy.wrap($el)
                .find(".browse-summary-stat-value")
                .invoke("text")
                .then((text) => {
                    const trimmed = text.trim();

                    if (trimmed === "-") {
                        result[iconType] = 0;
                    } else if (iconType === "file-size") {
                        // e.g. "14.18 TB"
                        const match = trimmed.match(/^([\d.,]+)\s*(TB|GB|MB|KB|Bytes)?$/i);
                        if (match) {
                            const number = parseFloat(match[1].replace(",", ""));
                            const unit = match[2] ? match[2].toUpperCase() : "B";

                            // convert the unit according to your preference; for example, convert all to GB:
                            let valueInGB;
                            switch (unit) {
                                case "TB": valueInGB = number * 1024; break;
                                case "GB": valueInGB = number; break;
                                case "MB": valueInGB = number / 1024; break;
                                case "KB": valueInGB = number / (1024 * 1024); break;
                                default: valueInGB = number / (1024 * 1024 * 1024); break;
                            }

                            result[iconType] = valueInGB; // GB
                        } else {
                            result[iconType] = NaN; // fallback
                        }
                    } else {
                        result[iconType] = Number(trimmed.replace(",", ""));
                    }
                });
        }
    }).then(() => result);
});

/*** Popover Utils ****/
Cypress.Commands.add('waitForPopoverShow', (popoverSelector = '#jap-popover, .popover', timeout = 10000) => {
    return cy.window().then((win) => new Cypress.Promise((resolve, reject) => {
        const start = Date.now();

        const matchesShow = (el) =>
            el &&
            el.isConnected &&
            (el.matches(popoverSelector) || el.closest(popoverSelector)) &&
            (el.classList?.contains('show') || el.closest('.show'));

        // Fast path: if already visible, resolve immediately
        const existing = Array.from(win.document.querySelectorAll(popoverSelector))
            .find(el => el.classList?.contains('show'));
        if (existing) return resolve(existing);

        // Observe class and DOM changes to detect when popover becomes visible
        const observer = new win.MutationObserver((mutations) => {
            for (const m of mutations) {
                // Check for class attribute changes
                if (m.type === 'attributes' && matchesShow(m.target)) {
                    cleanup(); return resolve(m.target);
                }
                // Check for new elements added to DOM
                if (m.type === 'childList') {
                    for (const n of m.addedNodes) {
                        if (n.nodeType === 1 && matchesShow(n)) {
                            cleanup(); return resolve(n);
                        }
                        if (n.nodeType === 1) {
                            const found = n.querySelector?.(popoverSelector);
                            if (found && found.classList?.contains('show')) {
                                cleanup(); return resolve(found);
                            }
                        }
                    }
                }
            }

            // Timeout guard
            if (Date.now() - start > timeout) {
                cleanup();
                const dbg = Array.from(win.document.querySelectorAll(popoverSelector))
                    .map(el => `[id="${el.id}" class="${el.className}"]`).join('\n');
                reject(new Error(`Popover .show not detected (timeout ${timeout}ms). Candidates:\n${dbg || '(none)'}`));
            }
        });

        const cleanup = () => observer.disconnect();

        // Observe the entire document body for class changes and new elements
        observer.observe(win.document.body, {
            attributes: true,
            attributeFilter: ['class'],
            subtree: true,
            childList: true
        });

        // Final fallback timeout
        setTimeout(() => {
            if (Date.now() - start > timeout) {
                cleanup();
                reject(new Error(`Popover .show not detected (timeout ${timeout}ms)`));
            }
        }, timeout + 5);
    }));
});


