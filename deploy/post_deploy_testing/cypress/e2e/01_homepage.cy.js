import { cypressVisitHeaders } from '../support';
import { ROLE_TYPES } from '../support';
import { gotoUrl } from '../support/utils/basicUtils';

const HEADER1_TEXT = 'Somatic Mosaicism across Human Tissues Data Portal';
const HEADER2_TEXT = 'A platform to search, visualize, and download somatic mosaic variants in normal tissues.';
const TIER_BUTTON_TEXTS = { 0: 'Benchmarking', 1: 'Production' };

const ROLE_MATRIX = {
    UNAUTH: {
        label: 'Unauthenticated',
        isAuthenticated: false,

        // Which steps to run
        runHeaderChecks: true,
        runTimelineAccordionChecks: true,
        runTierButtonsChecks: true,
        runDRTExists: true,
        runDRTCountsCheck: true,
        runAnnouncementsChecks: true,
        runNavbarDropdownChecks: false,

        // Expectations
        expectedHeaderH1: HEADER1_TEXT,
        expectedHeaderH2: HEADER2_TEXT,
        expectedTierTexts: TIER_BUTTON_TEXTS,
        expectNoResultsModalFromDRT: true // should not have access to DRT items
    },

    [ROLE_TYPES.SMAHT_DBGAP]: {
        label: 'SMAHT_DBGAP',
        isAuthenticated: true,

        runHeaderChecks: true,
        runTimelineAccordionChecks: true,
        runTierButtonsChecks: true,
        runDRTExists: true,
        runDRTCountsCheck: true,
        runAnnouncementsChecks: true,
        runNavbarDropdownChecks: true,

        expectedHeaderH1: HEADER1_TEXT,
        expectedHeaderH2: HEADER2_TEXT,
        expectedTierTexts: TIER_BUTTON_TEXTS,
        expectNoResultsModalFromDRT: false // should have access to DRT items
    },

    [ROLE_TYPES.SMAHT_NON_DBGAP]: {
        label: 'SMAHT_NON_DBGAP',
        isAuthenticated: true,

        runHeaderChecks: true,
        runTimelineAccordionChecks: true,
        runTierButtonsChecks: true,
        runDRTExists: true,
        runDRTCountsCheck: true,
        runAnnouncementsChecks: true,
        runNavbarDropdownChecks: true,

        expectedHeaderH1: HEADER1_TEXT,
        expectedHeaderH2: HEADER2_TEXT,
        expectedTierTexts: TIER_BUTTON_TEXTS,
        expectNoResultsModalFromDRT: false // should have access to DRT items
    },

    [ROLE_TYPES.PUBLIC_DBGAP]: {
        label: 'PUBLIC_DBGAP',
        isAuthenticated: true,
        runHeaderChecks: true,
        runTimelineAccordionChecks: true,
        runTierButtonsChecks: true,
        runDRTExists: true,
        runDRTCountsCheck: true,
        runAnnouncementsChecks: true,
        runNavbarDropdownChecks: true,

        expectedHeaderH1: HEADER1_TEXT,
        expectedHeaderH2: HEADER2_TEXT,
        expectedTierTexts: TIER_BUTTON_TEXTS,
        expectNoResultsModalFromDRT: true, // should not have access to DRT items
    },

    [ROLE_TYPES.PUBLIC_NON_DBGAP]: {
        label: 'PUBLIC_NON_DBGAP',
        isAuthenticated: true,
        runHeaderChecks: true,
        runTimelineAccordionChecks: true,
        runTierButtonsChecks: true,
        runDRTExists: true,
        runDRTCountsCheck: true,
        runAnnouncementsChecks: true,
        runNavbarDropdownChecks: true,

        expectedHeaderH1: HEADER1_TEXT,
        expectedHeaderH2: HEADER2_TEXT,
        expectedTierTexts: TIER_BUTTON_TEXTS,
        expectNoResultsModalFromDRT: false // should have access to DRT items
    },
};

// -------------------- Session / Navigation helpers --------------------

function loginIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) {
        cy.loginSMaHT(roleKey).end();
    }
}

function logoutIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) {
        cy.logoutSMaHT();
    }
}

// -------------------- Step helpers (guarded by ROLE_MATRIX flags) --------------------

// Header H1/H2 checks
function stepHeaderChecks(caps) {
    if (!caps.runHeaderChecks) return;

    cy.get('.homepage-wrapper > .homepage-contents h1')
        .contains(caps.expectedHeaderH1);
    cy.get('.homepage-wrapper > .homepage-contents h2')
        .contains(caps.expectedHeaderH2)
        .end();
}

// Timeline accordion behavior (detached DOM safe)
function stepTimelineAccordionChecks(caps) {
    if (!caps.runTimelineAccordionChecks) return;

    // Re-query strategy: never keep long-lived jQuery subjects across clicks
    cy.get('#timeline .timeline-item .accordion .card-header-button').each(($btn, index) => {
        // Alias the card before clicking so we can re-query inside it later
        cy.wrap($btn).closest('.card').as('card');

        // Scroll + click
        cy.wrap($btn).scrollIntoView().click({ force: true }).end();

        // Re-query collapse AFTER the click (avoid using stale $collapse)
        cy.get('.card').eq(index).find('.accordion-collapse')
            .should(($el) => {
                // If it just opened, it must have 'show'; if it just closed, it must NOT.
                const btnExpanded =  Cypress.$($btn).find('i.icon').hasClass('icon-minus');
                if (btnExpanded === true) {
                    expect($el).to.have.class('show');
                } else {
                    expect($el).not.to.have.class('show');
                }
            });

        // Optional: toggle back to ensure both states work
        cy.wrap($btn).click({ force: true });
        cy.get('.card').eq(index).find('.accordion-collapse').should(($el) => {
            const btnExpanded = Cypress.$($btn).find('i.icon').hasClass('icon-minus');
            if (btnExpanded === 'true') {
                expect($el).to.have.class('show');
            } else {
                expect($el).not.to.have.class('show');
            }
        });
    });
}




// Tier buttons (Benchmarking / Production) + visual class assertion
function stepTierButtonsChecks(caps) {
    if (!caps.runTierButtonsChecks) return;

    cy.get('.selector-buttons button').then(($buttons) => {
        Cypress._.forEachRight($buttons, ($button, index) => {
            cy.log('index:', index, 'button:', $button);
            cy.wrap($button).click();

            cy.wrap($button)
                .find('span')
                .invoke('text')
                .then((text) => {
                    const buttonText = text.toLowerCase().replace(/\s+/g, '-');

                    if (index === 0) {
                        expect(buttonText).to.equal('benchmarking');
                        cy.get('#timeline .timeline-item.tier-active')
                            .invoke('text')
                            .then((txt) => {
                                expect(txt).to.contain(caps.expectedTierTexts[0] || 'Benchmarking');
                            });
                    } else if (index === 1) {
                        expect(buttonText).to.equal('production');
                        cy.get('#timeline .timeline-item.tier-active')
                            .invoke('text')
                            .then((txt) => {
                                expect(txt).to.contain(caps.expectedTierTexts[1] || 'Production');
                            });
                    }

                    const className = `tier-${index}`;
                    cy.get('.card.assays').should('have.class', className);
                });
        });
    });
}

// Data Release Tracker feed exists
function stepDRTExists(caps) {
    if (!caps.runDRTExists) return;

    cy.get('.notifications-panel .data-release-tracker .data-release-item-container')
        .should('have.length.greaterThan', 0);
}

// Each DRT item navigates and matches file counts
function stepDRTCountsCheck(caps) {
    if (!caps.runDRTCountsCheck) return;

    cy.get('.data-release-item-container').then(($containers) => {
        const containerCount = $containers.length;

        for (let i = 0; i < containerCount; i++) {
            const $container = $containers.eq(i);

            const countText = $container.find('.header-link .count').text().trim();
            const match = countText.match(/^(\d+)/);
            const expectedCount = match ? parseInt(match[1], 10) : 0;
            const href = $container.find('.header-link').attr('href');

            cy.then(() => {
                cy.visit(href, { headers: cypressVisitHeaders });

                // Wait for search results to resolve and compare
                cy.searchPageTotalResultCount().then((actualCount) => {
                    expect(actualCount).to.eq(expectedCount);
                });

                // Navigate back to continue the loop
                cy.go('back');

                // Ensure list re-renders before next iteration
                cy.get('.data-release-item-container').should('have.length.at.least', containerCount);
            });
        }
    });
}

// Announcements feed exists
function stepAnnouncementsChecks(caps) {
    if (!caps.runAnnouncementsChecks) return;

    cy.visit('/', { headers: cypressVisitHeaders })
        .get('.notifications-panel .announcements .announcement-container')
        .should('have.length.greaterThan', 0);
}

// Navbar dropdowns (only meaningful for logged-in roles)
function stepNavbarDropdownChecks(caps) {
    if (!caps.runNavbarDropdownChecks) return;

    // If your UI requires hover to open first, add .trigger('mouseover') accordingly.
    cy.get('#data-menu-item').clickEvent();
    cy.get('#docs-menu-item').clickEvent();
    cy.get('#about-menu-item').clickEvent();
}

// -------------------- Parameterized suite generation --------------------

const ROLES_TO_TEST = [
    'UNAUTH',
    ROLE_TYPES.SMAHT_DBGAP,
    ROLE_TYPES.SMAHT_NON_DBGAP,
    ROLE_TYPES.PUBLIC_DBGAP,
    ROLE_TYPES.PUBLIC_NON_DBGAP,
];

describe('Home Page by role', () => {
    ROLES_TO_TEST.forEach((roleKey) => {
        const caps = ROLE_MATRIX[roleKey];
        const label = caps.label || String(roleKey);

        context(`${label} → homepage capabilities`, () => {
            before(() => {
                gotoUrl();
                loginIfNeeded(roleKey);
            });

            after(() => {
                logoutIfNeeded(roleKey);
            });

            it(`should validate header text (enabled: ${caps.runHeaderChecks})`, () => {
                stepHeaderChecks(caps);
            });

            it(`should toggle timeline accordions correctly (enabled: ${caps.runTimelineAccordionChecks})`, () => {
                stepTimelineAccordionChecks(caps);
            });

            it(`should switch tier buttons and update UI (enabled: ${caps.runTierButtonsChecks})`, () => {
                stepTierButtonsChecks(caps);
            });

            it(`should have Data Release Tracker feed with item(s) (enabled: ${caps.runDRTExists})`, () => {
                stepDRTExists(caps);
            });

            it(`should navigate DRT items and match file counts (enabled: ${caps.runDRTCountsCheck})`, () => {
                stepDRTCountsCheck(caps);
            });

            it(`should have Announcements feed with item(s) (enabled: ${caps.runAnnouncementsChecks})`, () => {
                stepAnnouncementsChecks(caps);
            });

            it(`should operate navbar dropdowns when logged in (enabled: ${caps.runNavbarDropdownChecks})`, () => {
                stepNavbarDropdownChecks(caps);
            });
        });
    });
});
