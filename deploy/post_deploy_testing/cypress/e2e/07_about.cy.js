// cypress/e2e/about_by_role.cy.js
import { cypressVisitHeaders, ROLE_TYPES } from "../support";

/* ----------------------------- ROLE MATRIX -----------------------------
   Toggle each step per role:

   - runAwardeesCount:   "Consortium Members" page → legend/table count match, project number + link check
   - runMemberHover:     map pin hover → popover shown/hidden
   - runDataHover:       "SMaHT Data" page → header hover & cell popover
------------------------------------------------------------------------- */
const ROLE_MATRIX = {
    UNAUTH: {
        label: "Unauthenticated",
        isAuthenticated: false,

        runAwardeesCount: true,
        runMemberHover: true,
        runDataHover: true,
    },

    [ROLE_TYPES.SMAHT_DBGAP]: {
        label: "SMAHT_DBGAP",
        isAuthenticated: true,

        runAwardeesCount: true,
        runMemberHover: true,
        runDataHover: true,
    },

    [ROLE_TYPES.SMAHT_NON_DBGAP]: {
        label: "SMAHT_NON_DBGAP",
        isAuthenticated: true,

        runAwardeesCount: true,
        runMemberHover: true,
        runDataHover: true,
    },

    [ROLE_TYPES.PUBLIC_DBGAP]: {
        label: "PUBLIC_DBGAP",
        isAuthenticated: true,

        runAwardeesCount: true,
        runMemberHover: true,
        runDataHover: true,
    },

    [ROLE_TYPES.PUBLIC_NON_DBGAP]: {
        label: "PUBLIC_NON_DBGAP",
        isAuthenticated: true,

        runAwardeesCount: true,
        runMemberHover: true,
        runDataHover: true,
    },
};

/* ----------------------------- SESSION HELPERS ----------------------------- */

function goto(url = "/", headers = cypressVisitHeaders) {
    cy.visit(url, { headers });
}

function loginIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) cy.loginSMaHT(roleKey).end();
}

function logoutIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) cy.logoutSMaHT();
}

/* ----------------------------- STEP HELPERS ----------------------------- */

/** Consortium Members: legend count must match table count by abbreviation
 *  + For each row, assert the "Project number" label and NIH Reporter link exist and look valid.
 */
function stepAwardeesCount() {
    cy.get('#about-menu-item')
        .should('have.class', 'dropdown-toggle')
        .click()
        .should('have.class', 'dropdown-open-for')
        .then(() => {
            cy.get('#menutree-linkto-about_consortium_awardees').click().end()
                .get('#page-title-container .page-title')
                .should('contain', 'SMaHT Consortium Members')
                .end()

                // --- Part 1: Legend → table abbreviation count match (existing check) ---
                .get('.consortium-map-container svg > g.consortium-legend > text')
                .each(($el) => {
                    cy.wrap($el)
                        .invoke('text')
                        .then((text) => {
                            // Build abbreviation from capitalized words in legend label
                            const abbreviation = text
                                .split(' ')
                                .filter((word) => /^[A-Z]/.test(word))
                                .map((word) => word[0])
                                .join('');

                            const number = parseInt(text.match(/\d+/)[0], 10);

                            cy.get(`.table-responsive > table > tbody > tr > td.consortium-table-${abbreviation}`)
                                .its('length')
                                .then((count) => {
                                    expect(Number(count)).to.equal(number);
                                });
                        });
                })

                // --- Part 2: For each table row, validate Project number + link ---
                .then(() => {
                    // Grab every row in the consortium table body
                    cy.get('.table.table-sm.table-striped > tbody > tr').each(($tr) => {
                        // The 5th column (<td>) contains title + <small>Project number: <a ...>CODE</a>
                        cy.wrap($tr).find('td').eq(4).as('projectCell');

                        // 2.1 Ensure the label exists
                        cy.get('@projectCell')
                            .should('contain.text', 'Project number:')
                            .find('small')
                            .should('contain.text', 'Project number:');

                        // 2.2 Validate the anchor element exists and has a sensible href
                        cy.get('@projectCell')
                            .find('a.link-underline-hover[href]')
                            .should('have.length.at.least', 1) // At least one project link
                            .first()
                            .then(($a) => {
                                const text = ($a.text() || '').trim();
                                const href = $a.attr('href') || '';

                                // Link text should look like a grant code (non-empty, contains hyphen)
                                // e.g., "1UM1DA058235-01"
                                expect(text, 'project code text').to.match(/[A-Z0-9-]+/);
                                expect(text.includes('-'), 'project code has hyphen').to.be.true;

                                // Href should point to NIH Reporter project-details/<digits>
                                expect(href, 'NIH Reporter URL').to.match(/^https:\/\/reporter\.nih\.gov\/project-details\/\d+$/);

                                // (Optional) Target/rel attributes are recommended for external links
                                // Keep these as soft checks — only assert if present.
                                const target = $a.attr('target');
                                const rel = $a.attr('rel');
                                if (target) expect(target).to.equal('_blank');
                                if (rel) expect(rel).to.match(/\bnoreferrer\b/);
                            });
                    });
                });
        });
}


/** Consortium Members: hover over a pin shows popover; mouseout hides it */
function stepMemberHover() {
    cy.get('.consortium-map-container > .interaction-notice')
        .should('contain', 'Hover over pins to read more about each SMaHT Consortium Member')
        .end();

    cy.get('.consortium-map-container > svg')
        .find('g[transform]')
        .first()
        .scrollIntoView()
        .find('svg')
        .trigger('mouseover', { force: true })
        .should('have.attr', 'aria-describedby', 'popover-consortium-map')
        .then(($svg) => {
            cy.wrap($svg)
                .trigger('mouseout', { force: true })
                .should('not.have.attr', 'aria-describedby', 'popover-consortium-map');
        });
}

/** SMaHT Data: header hover expands; cell hover shows popover; mouseout hides */
function stepDataHover() {
    cy.get('#about-menu-item')
        .should('have.class', 'dropdown-toggle')
        .click()
        .should('have.class', 'dropdown-open-for')
        .then(() => {
            cy.get('#menutree-linkto-about_consortium_data').click().end()
                .get('#page-title-container .page-title')
                .should('contain', 'SMaHT Data')
                .end()
                // Header hover expands
                .get('.stackrow-table > thead > tr > th > span')
                .first()
                .scrollIntoView()
                .trigger('mouseover', { force: true })
                .should('have.attr', 'aria-expanded', 'true')
                .then(($el) => {
                    cy.wrap($el)
                        .trigger('mouseout', { force: true })
                        .should('have.attr', 'aria-expanded', 'false');
                })
                .end()
                // Cell hover shows popover
                .get('.stackrow-table .stackrow-table-body > tr.stackrow-row > td.stackrow-item > div.stackrow-item-container > span')
                .first()
                .trigger('mouseover', { force: true })
                .should('have.attr', 'aria-describedby', 'popover-consortium-data-alluvial-table')
                .then(($span) => {
                    cy.wrap($span)
                        .trigger('mouseout', { force: true })
                        .should('not.have.attr', 'aria-describedby', 'popover-consortium-data-alluvial-table');
                });
        });
}

/* ----------------------------- PARAMETERIZED SUITE ----------------------------- */

const ROLES_TO_TEST = [
    "UNAUTH",
    ROLE_TYPES.SMAHT_DBGAP,
    ROLE_TYPES.SMAHT_NON_DBGAP,
    ROLE_TYPES.PUBLIC_DBGAP,
    ROLE_TYPES.PUBLIC_NON_DBGAP,
];

describe('About Layout by role', () => {
    ROLES_TO_TEST.forEach((roleKey) => {
        const caps = ROLE_MATRIX[roleKey];
        const label = caps.label || String(roleKey);

        context(`${label} → about capabilities`, () => {
            before(() => {
                goto('/');
                loginIfNeeded(roleKey);
            });

            after(() => {
                logoutIfNeeded(roleKey);
            });

            it(`Consortium member count matches table (enabled: ${caps.runAwardeesCount})`, () => {
                if (!caps.runAwardeesCount) return;
                stepAwardeesCount();
            });

            it(`Consortium member hover popover (enabled: ${caps.runMemberHover})`, () => {
                if (!caps.runMemberHover) return;
                stepMemberHover();
            });

            it(`Consortium data hover interactions (enabled: ${caps.runDataHover})`, () => {
                if (!caps.runDataHover) return;
                stepDataHover();
            });
        });
    });
});
