import { cypressVisitHeaders } from '../support';
import {
    navBrowseBtnSelector,
    navUserAcctDropdownBtnSelector,
} from '../support/selectorVars';

const dataNavBarItemSelectorStr =
    '#top-nav div.navbar-collapse .navbar-nav a.id-data-menu-item';

describe('Browse Views - Basic Tests', function () {
    before(function () {
        cy.visit('/', { headers: cypressVisitHeaders });
        cy.loginSMaHT({
            email: 'cypress-main-scientist@cypress.hms.harvard.edu',
            useEnvToken: false,
        })
            .end()
            .get(navUserAcctDropdownBtnSelector)
            .should('not.contain.text', 'Login')
            .then((accountListItem) => {
                expect(accountListItem.text()).to.contain('SCM');
            })
            .end();
    });

    after(function () {
        cy.logoutSMaHT();
    });

    context('Navigation and Redirection', function () {
        it('If start from home page, clicking on Browse by File nav menu item gets us to Browse page.', function () {
            cy.get(dataNavBarItemSelectorStr)
                .should('have.class', 'dropdown-toggle')
                .click()
                .should('have.class', 'dropdown-open-for')
                .then(() => {})
                .get(navBrowseBtnSelector)
                .click()
                .then(() => {
                    cy.get('#page-title-container .page-title').should(
                        'contain',
                        'SMaHT Production Data'
                    );
                });
        });

        it('If point browser to /browse/ page (no URL params), we also get redirected to Production Data correctly.', function () {
            // cy.visit('/');¨
            cy.visit('/browse/', {
                headers: cypressVisitHeaders,
                failOnStatusCode: false,
            });

            // Wait for redirects: we should be taken from /browse/ to /browse/?type=File&sample_summary.studies=Production&status=released
            cy.location('search').should(
                'include',
                'sample_summary.studies=Production'
            );
        });

        //TODO: Add test for when we have data to test with.
        it.skip('There is at least 1 Donor in default browse view.', function () {
            cy.getQuickInfoBar().then((info) => {
                cy.log('Files Generated: ' + info.file);
                expect(info.file).to.be.at.least(1);

                cy.log('Donors: ' + info.donor);
                expect(info.donor).to.be.at.least(1);

                cy.log('Tissues: ' + info.tissue);
                expect(info.tissue).to.be.at.least(1);

                cy.log('Assays: ' + info.assay);
                expect(info.assay).to.be.at.least(1);

                cy.log('Total File Size: ' + info['file-size']);
                expect(info['file-size']).to.be.at.least(1);
            });
        });

        it('Tests the expanding and collapsing of the toggle button.', function () {
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
        });

        // TODO: Add facet filtering test when we have more data to test with.

        // TODO: Add file download test when we have more data to test with.

        // TODO: Replace /search/?type=File with /browse when we have more data to test with.
        it('Select a grouping term in Experimental Assay facet, then check whether the sub-terms are also selected', function () {
            cy.visit('/search/?type=File&sample_summary.studies%21=No+value', {
                headers: cypressVisitHeaders,
            })
                .get('#slow-load-container')
                .should('not.have.class', 'visible')
                .end()
                .get('.facet-charts.loading')
                .should('not.exist')
                .get('.facets-header .facets-title')
                .should('have.text', 'Included Properties')
                .end()
                .get(
                    '.facet.closed[data-field="file_sets.libraries.assay.display_title"] > h5'
                )
                // .scrollIntoView()
                // .should('be.visible')
                .click()
                .end()
                .get(
                    '.facet.open[data-field="file_sets.libraries.assay.display_title"] .facet-list-element[data-is-grouping="true"] a'
                )
                .first()
                .within(($term) => {
                    const subTerms = [];
                    const subTermsSelected = [];
                    let groupingTermKey;
                    cy.get('span.facet-item.facet-item-group-header')
                        .then(function (termKey) {
                            groupingTermKey = termKey.text();
                            expect(groupingTermKey).to.not.be.empty;
                            cy.root()
                                .closest(
                                    '.facet[data-field="file_sets.libraries.assay.display_title"]'
                                )
                                .find(
                                    `.facet-list-element[data-grouping-key="${groupingTermKey}"] a`
                                )
                                .each(($el) => {
                                    cy.wrap($el)
                                        .find('span.facet-item')
                                        .then(function (termKey) {
                                            const subTermKey = termKey.text();
                                            subTerms.push(subTermKey);
                                            expect(subTermKey).to.not.be.empty;
                                        })
                                        .end();
                                })
                                .then(() => {
                                    expect(subTerms.length).to.be.greaterThan(0);
                                });
                        })
                        .end();
                    cy.wrap($term)
                        .click()
                        .end()
                        .wait(2000)
                        .then(() => {
                            cy.document()
                                .its('body')
                                .find(
                                    `.facet[data-field="file_sets.libraries.assay.display_title"] .facet-list-element[data-grouping-key="${groupingTermKey}"].selected a`
                                )
                                .each(($el) => {
                                    cy.wrap($el)
                                        .find('span.facet-item')
                                        .then(function (termKey) {
                                            const subTermKey = termKey.text();
                                            subTermsSelected.push(subTermKey);
                                            expect(subTermKey).to.not.be.empty;
                                        })
                                        .end();
                                })
                                .then(() => {
                                    expect(subTerms.length).to.equal(
                                        subTermsSelected.length
                                    );
                                    cy.wrap(subTerms).should(
                                        'deep.equal',
                                        subTermsSelected
                                    );
                                });
                        });
                })
                .end();
        });

        // TODO: Replace /search/?type=File with /browse when we have more data to test with.
        it('Exclude a grouping term in Experimental Assay facet, then check whether the sub-terms are also excluded', function () {
            cy.visit('/search/?type=File&sample_summary.studies%21=No+value', {
                headers: cypressVisitHeaders,
            });
            cy.get('#slow-load-container')
                .should('not.have.class', 'visible')
                .end()
                .get('.facet-charts.loading')
                .should('not.exist')
                .get('.facets-header button[aria-pressed="false"]')
                .should('be.visible')
                .click({ force: true })
                .end()
                .get('.facets-header .facets-title')
                .should('have.text', 'Excluded Properties')
                .end()
                .get(
                    '.facet.closed[data-field="file_sets.libraries.assay.display_title"] > h5'
                )
                // .scrollIntoView()
                // .should('be.visible')
                .click()
                .end()
                .get(
                    '.facet[data-field="file_sets.libraries.assay.display_title"] .facet-list-element[data-is-grouping="true"] a'
                )
                .eq(1)
                .within(($term) => {
                    const subTerms = [];
                    const subTermsSelected = [];
                    let groupingTermKey;
                    cy.get('span.facet-item.facet-item-group-header')
                        .then(function (termKey) {
                            groupingTermKey = termKey.text();
                            expect(groupingTermKey).to.not.be.empty;
                            cy.root()
                                .closest(
                                    '.facet[data-field="file_sets.libraries.assay.display_title"]'
                                )
                                .find(
                                    `.facet-list-element[data-grouping-key="${groupingTermKey}"] a`
                                )
                                .each(($el) => {
                                    cy.wrap($el)
                                        .find('span.facet-item')
                                        .then(function (termKey) {
                                            const subTermKey = termKey.text();
                                            subTerms.push(subTermKey);
                                            expect(subTermKey).to.not.be.empty;
                                        })
                                        .end();
                                })
                                .then(() => {
                                    expect(subTerms.length).to.be.greaterThan(0);
                                });
                        })
                        .end();
                    cy.wrap($term)
                        .click()
                        .end()
                        .then(() => {
                            cy.document()
                                .its('body')
                                .find(
                                    `.facet[data-field="file_sets.libraries.assay.display_title"] .facet-list-element[data-grouping-key="${groupingTermKey}"].omitted a`
                                )
                                .each(($el) => {
                                    cy.wrap($el)
                                        .find('span.facet-item')
                                        .then(function (termKey) {
                                            const subTermKey = termKey.text();
                                            subTermsSelected.push(subTermKey);
                                            expect(subTermKey).to.not.be.empty;
                                        })
                                        .end();
                                })
                                .then(() => {
                                    expect(subTerms.length).to.equal(
                                        subTermsSelected.length
                                    );
                                    cy.wrap(subTerms).should(
                                        'deep.equal',
                                        subTermsSelected
                                    );
                                });
                        });
                })
                .end();
        });
    });
});
