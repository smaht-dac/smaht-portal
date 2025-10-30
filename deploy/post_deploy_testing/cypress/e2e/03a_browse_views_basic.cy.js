// cypress/e2e/browse_by_role.cy.js
import { cypressVisitHeaders, ROLE_TYPES } from '../support';
import { navBrowseBtnSelector, dataNavBarItemSelectorStr } from '../support/selectorVars';

/* ----------------------------- ROLE MATRIX -----------------------------
   Toggle each step per role. Adjust per your access model.

   - runNavFromHome:           From Home → open "Data" menu → click "Browse"
   - runDirectBrowseRedirect:  Visit /browse/ (no params) → redirected to Production
   - runQuickInfoBarCounts:    Verify QuickInfoBar has non-zero stats
   - runSidebarToggle:         Sidebar toggle expand/collapse
   - runFacetIncludeGrouping:  Include a grouping term → all sub-terms selected
   - runFacetExcludeGrouping:  Exclude a grouping term → all sub-terms excluded
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

        expectedStatsSummaryOpts: EMPTY_STATS_SUMMARY_OPTS,
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

        expectedStatsSummaryOpts: DEFAULT_STATS_SUMMARY_OPTS,
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

        expectedStatsSummaryOpts: DEFAULT_STATS_SUMMARY_OPTS,
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

        expectedStatsSummaryOpts: EMPTY_STATS_SUMMARY_OPTS,
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

        expectedStatsSummaryOpts: EMPTY_STATS_SUMMARY_OPTS,
    },
};

/* ----------------------------- SESSION HELPERS ----------------------------- */

function goto(url = '/', headers = cypressVisitHeaders) {
    cy.visit(url, { headers });
}

function visitBrowseByFile(){
    return cy.get(dataNavBarItemSelectorStr)
        .should('have.class', 'dropdown-toggle')
        .click()
        .should('have.class', 'dropdown-open-for')
        .end()
        .get(navBrowseBtnSelector)
        .click()
        .get('#slow-load-container').should('not.have.class', 'visible').end()
        .get('.facet-charts.loading').should('not.exist');
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
    visitBrowseByFile()
        .then(() => {
            cy.get('#page-title-container .page-title')
                .should('contain', 'SMaHT Production Data');
            cy.location('search')
                .should('include', 'type=File')
                .and('include', 'sample_summary.studies=Production')
                .and('include', 'status=open')
                .and('include', 'status=open-early')
                .and('include', 'status=open-network')
                .and('include', 'status=protected')
                .and('include', 'status=protected-early')
                .and('include', 'status=protected-network');
        });
}

/** Visit /browse/ (no params) → redirected to Production browse query */
/** NOT IN USE - BACKEND REDIRECT NOT IMPLEMENTED YET */
function stepDirectBrowseRedirect(caps) {
    cy.visit('/browse/', { headers: cypressVisitHeaders, failOnStatusCode: false });
    cy.location('search').should('include', 'sample_summary.studies=Production');
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

/** Include a grouping term → sub-terms should all be selected */
function stepFacetIncludeGrouping(caps) {
    if (caps.expectedStatsSummaryOpts.totalFiles === 0) {
        cy.searchPageTotalResultCount().then((totalCountExpected) => {
            expect(totalCountExpected).to.equal(0);
        });
        cy.log('Skipping stepFacetIncludeGrouping since no data is accessible for this role.');
        return;
    }

    visitBrowseByFile()
        .get('.facets-header .facets-title')
        .should('have.text', 'Included Properties').end()
        .get('.facet[data-field="file_sets.libraries.assay.display_title"]')
        .then(($facet) => {
            if ($facet.hasClass('closed')) {
                cy.wrap($facet).find('h5').click();
            }
        })
        .get('.facet.open[data-field="file_sets.libraries.assay.display_title"] .facet-list-element[data-is-grouping="true"] a')
        .should('have.attr', 'data-selected', 'false')
        .first()
        .within(($term) => {
            const subTerms = [];
            const subTermsSelected = [];
            let groupingTermKey;

            // Read grouping term key and collect its sub-terms
            cy.get('span.facet-item.facet-item-group-header')
                .then((termKey) => {
                    groupingTermKey = termKey.text();
                    expect(groupingTermKey).to.not.be.empty;

                    cy.root()
                        .closest('.facet[data-field="file_sets.libraries.assay.display_title"]')
                        .find(`.facet-list-element[data-grouping-key="${groupingTermKey}"] a`)
                        .each(($el) => {
                            cy.wrap($el).find('span.facet-item').then((t) => {
                                const subTermKey = t.text();
                                subTerms.push(subTermKey);
                                expect(subTermKey).to.not.be.empty;
                            }).end();
                        })
                        .then(() => {
                            expect(subTerms.length).to.be.greaterThan(0);
                        });
                })
                .end();

            // Click the grouping term → all sub-terms should be selected
            cy.wrap($term).click().end().then(() => {
                cy.document()
                    .its('body')
                    .find(`.facet[data-field="file_sets.libraries.assay.display_title"] .facet-list-element[data-grouping-key="${groupingTermKey}"].selected a`)
                    .each(($el) => {
                        cy.wrap($el).find('span.facet-item').then((t) => {
                            const subTermKey = t.text();
                            subTermsSelected.push(subTermKey);
                            expect(subTermKey).to.not.be.empty;
                        }).end();
                    })
                    .then(() => {
                        expect(subTerms.length).to.equal(subTermsSelected.length);
                        cy.wrap(subTerms).should('deep.equal', subTermsSelected);
                    });
            });
        })
        .end();

        // workaround for stepFacetExcludeGrouping step to start fresh otherwise the facets state is preserved
        goto('/');
}

/** Exclude a grouping term → sub-terms should all be excluded (omitted) */
function stepFacetExcludeGrouping(caps) {
    if (caps.expectedStatsSummaryOpts.totalFiles === 0) {
        cy.searchPageTotalResultCount().then((totalCountExpected) => {
            expect(totalCountExpected).to.equal(0);
        });
        cy.log('Skipping stepFacetExcludeGrouping since no data is accessible for this role.');
        return;
    }

    visitBrowseByFile()
        .get('.facets-header button', { scrollBehavior: false })
        .eq(1)
        .click()
        .end()
        .get('.facets-header .facets-title')
        .should('have.text', 'Excluded Properties')
        .end()
        .get('.facet[data-field="file_sets.libraries.assay.display_title"]')
        .then(($facet) => {
            if ($facet.hasClass('closed')) {
                cy.wrap($facet).find('h5').click();
            }
        })
        .end()
        .get('.facet[data-field="file_sets.libraries.assay.display_title"] .facet-list-element[data-is-grouping="true"] a')
        .eq(0)
        .within(($term) => {
            const subTerms = [];
            const subTermsSelected = [];
            let groupingTermKey;

            // Read grouping term key and collect its sub-terms
            cy.get('span.facet-item.facet-item-group-header')
                .then((termKey) => {
                    groupingTermKey = termKey.text();
                    expect(groupingTermKey).to.not.be.empty;

                    cy.root()
                        .closest('.facet[data-field="file_sets.libraries.assay.display_title"]')
                        .find(`.facet-list-element[data-grouping-key="${groupingTermKey}"] a`)
                        .each(($el) => {
                            cy.wrap($el).find('span.facet-item').then((t) => {
                                const subTermKey = t.text();
                                subTerms.push(subTermKey);
                                expect(subTermKey).to.not.be.empty;
                            }).end();
                        })
                        .then(() => {
                            expect(subTerms.length).to.be.greaterThan(0);
                        });
                })
                .end();

            // Click the grouping term (all sub-terms should be omitted)
            cy.wrap($term).click().end().then(() => {
                cy.document()
                    .its('body')
                    .find(`.facet[data-field="file_sets.libraries.assay.display_title"] .facet-list-element[data-grouping-key="${groupingTermKey}"].omitted a`)
                    .each(($el) => {
                        cy.wrap($el).find('span.facet-item').then((t) => {
                            const subTermKey = t.text();
                            subTermsSelected.push(subTermKey);
                            expect(subTermKey).to.not.be.empty;
                        }).end();
                    })
                    .then(() => {
                        expect(subTerms.length).to.equal(subTermsSelected.length);
                        cy.wrap(subTerms).should('deep.equal', subTermsSelected);
                    });
            });
        })
        .end();
}

/* ----------------------------- PARAMETERIZED SUITE ----------------------------- */

const ROLES_TO_TEST = [
    'UNAUTH',
    ROLE_TYPES.SMAHT_DBGAP,
    ROLE_TYPES.SMAHT_NON_DBGAP,
    ROLE_TYPES.PUBLIC_DBGAP,
    ROLE_TYPES.PUBLIC_NON_DBGAP,
];

describe('Browse by role — File (Basic)', () => {
    ROLES_TO_TEST.forEach((roleKey) => {
        const caps = ROLE_MATRIX[roleKey];
        const label = caps.label || String(roleKey);

        context(`${label} → browse capabilities`, () => {
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

            it(`Facet include grouping → sub-terms selected (enabled: ${caps.runFacetIncludeGrouping})`, () => {
                if (!caps.runFacetIncludeGrouping) return;
                stepFacetIncludeGrouping(caps);
            });

            it(`Facet exclude grouping → sub-terms omitted (enabled: ${caps.runFacetExcludeGrouping})`, () => {
                if (!caps.runFacetExcludeGrouping) return;
                stepFacetExcludeGrouping(caps);
            });
        });
    });
});
