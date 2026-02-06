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
        runDRTCountsCheck: true,
        runAnnouncementsChecks: true,
        runNavbarDropdownChecks: false,

        // Expectations
        expectedHeaderH1: HEADER1_TEXT,
        expectedHeaderH2: HEADER2_TEXT,
        expectedTierTexts: TIER_BUTTON_TEXTS,
        expectNoResultsModalFromDRT: true, // should not have access to DRT items
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
        expectNoResultsModalFromDRT: false, // should have access to DRT items
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
        expectNoResultsModalFromDRT: false, // should have access to DRT items
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
        expectNoResultsModalFromDRT: false, // should have access to DRT items
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
        }
    );
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
    if (!caps.runDRTExists) return;

    cy.get(
        '.notifications-panel .data-release-tracker .data-release-item-container'
    ).should('have.length.greaterThan', 0);
}

// Each DRT item navigates and matches file counts
function stepDRTCountsCheck(caps) {
    if (!caps.runDRTCountsCheck) return;

    cy.get('.data-release-item-container').each(($container) => {
        // Month level count
        const expectedCount = Number(
            $container
                .find('.content .header .header-link .count')
                .text()
                .trim()
                .match(/^(\d+)/)?.[1] ?? 0
        );

        // Open the month drop down if not open already
        cy.wrap($container)
            .invoke('attr', 'aria-expanded')
            .then((expanded) => {
                if (expanded !== 'true') {
                    cy.wrap($container)
                        .find('.content .header .toggle-button')
                        .click();
                }
            });

        cy.wrap($container)
            .find('.content .body .release-item.day-group')
            .should('have.length.at.least', 1)
            .then(($days) => {
                let dayTotalSum = 0;

                // Loop through each day item
                cy.wrap($days)
                    .each(($day) => {
                        cy.wrap($day)
                            .find('.toggle-button.day')
                            .then(($toggle) => {
                                // Open the day drop down if not open already
                                if ($day.attr('aria-expanded') !== 'true') {
                                    cy.wrap($toggle).click();
                                }
                            });

                        // Get the day count
                        cy.wrap($day)
                            .find('.day-group-header .title .count')
                            .then(($dayCount) => {
                                const dayCount = Number(
                                    $dayCount
                                        .text()
                                        .trim()
                                        .match(/^(\d+)/)?.[1] ?? 0
                                );
                                expect(dayCount).to.be.greaterThan(0);
                                dayTotalSum += dayCount;
                            });

                        // Sum donor counts inside each day
                        let donorSum = 0;
                        cy.wrap($day)
                            .find('.donor-group-header .title .count')
                            .then(($counts) => {
                                cy.wrap($counts)
                                    .each(($count) => {
                                        const count = Number(
                                            $count
                                                .text()
                                                .trim()
                                                .match(/^(\d+)/)?.[1] ?? 0
                                        );
                                        donorSum += count;
                                    })
                                    .then(() => {
                                        expect(donorSum).to.be.greaterThan(0);
                                        expect(donorSum).to.equal(dayTotalSum);
                                    });
                            });
                    })
                    .then(() => {
                        // Check the dayTotalSum against the expectedCount
                        expect(dayTotalSum).to.be.greaterThan(0);
                        expect(dayTotalSum).to.equal(expectedCount);
                    });
            });
    });

    // Check that the counts are reflected in the browse page
    cy.get('.data-release-item-container').then(($containers) => {
        const pages = [...$containers].map((el) => {
            const link = el.querySelector('.header-link');

            return {
                expectedCount: Number(
                    link
                        ?.querySelector('.count')
                        ?.textContent.trim()
                        .match(/^(\d+)/)?.[1] ?? 0
                ),
            };
        });

        cy.wrap(pages).each(({ expectedCount }, index) => {
            // Click the header link (in-app navigation)
            cy.get('.data-release-item-container')
                .eq(index)
                .find('.header-link')
                .click();

            // Assert browse page state
            if (caps.expectNoResultsModalFromDRT) {
                cy.get('#download-access-required-modal').should('be.visible');
            } else {
                cy.searchPageTotalResultCount().should('eq', expectedCount);
            }

            // Go back to the release tracker
            cy.go('back');

            // Ensure the page is ready for the next iteration
            cy.get('.data-release-item-container').should(
                'have.length.at.least',
                1
            );
        });
    });
}

// Sum of all donor totals inside this container
// let containerDonorSum = 0;

// cy.wrap($container)
//     .find('.body .release-item')
//     .should('have.length.at.least', 1)
//     .then(($days) => {
//         // Loop through each day item
//         const dayCount = $days.length;
//         cy.wrap([...Array.from(dayCount).keys()]).each((i) => {
//             cy.wrap($container)
//                 .find('.body .release-item')
//                 .eq(i)
//                 .find('.header-link .count')
//                 .then(($count) => {
//                     const count = Number(
//                         $count
//                             .text()
//                             .trim()
//                             .match(/^(\d+)/)?.[1] ?? 0
//                     );
//                     containerDonorSum += count;
//                 });
//         });
//     });

// cy.wrap($container)
//     .find('.release-item')
//     .should('have.length.at.least', 1)
//     .then(($days) => {
//         const dayCount = $days.length;

//         cy.wrap([...Array.from(dayCount).keys()]).each((i) => {

//             cy.wrap($container)
//                 .find('.day-group-header')
//                 .eq(i)
//                 .find('.toggle-button.day');

//             if ($day.attr('aria-expanded') !== 'true') {
//                 cy.wrap($day).find('.toggle-button.day').click();
//             }

//             cy.wrap($container)
//                 .find('.day-group-header')
//                 .eq(i)
//                 .next('ul.donor-list')
//                 .find('.donor-group-header .title .count')
//                 .then(($donors) => {
//                     const donorTotal = [...$donors].reduce(
//                         (sum, el) => {
//                             return (
//                                 sum +
//                                 Number(
//                                     el.innerText.match(/^(\d+)/)?.[1] ??
//                                         0
//                                 )
//                             );
//                         },
//                         0
//                     );

//                     cy.wrap($container)
//                         .find('.day-group-header .title .count')
//                         .eq(i)
//                         .invoke('text')
//                         .then((text) => {
//                             const dayTotal = Number(
//                                 text.match(/^(\d+)/)?.[1] ?? 0
//                             );
//                             expect(donorTotal).to.eq(dayTotal);
//                         });
//                 });

//         })

//         // Loop through each day, toggle, and check donor totals
//         cy.wrap($container)
//             .find('.day-group-header')
//             .should('have.length.at.least', 1)
//             .then(($days) => {
//                 const count = $days.length;
//             });

//         for (let i = 0; i < dayCount; i++) {
//         }
//     })
//     .then(() => {
//         expect(containerDonorSum).to.eq(expectedCount);
//     });

// const href = $container.find('.header-link').attr('href');

// cy.wrap($container).then(() => {
//     cy.visit(href, { headers: cypressVisitHeaders });

//     // TODO: Check that the NoResultsModal renders if we expect it

//     cy.searchPageTotalResultCount().should('eq', expectedCount);
//     cy.go('back');
//     cy.get('.data-release-item-container').should(
//         'have.length.at.least',
//         1
//     );
// });

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
