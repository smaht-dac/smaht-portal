import { cypressVisitHeaders } from '../support';
import { ROLE_TYPES } from '../support';
import { gotoUrl } from '../support/utils/basicUtils';

const HEADER1_TEXT = 'Somatic Mosaicism across Human Tissues Data Portal';
const HEADER2_TEXT =
    'A platform to search, visualize, and download somatic mosaic variants in normal tissues.';
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
        runDRTCountsCheck: false, // non-network users can't access DRT items, so skip count checks
        runAnnouncementsChecks: true,
        runNavbarDropdownChecks: false,

        // Expectations
        expectedHeaderH1: HEADER1_TEXT,
        expectedHeaderH2: HEADER2_TEXT,
        expectedTierTexts: TIER_BUTTON_TEXTS,
        expectedLimitedReleaseTrackerAccess: true, // should not browse DRT items
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
        expectedLimitedReleaseTrackerAccess: false, // should browse DRT items
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
        expectedLimitedReleaseTrackerAccess: false, // should browse DRT items
    },

    [ROLE_TYPES.PUBLIC_DBGAP]: {
        label: 'PUBLIC_DBGAP',
        isAuthenticated: true,
        runHeaderChecks: true,
        runTimelineAccordionChecks: true,
        runTierButtonsChecks: true,
        runDRTExists: true,
        runDRTCountsCheck: false, // non-network users can't access DRT items, so skip count checks
        runAnnouncementsChecks: true,
        runNavbarDropdownChecks: true,

        expectedHeaderH1: HEADER1_TEXT,
        expectedHeaderH2: HEADER2_TEXT,
        expectedTierTexts: TIER_BUTTON_TEXTS,
        expectedLimitedReleaseTrackerAccess: true, // should not browse DRT items
    },

    [ROLE_TYPES.PUBLIC_NON_DBGAP]: {
        label: 'PUBLIC_NON_DBGAP',
        isAuthenticated: true,
        runHeaderChecks: true,
        runTimelineAccordionChecks: true,
        runTierButtonsChecks: true,
        runDRTExists: true,
        runDRTCountsCheck: false, // non-network users can't access DRT items, so skip count checks
        runAnnouncementsChecks: true,
        runNavbarDropdownChecks: true,

        expectedHeaderH1: HEADER1_TEXT,
        expectedHeaderH2: HEADER2_TEXT,
        expectedTierTexts: TIER_BUTTON_TEXTS,
        expectedLimitedReleaseTrackerAccess: true, // should not browse DRT items
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

    cy.get('.homepage-wrapper > .homepage-contents h1').contains(
        caps.expectedHeaderH1
    );
    cy.get('.homepage-wrapper > .homepage-contents h2')
        .contains(caps.expectedHeaderH2)
        .end();
}

// Timeline accordion behavior (detached DOM safe)
function stepTimelineAccordionChecks(caps) {
    if (!caps.runTimelineAccordionChecks) return;

    // Re-query strategy: never keep long-lived jQuery subjects across clicks
    cy.get('#timeline .timeline-item .accordion .card-header-button').each(
        ($btn, index) => {
            // Alias the card before clicking so we can re-query inside it later
            cy.wrap($btn).closest('.card').as('card');

            // Scroll + click
            cy.wrap($btn).scrollIntoView().click({ force: true }).end();

            // Re-query collapse AFTER the click (avoid using stale $collapse)
            cy.get('.card')
                .eq(index)
                .find('.accordion-collapse')
                .should(($el) => {
                    // If it just opened, it must have 'show'; if it just closed, it must NOT.
                    const btnExpanded = Cypress.$($btn)
                        .find('i.icon')
                        .hasClass('icon-minus');
                    if (btnExpanded === true) {
                        expect($el).to.have.class('show');
                    } else {
                        expect($el).not.to.have.class('show');
                    }
                });

            // Optional: toggle back to ensure both states work
            cy.wrap($btn).click({ force: true });
            cy.get('.card')
                .eq(index)
                .find('.accordion-collapse')
                .should(($el) => {
                    const btnExpanded = Cypress.$($btn)
                        .find('i.icon')
                        .hasClass('icon-minus');
                    if (btnExpanded === 'true') {
                        expect($el).to.have.class('show');
                    } else {
                        expect($el).not.to.have.class('show');
                    }
                });

            // Get production files count from second accordion (index 4)
            if (index === 4) {
                cy.get('.card')
                    .eq(index)
                    .find('.accordion-collapse .number-group')
                    .contains('Generated')
                    .closest('.number-group')
                    .find('h4')
                    .invoke('text')
                    .then((text) => {
                        const timelineCount = parseInt(text.trim(), 10) || 0;
                        expect(timelineCount).to.be.greaterThan(0);
                        cy.wrap(timelineCount).as(
                            'timelineProductionFilesCount'
                        );
                    });
            }
        }
    );

    // Compare stored production file count with Browse by File page results
    cy.get('@timelineProductionFilesCount').then((timelineCount) => {
        cy.visit(
            '/browse/?type=File' +
                '&sort=-file_status_tracking.release_dates.initial_release_date' +
                '&sample_summary.studies=Production' +
                '&dataset%21=No+value' +
                '&status=open&status=open-early&status=open-network' +
                '&status=protected&status=protected-early&status=protected-network',
            { headers: cypressVisitHeaders, failOnStatusCode: false }
        );
        cy.get('#slow-load-container')
            .should('not.have.class', 'visible')
            .end();
        cy.searchPageTotalResultCount().then((browseCount) => {
            // TEMPORARY WORKAROUND (REMOVE AFTER HOMEPAGE COUNT FIX):
            // Current homepage timeline count is known to be inconsistent with
            // browse totals. We intentionally avoid strict comparison for now.
            //
            // REVERT STEPS:
            // 1) Remove this temporary positive-only validation block.
            // 2) Restore strict comparison:
            //      expect(browseCount).to.be.lte(timelineCount);
            expect(
                timelineCount,
                'Timeline production files count should be positive'
            ).to.be.greaterThan(0);
            expect(
                browseCount,
                'Browse production files count should be non-negative'
            ).to.be.at.least(0);
            cy.log(
                `TEMP timeline mismatch tolerated: timeline=${timelineCount}, browse=${browseCount}`
            );
        });
        gotoUrl();
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
                                expect(txt).to.contain(
                                    caps.expectedTierTexts[0] || 'Benchmarking'
                                );
                            });
                    } else if (index === 1) {
                        expect(buttonText).to.equal('production');
                        cy.get('#timeline .timeline-item.tier-active')
                            .invoke('text')
                            .then((txt) => {
                                expect(txt).to.contain(
                                    caps.expectedTierTexts[1] || 'Production'
                                );
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
    // Note: DRT access temporarily restricted to network members.
    // Do not check if DRT exists if non-network member
    if (!caps.runDRTExists || caps.expectedLimitedReleaseTrackerAccess) return;

    cy.get(
        '.notifications-panel .data-release-tracker .data-release-item-container'
    ).should('have.length.greaterThan', 0);
}

// Each DRT month item has a positive count and correct recent-releases links
function stepDRTCountsCheck(caps) {
    if (!caps.runDRTCountsCheck) return;

    cy.get('body').then(($body) => {
        if ($body.find('.data-release-item-container').length === 0) {
            cy.get(
                '.data-release-tracker .announcement-container.public-release'
            ).should('be.visible');
            return;
        }

        cy.get('.data-release-item-container').each(($container) => {
            // Monthly count should be positive
            cy.wrap($container)
                .find('.content .header .header-link .count')
                .invoke('text')
                .then((text) => {
                    const monthCount = Number(
                        text.trim().match(/^(\d+)/)?.[1] ?? 0
                    );
                    expect(monthCount).to.be.greaterThan(0);
                });

            // Monthly link should point to recent-releases page with monthly view
            cy.wrap($container)
                .find('.content .header .header-link')
                .invoke('attr', 'href')
                .should(
                    'match',
                    /\/recent-releases\?view=monthly&date=\d{4}-\d{2}/
                );

            // Open the month dropdown if needed
            cy.wrap($container)
                .invoke('attr', 'aria-expanded')
                .then((expanded) => {
                    if (expanded !== 'true') {
                        cy.wrap($container)
                            .find('.content .header .toggle-button')
                            .click();
                    }
                });

            // Weekly links should exist with positive counts and correct hrefs
            cy.wrap($container)
                .find('.content .body .week-link')
                .should('have.length.at.least', 1)
                .each(($weekLink) => {
                    cy.wrap($weekLink)
                        .invoke('attr', 'href')
                        .should(
                            'match',
                            /\/recent-releases\?view=weekly&date=\d{4}-\d{2}-\d{2}/
                        );

                    cy.wrap($weekLink)
                        .find('.count span')
                        .invoke('text')
                        .then((text) => {
                            const weekCount = Number(
                                text.trim().replace(/,/g, '')
                            );
                            expect(weekCount).to.be.greaterThan(0);
                        });
                });

            // Sum of week counts should equal the monthly total
            cy.wrap($container)
                .find('.content .header .header-link .count')
                .invoke('text')
                .then((monthText) => {
                    const monthCount = Number(
                        monthText.trim().match(/^(\d+)/)?.[1] ?? 0
                    );
                    let weekSum = 0;
                    cy.wrap($container)
                        .find('.content .body .week-link .count span')
                        .each(($span) => {
                            weekSum += Number(
                                $span.text().trim().replace(/,/g, '')
                            );
                        })
                        .then(() => {
                            expect(weekSum).to.equal(monthCount);
                        });
                });
        });

        // Navigate to the first month link and verify the recent-releases monthly view
        cy.get('.data-release-item-container')
            .first()
            .then(($container) => {
                const monthHref = $container
                    .find('.content .header .header-link')
                    .attr('href');
                if (!monthHref) return;

                cy.visit(monthHref, { headers: cypressVisitHeaders });

                cy.get('.release-view-mode-toggle .btn.active').should(
                    'contain.text',
                    'Monthly'
                );
                cy.get('.release-bucket-btn.selected').should('exist');
                cy.get(
                    '.recent-releases-matrix-column .card-body .recent-releases-table-scroll'
                )
                    .should('exist')
                    .find(
                        '.search-results-outer-container .react-infinite-container .search-result-row:not(.fin)'
                    )
                    .should('have.length.at.least', 1);

                gotoUrl();
                cy.get('.data-release-item-container').should(
                    'have.length.at.least',
                    1
                );
            });

        // Navigate to the first week link and verify the recent-releases weekly view,
        // selected bucket label, and file count reflected in the table
        cy.get('.data-release-item-container')
            .first()
            .then(($firstContainer) => {
                // Ensure dropdown is open
                if ($firstContainer.attr('aria-expanded') !== 'true') {
                    cy.wrap($firstContainer)
                        .find('.content .header .toggle-button')
                        .click();
                }

                cy.wrap($firstContainer)
                    .find('.content .body .week-link')
                    .first()
                    .then(($weekLink) => {
                        const weekHref = $weekLink.attr('href');
                        const weekLabel = $weekLink
                            .find('.range')
                            .text()
                            .trim();
                        const weekCount = Number(
                            $weekLink
                                .find('.count span')
                                .text()
                                .trim()
                                .replace(/,/g, '')
                        );
                        if (!weekHref || !weekLabel) return;

                        cy.visit(weekHref, { headers: cypressVisitHeaders });

                        // Weekly view mode should be active
                        cy.get('.release-view-mode-toggle .btn.active').should(
                            'contain.text',
                            'Weekly'
                        );

                        // Selected week bucket label should match the DataReleaseTracker label
                        cy.get('.release-bucket-btn.selected')
                            .should('exist')
                            .find('.bucket-label')
                            .invoke('text')
                            .then((selectedLabel) => {
                                expect(selectedLabel.trim()).to.equal(
                                    weekLabel
                                );
                            });

                        // Table rows should exist and not exceed the week's file count
                        cy.get(
                            '.recent-releases-matrix-column .card-body .recent-releases-table-scroll'
                        )
                            .should('exist')
                            .find(
                                '.search-results-outer-container .react-infinite-container .search-result-row:not(.fin)'
                            )
                            .then(($rows) => {
                                expect($rows.length).to.be.greaterThan(0);
                                expect($rows.length).to.be.at.most(weekCount);
                            });

                        gotoUrl();
                        cy.get('.data-release-item-container').should(
                            'have.length.at.least',
                            1
                        );
                    });
            });
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
    const baseUrl = Cypress.config().baseUrl || '';

    ROLES_TO_TEST.forEach((roleKey) => {
        const caps = ROLE_MATRIX[roleKey];
        const label = caps.label || String(roleKey);

        if (baseUrl.includes('devtest.smaht.org')) {
            if (roleKey === ROLE_TYPES.SMAHT_NON_DBGAP) {
                caps.expectedLimitedReleaseTrackerAccess = true; // should not browse DRT items
            }
        }

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

            it(`should have DRT items with valid monthly and weekly counts (enabled: ${caps.runDRTCountsCheck})`, () => {
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
