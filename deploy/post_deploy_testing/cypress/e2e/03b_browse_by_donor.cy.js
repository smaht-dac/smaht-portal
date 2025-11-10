import { cypressVisitHeaders, ROLE_TYPES, BROWSE_STATUS_PARAMS } from '../support';
import { navBrowseByDonorBtnSelector, dataNavBarItemSelectorStr } from '../support/selectorVars';
import { getApiTotalFromUrl, parseIntSafe } from '../support/utils/dataMatrixUtils';

/* ----------------------------- ROLE MATRIX -----------------------------
   Toggle each step per role:

   - runNavFromHome:           From Home → open "Data" menu → click "Browse"
   - runDirectBrowseRedirect:  Visit /browse/ (no params) → redirected to Production
   - runQuickInfoBarCounts:    Verify QuickInfoBar has non-zero stats
   - runSidebarToggle:         Sidebar toggle expand/collapse
------------------------------------------------------------------------- */

const EMPTY_STATS_SUMMARY_OPTS = {
    totalFiles: 0,
    totalDonors: 0,
    totalTissues: 0,
    totalAssays: 0,
    totalFileSizeGB: 0,
};
const DEFAULT_STATS_SUMMARY_OPTS = {
    totalFiles: 20,
    totalDonors: 2,
    totalTissues: 2,
    totalAssays: 2,
    totalFileSizeGB: 1,
};

const ROLE_MATRIX = {
    UNAUTH: {
        label: 'Unauthenticated',
        isAuthenticated: false,

        runNavFromHome: true,
        runDirectBrowseRedirect: false,
        runQuickInfoBarCounts: true,
        runSidebarToggle: true,
        runFacetIncludeGrouping: true,
        runFacetExcludeGrouping: true,
        runFacetChartBarPlotTests: true,

        expectedStatsSummaryOpts: EMPTY_STATS_SUMMARY_OPTS,
        expectedType: 'Donor',
    },

    [ROLE_TYPES.SMAHT_DBGAP]: {
        label: 'SMAHT_DBGAP',
        isAuthenticated: true,

        runNavFromHome: true,
        runDirectBrowseRedirect: false,
        runQuickInfoBarCounts: true,
        runSidebarToggle: true,
        runFacetIncludeGrouping: true,
        runFacetExcludeGrouping: true,
        runFacetChartBarPlotTests: true,

        expectedStatsSummaryOpts: DEFAULT_STATS_SUMMARY_OPTS,
        expectedType: 'ProtectedDonor',
    },

    [ROLE_TYPES.SMAHT_NON_DBGAP]: {
        label: 'SMAHT_NON_DBGAP',
        isAuthenticated: true,

        runNavFromHome: true,
        runDirectBrowseRedirect: false,
        runQuickInfoBarCounts: true,
        runSidebarToggle: true,
        runFacetIncludeGrouping: true,
        runFacetExcludeGrouping: true,
        runFacetChartBarPlotTests: true,

        expectedStatsSummaryOpts: DEFAULT_STATS_SUMMARY_OPTS,
        expectedType: 'Donor',
    },

    [ROLE_TYPES.PUBLIC_DBGAP]: {
        label: 'PUBLIC_DBGAP',
        isAuthenticated: true,

        runNavFromHome: true,
        runDirectBrowseRedirect: false,
        runQuickInfoBarCounts: true,
        runSidebarToggle: true,
        runFacetIncludeGrouping: true,
        runFacetExcludeGrouping: true,
        runFacetChartBarPlotTests: true,

        expectedStatsSummaryOpts: EMPTY_STATS_SUMMARY_OPTS,
        expectedType: 'Donor',
    },

    [ROLE_TYPES.PUBLIC_NON_DBGAP]: {
        label: 'PUBLIC_NON_DBGAP',
        isAuthenticated: true,

        runNavFromHome: true,
        runDirectBrowseRedirect: false,
        runQuickInfoBarCounts: true,
        runSidebarToggle: true,
        runFacetIncludeGrouping: true,
        runFacetExcludeGrouping: true,
        runFacetChartBarPlotTests: true,

        expectedStatsSummaryOpts: EMPTY_STATS_SUMMARY_OPTS,
        expectedType: 'Donor',
    },
};

/* ----------------------------- SESSION HELPERS ----------------------------- */

function goto(url = '/', headers = cypressVisitHeaders) {
    cy.visit(url, { headers });
}

/**
 * Navigates from the Browse dropdown to the Donor View.
 * @param {Object} caps - Config object containing the expected type (e.g. { expectedType: 'ProtectedDonor' })
 * @returns {Cypress.Chainable} - Cypress chain for further chaining
 */
function visitBrowseByDonor(caps) {
    const typeParam = `type=${caps.expectedType}`;

    // Step 1: Open the dropdown menu
    cy.getLoadedMenuItem(dataNavBarItemSelectorStr)
        .click()
        .should('have.class', 'dropdown-open-for');

    // Step 2: Validate the target link contains the correct href parameter
    cy.get(navBrowseByDonorBtnSelector)
        .should('have.attr', 'href')
        .and('include', typeParam);

    // Step 3: Re-query and click the link (to avoid detached DOM issues)
    cy.get(navBrowseByDonorBtnSelector)
        .should('be.visible')
        .click();

    // Step 4: Verify correct navigation
    cy.location('search').should('include', typeParam);

    // Step 5: Wait for page loading to complete
    return cy
        .get('#slow-load-container', { timeout: 30000 })
        .should('not.have.class', 'visible')
        .get('.facet-charts.loading', { timeout: 30000 })
        .should('not.exist');
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

/** From Home → open "Data" dropdown → click "Browse" → lands on Production Data */
function stepNavigateFromHomeToBrowse(caps) {

    visitBrowseByDonor(caps).then(() => {
        cy.get('#page-title-container .page-title')
            .should('contain', 'SMaHT Production Data');

        cy.location('search').then((search) => {
            // Base query parameters that should always be included
            const baseParams = [`type=${caps.expectedType}`, 'study=Production'];

            // Split dynamic status parameters and merge them with base ones
            const allParams = [...baseParams, ...BROWSE_STATUS_PARAMS.split('&')];

            // Assert that each expected query parameter is present in the URL search string
            allParams.forEach((param) => {
                expect(search).to.include(param);
            });
        });
    });
}

/** Visit /browse/ (no params) → redirected to Production browse query */
/** NOT IN USE - BACKEND REDIRECT NOT IMPLEMENTED YET */
function stepDirectBrowseRedirect(caps) {
    cy.visit('/browse/', { headers: cypressVisitHeaders, failOnStatusCode: false });
    cy.location('search').should('include', 'study=Production');
}

/** QuickInfoBar numbers should be present and > 0 (or ≥ threshold for size) */
function stepQuickInfoBarCounts(caps) {
    cy.getQuickInfoBar().then((info) => {
        cy.log('Files Generated: ' + info.file);
        if (caps.expectedStatsSummaryOpts.totalFiles > 0)
            expect(info.file).to.be.at.least(caps.expectedStatsSummaryOpts.totalFiles);
        else
            expect(info.file).to.equal(0);

        cy.log('Donors: ' + info.donor);
        if (caps.expectedStatsSummaryOpts.totalDonors > 0)
            expect(info.donor).to.be.at.least(caps.expectedStatsSummaryOpts.totalDonors);
        else
            expect(info.donor).to.equal(0);

        cy.log('Tissues: ' + info.tissue);
        if (caps.expectedStatsSummaryOpts.totalTissues > 0)
            expect(info.tissue).to.be.at.least(caps.expectedStatsSummaryOpts.totalTissues);
        else
            expect(info.tissue).to.equal(0);

        cy.log('Assays: ' + info.assay);
        if (caps.expectedStatsSummaryOpts.totalAssays > 0)
            expect(info.assay).to.be.at.least(caps.expectedStatsSummaryOpts.totalAssays);
        else
            expect(info.assay).to.equal(0);

        cy.log('Total File Size: ' + info['file-size']);
        if (caps.expectedStatsSummaryOpts.totalFileSizeGB > 0)
            expect(info['file-size']).to.be.at.least(0.01);
        else
            expect(info['file-size']).to.equal(0);
    });
}

/** Sidebar toggle expand/collapse */
function stepSidebarToggle(caps) {
    cy.get('.sliding-sidebar-nav-container .toggle-button')
        .click({ force: true })
        .should('have.attr', 'aria-expanded', 'true')
        .get('.sliding-sidebar-ui-container')
        .should('have.class', 'show-nav')
        .end()
        .get('.sliding-sidebar-nav-container .toggle-button')
        .click({ force: true })
        .should('have.attr', 'aria-expanded', 'false')
        .get('.sliding-sidebar-ui-container')
        .should('have.class', 'collapse-nav')
        .end();
}

/** Chart Bar Plot Tests */
function stepFacetChartBarPlotTests(caps) {
    if (caps.expectedStatsSummaryOpts.totalFiles > 0) {
        visitBrowseByDonor(caps).toggleView('Donor').then(() => {
            cy.get('#select-barplot-field-1')
                .should('contain', 'Sequencer')
                .end()
                .get('#select-barplot-field-0')
                .should('contain', 'Tissue')
                .end();

            cy.window().scrollTo(0, 0).end()
                // A likely-to-be-here Bar Section - Brain x Illumina NovaSeq X Plus
                .get('.bar-plot-chart .chart-bar[data-term="Brain"] .bar-part[data-term="Illumina NovaSeq X Plus"]').then(($barPart) => {
                    const expectedFilteredResults = parseInt($barPart.attr('data-count'));
                    expect(expectedFilteredResults).to.be.greaterThan(3);
                    expect(expectedFilteredResults).to.be.lessThan(25);
                    cy.window().scrollTo('top').end()
                        .wrap($barPart).hoverIn().end()
                        .get('.cursor-component-root .details-title').should('contain', 'Illumina NovaSeq X Plus').end()
                        .get('.cursor-component-root .detail-crumbs .crumb').should('contain', 'Brain').end()
                        .get('.cursor-component-root .details-title .primary-count').invoke('text').then(text => {
                            const number = parseInt(text, 10);
                            expect(number).to.eq(expectedFilteredResults);
                        })
                        // file count – retry until text is numeric and equals expected
                        .get('.cursor-component-root .details a') // Adjust selector if needed
                        .should('contain.text', 'Files') // Ensure the correct link
                        .then(($a) => {
                            const text = $a.text();      // e.g. "39 Files"
                            const href = $a.attr('href');
                            const fullUrl = href.startsWith('http')
                                ? href
                                : `${Cypress.config('baseUrl')}${href}`;

                            // Extract number before "Files"
                            const uiCount = parseIntSafe(text);

                            // Compare UI count with API total
                            getApiTotalFromUrl(fullUrl).then((apiTotal) => {
                                expect(apiTotal, `API total (${apiTotal}) should match UI count (${uiCount})`)
                                    .to.equal(uiCount);
                            });
                        });
                    // `{ force: true }` is used a bunch here to prevent Cypress from attempting to scroll browser up/down during the test -- which may interfere w. mouse hover events.
                    // See https://github.com/cypress-io/cypress/issues/2353#issuecomment-413347535
                    cy.window().then((w) => {
                        w.scrollTo(0, 0);
                    }).end()
                        .wrap($barPart, { force: true }).scrollToCenterElement().trigger('mouseover', { force: true }).trigger('mousemove', { force: true }).wait(300).click({ force: true }).end()
                        .get('.cursor-component-root .actions.buttons-container .btn-primary').should('contain', "Explore").click({ force: true }).end() // Browser will scroll after click itself (e.g. triggered by app)
                        .location('search')
                        .should('include', 'external_id=').end()
                        .get('#slow-load-container').should('not.have.class', 'visible').end()
                        .searchPageTotalResultCount().then((totalCount) => {
                            expect(totalCount).to.equal(expectedFilteredResults);
                        });

                    // Clear filters → back to initial
                    cy.getQuickInfoBar().then((info) => {
                        cy
                            .get('.properties-controls button[data-tip="Clear all filters"]')
                            .click({ force: true })
                            .get(".facet[data-field=\"external_id\"] .facet-list-element.selected .facet-item").should('not.exist').end()
                            .get("div.above-facets-table-row #results-count")
                            .invoke("text")
                            .then((count) => {
                                expect(info.donor).to.equal(parseInt(count));
                            })
                            .end();
                    });
                });
        });
    } else {
        visitBrowseByDonor(caps).toggleView('Donor').then(() => {
            cy.get('#facet-charts-container').invoke('text').should('be.empty');
            cy.log('Skipping stepFacetChartBarPlotTests since no data is accessible for this role.');
        });
    }
};

/* ----------------------------- PARAMETERIZED SUITE ----------------------------- */

const ROLES_TO_TEST = [
    'UNAUTH',
    ROLE_TYPES.SMAHT_DBGAP,
    ROLE_TYPES.SMAHT_NON_DBGAP,
    ROLE_TYPES.PUBLIC_DBGAP,
    ROLE_TYPES.PUBLIC_NON_DBGAP,
];

describe('Browse by role — Donor', () => {
    ROLES_TO_TEST.forEach((roleKey) => {
        const caps = ROLE_MATRIX[roleKey];
        const label = caps.label || String(roleKey);

        context(`${label} → browse by donor capabilities`, () => {
            before(() => {
                goto('/');
                loginIfNeeded(roleKey);
            });

            after(() => {
                logoutIfNeeded(roleKey);
            });

            it(`From Home → Browse via menu (enabled: ${caps.runNavFromHome})`, () => {
                if (!caps.runNavFromHome) return;
                stepNavigateFromHomeToBrowse(caps);
            });

            it(`Direct /browse/ redirects to Production (enabled: ${caps.runDirectBrowseRedirect})`, () => {
                if (!caps.runDirectBrowseRedirect) return;
                stepDirectBrowseRedirect(caps);
            });

            it(`QuickInfoBar has non-zero counts (enabled: ${caps.runQuickInfoBarCounts})`, () => {
                if (!caps.runQuickInfoBarCounts) return;
                stepQuickInfoBarCounts(caps);
            });

            it(`Sidebar toggle expand/collapse (enabled: ${caps.runSidebarToggle})`, () => {
                if (!caps.runSidebarToggle) return;
                stepSidebarToggle(caps);
            });

            it(`Facet chart bar plot tests → X-axis grouping and hover over & click "Illumina NovaSeq X Plus, Brain" bar part + popover button --> matching filtered /browse/ results (enabled: ${caps.runFacetChartBarPlotTests})`, () => {
                if (!caps.runFacetChartBarPlotTests) return;
                stepFacetChartBarPlotTests(caps);
            });
        });
    });
});
