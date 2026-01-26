import { cypressVisitHeaders, ROLE_TYPES, BROWSE_STATUS_PARAMS } from '../support';
import {
    navBrowseByFileBtnSelector,
    dataNavBarItemSelectorStr,
    navUserAcctLoginBtnSelector,
} from '../support/selectorVars';

/* ----------------------------- ROLE MATRIX -----------------------------
   Toggle each step per role:

   - runNavFromHome:           From Home → open "Data" menu → click "Browse"
   - runDirectBrowseRedirect:  Visit /browse/ (no params) → redirected to Production
   - runNoResultsModal:        Verify protected data warning modal behavior
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
        runNoResultsModal: true,
        runQuickInfoBarCounts: true,
        runSidebarToggle: true,
        runFacetIncludeGrouping: true,
        runFacetExcludeGrouping: true,
        runFacetChartBarPlotTests: true,

        expectedStatsSummaryOpts: EMPTY_STATS_SUMMARY_OPTS,
        expectedNoResultsModalVisible: true,
    },

    [ROLE_TYPES.SMAHT_DBGAP]: {
        label: 'SMAHT_DBGAP',
        isAuthenticated: true,

        runNavFromHome: true,
        runDirectBrowseRedirect: false,
        runNoResultsModal: true,
        runQuickInfoBarCounts: true,
        runSidebarToggle: true,
        runFacetIncludeGrouping: true,
        runFacetExcludeGrouping: true,
        runFacetChartBarPlotTests: true,

        expectedStatsSummaryOpts: DEFAULT_STATS_SUMMARY_OPTS,
        expectedNoResultsModalVisible: false,
    },

    [ROLE_TYPES.SMAHT_NON_DBGAP]: {
        label: 'SMAHT_NON_DBGAP',
        isAuthenticated: true,

        runNavFromHome: true,
        runDirectBrowseRedirect: false,
        runNoResultsModal: true,
        runQuickInfoBarCounts: true,
        runSidebarToggle: true,
        runFacetIncludeGrouping: true,
        runFacetExcludeGrouping: true,
        runFacetChartBarPlotTests: true,

        expectedStatsSummaryOpts: DEFAULT_STATS_SUMMARY_OPTS,
        expectedNoResultsModalVisible: false,
    },

    [ROLE_TYPES.PUBLIC_DBGAP]: {
        label: 'PUBLIC_DBGAP',
        isAuthenticated: true,

        runNavFromHome: true,
        runDirectBrowseRedirect: false,
        runNoResultsModal: true,
        runQuickInfoBarCounts: true,
        runSidebarToggle: true,
        runFacetIncludeGrouping: true,
        runFacetExcludeGrouping: true,
        runFacetChartBarPlotTests: true,

        expectedStatsSummaryOpts: EMPTY_STATS_SUMMARY_OPTS,
        expectedNoResultsModalVisible: false,
    },

    [ROLE_TYPES.PUBLIC_NON_DBGAP]: {
        label: 'PUBLIC_NON_DBGAP',
        isAuthenticated: true,

        runNavFromHome: true,
        runDirectBrowseRedirect: false,
        runNoResultsModal: true,
        runQuickInfoBarCounts: true,
        runSidebarToggle: true,
        runFacetIncludeGrouping: true,
        runFacetExcludeGrouping: true,
        runFacetChartBarPlotTests: true,

        expectedStatsSummaryOpts: EMPTY_STATS_SUMMARY_OPTS,
        expectedNoResultsModalVisible: true,
    },
};

/* ----------------------------- SESSION HELPERS ----------------------------- */

function goto(url = '/', headers = cypressVisitHeaders) {
    cy.visit(url, { headers });
}

function visitBrowseByFile(){
    return cy.getLoadedMenuItem(dataNavBarItemSelectorStr)
        .click()
        .should('have.class', 'dropdown-open-for')
        .end()
        .get(navBrowseByFileBtnSelector)
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

    visitBrowseByFile().then(() => {
        cy.get('#page-title-container .page-title')
            .should('contain', 'SMaHT Production Data');

        cy.location('search').then((search) => {
            // Base query parameters that should always be included
            const baseParams = ['type=File', 'sample_summary.studies=Production'];

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
    cy.location('search').should('include', 'sample_summary.studies=Production');
}

/** Modal appears when no results found */
function stepNoResultsModal(caps) {
    visitBrowseByFile().then(() => {
        if (caps.expectedNoResultsModalVisible) {
            cy.get('#download-access-required-modal').should('be.visible');
            cy.searchPageTotalResultCount().then((totalCountExpected) => {
                expect(totalCountExpected).to.equal(0);
            });

            cy.get('body').then(($body) => {
                const $loginBtn = $body.find(navUserAcctLoginBtnSelector);
                const hasLoginText =
                    $loginBtn.length > 0 &&
                    $loginBtn.text().replace(/\s+/g, ' ').trim().includes('Login / Register');
                if (hasLoginText) {
                    cy.wrap($loginBtn).click({ force: true });
                    cy.get('[id^="auth0-lock-container"], .auth0-lock')
                        .should('be.visible')
                        .then(($lock) => {
                            const lockZIndex = parseInt($lock.css('z-index') || '0', 10);
                            const modalZIndex = parseInt(
                                $body
                                    .find('#download-access-required-modal')
                                    .closest('.modal')
                                    .css('z-index') || '0',
                                10
                            );
                            if (!Number.isNaN(lockZIndex) && !Number.isNaN(modalZIndex)) {
                                expect(lockZIndex).to.be.greaterThan(modalZIndex);
                            }
                        });
                    cy.get('body').then(($auth0Body) => {
                        if ($auth0Body.find('.auth0-lock-close-button').length > 0) {
                            cy.get('.auth0-lock-close-button').click({ force: true });
                        } else if ($auth0Body.find('.auth0-lock-overlay').length > 0) {
                            cy.get('.auth0-lock-overlay').click({ force: true });
                        }
                    });
                } else {
                    cy.log('Skipping Auth0 login popup check; login button not present or not labeled "Login / Register".');
                }
            });
        } else {
            cy.get('#download-access-required-modal').should('not.exist');
        }
    });
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

/** Chart Bar Plot Tests */
function stepFacetChartBarPlotTests(caps) {
    if (caps.expectedStatsSummaryOpts.totalFiles > 0) {
        visitBrowseByFile().then(() => {
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
                    expect(expectedFilteredResults).to.be.greaterThan(50);
                    expect(expectedFilteredResults).to.be.lessThan(500);
                    return cy.window().scrollTo('top').end()
                        .get('.bar-plot-chart .chart-bar[data-term="Blood"] .bar-part[data-term="ONT PromethION 24"]').should('have.attr', 'data-count').end()
                        .wrap($barPart).hoverIn().end()
                        .get('.cursor-component-root .details-title').should('contain', 'Illumina NovaSeq X Plus').end()
                        .get('.cursor-component-root .detail-crumbs .crumb').should('contain', 'Brain').end()
                        .get('.cursor-component-root .details .text-end').invoke('text').then(text => {
                            const number = parseInt(text, 10);
                            expect(number).to.eq(expectedFilteredResults);
                        }).getQuickInfoBar().then(function (origCount) {
                            // `{ force: true }` is used a bunch here to prevent Cypress from attempting to scroll browser up/down during the test -- which may interfere w. mouse hover events.
                            // See https://github.com/cypress-io/cypress/issues/2353#issuecomment-413347535
                            return cy.window().then((w) => {
                                w.scrollTo(0, 0); }).end()
                                .wrap($barPart, { force: true }).scrollToCenterElement().trigger('mouseover', { force: true }).trigger('mousemove', { force: true }).wait(300).click({ force: true }).end()
                                .get('.cursor-component-root .actions.buttons-container .btn-primary').should('contain', "Explore").click({ force: true }).end() // Browser will scroll after click itself (e.g. triggered by app)
                                .location('search')
                                .should('include', 'sequencing.sequencer.display_title=Illumina+NovaSeq+X+Plus')
                                .should('include', 'sample_summary.tissues=Brain').end()
                                .get('#slow-load-container').should('not.have.class', 'visible').end()
                                .searchPageTotalResultCount().then((totalCount) => {
                                    expect(totalCount).to.equal(expectedFilteredResults);
                                    cy.get('.bar-plot-chart .chart-bar .bar-part').should('have.length', 1).end();
                                });
                        });
                });
        });
    } else {
        visitBrowseByFile().then(() => {
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

describe('Browse by role — File', () => {
    ROLES_TO_TEST.forEach((roleKey) => {
        const caps = ROLE_MATRIX[roleKey];
        const label = caps.label || String(roleKey);

        context(`${label} → browse by file capabilities`, () => {
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

            it(`Modal appears when no results found (enabled: ${caps.runNoResultsModal})`, () => {
                if (!caps.runNoResultsModal) return;
                stepNoResultsModal(caps);
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

            it(`Facet chart bar plot tests → X-axis grouping and hover over & click "Illumina NovaSeq X Plus, Brain" bar part + popover button --> matching filtered /browse/ results (enabled: ${caps.runFacetChartBarPlotTests})`, () => {
                if (!caps.runFacetChartBarPlotTests) return;
                stepFacetChartBarPlotTests(caps);
            });
        });
    });
});
