import _ from 'underscore';
import { cypressVisitHeaders } from '../support';
import { navUserAcctDropdownBtnSelector } from '../support/selectorVars';

describe('Deployment/CI Search View Tests', function () {

    context('/search/?type=Item', function () {

        before(function () {
            cy.visit('/search/', { headers: cypressVisitHeaders });
            cy.loginSMaHT({ 'email': 'cypress-main-scientist@cypress.hms.harvard.edu', 'useEnvToken': false }).end()
                .get(navUserAcctDropdownBtnSelector)
                .should('not.contain.text', 'Login')
                .then((accountListItem) => {
                    expect(accountListItem.text()).to.contain('SCM');
                }).end();
        });

        after(function () {
            cy.logoutSMaHT();
        });

        it('Has at least 50 results for /search/?type=Item', function () {
            cy.location('search').should('include', 'type=Item').end()
                .get('.search-results-container .search-result-row').then(($searchResultElems) => {
                    expect($searchResultElems.length).to.equal(10);
                }).end()
                .searchPageTotalResultCount().should('be.greaterThan', 50);
        });

        it('Search `File` from Dropdown and Verify Link Selection', function () {
            // Type "File" in the search input
            cy.get('.facets-column .facets-container .expandable-list .form-control[type="search"]').type('File');

            // Verify that all facet list elements contain "File"
            cy.get('.facet-list-element[data-key]').each(($el) => {
                cy.wrap($el).should('contain.text', 'File'); // Check each element for the text "File"
            });

            // Verify that unwanted results are not visible
            cy.get('.facet-list-element[data-key]').should('not.contain.text', 'NotExpectedResult'); // Ensure unwanted result is absent

            // Click on the "File" link
            cy.get('li[data-key="File"] a').click();

            // Verify the page title contains "File"
            cy.get('#page-title-container .page-title').should('contain', 'File');
        });

        it('Should show/hide columns and ensure correct behavior in the results table', function () {
            cy.get('.above-results-table-row button[data-tip="Configure visible columns"]').click().should('have.class', 'active');
            cy.get('.search-result-config-panel').should('have.class', 'show');
            cy.get('.search-result-config-panel .row .checkbox.clickable:not(.is-active)')
                .first()
                .click()
                .should('have.class', 'is-active')
                .find('label input')
                .invoke('val')
                .then((value) => {
                    cy.get(`.search-results-container .search-headers-row div[data-field="${value}"]`)
                        .should('exist')
                        .then(($div) => {
                            expect($div).to.have.attr('data-field', value);
                        });


                    cy.get(`.search-result-config-panel .row .checkbox.clickable.is-active input[value="${value}"]`)
                        .click()
                        .should('not.have.class', 'is-active')
                        .then(() => {
                            cy.get(`.search-results-container .search-headers-row div[data-field="${value}"]`)
                                .should('not.exist');
                        });
                });

            cy.get('.search-result-config-panel .close-button').click({ force: true })
                .get('.search-result-config-panel').should('not.have.class', 'active');
        });

        it('Should redirect to detail view and check if the title matches data-tip', function () {
            cy.get('.results-column .result-table-row div.search-result-column-block[data-field="display_title"] .title-block')
                .first()
                .scrollIntoView()
                .then(($element) => {
                    const dataTipValue = $element.attr('data-tip');

                    cy.wrap($element)
                        .find('a')
                        .click({ force: true });

                    cy.get('.file-view-title h1.file-view-title-text')
                        .invoke('text')
                        .then((text) => {
                            expect(text.trim()).to.eq(dataTipValue);
                        });
                });
        });

        it('Should trigger batch files download modal and close it successfully', function () {
            cy.get('#download_tsv_multiselect').click({ force: true }).end()
                .get('div.modal.batch-files-download-modal').should('have.class', 'show').end()
                .get('.modal-header .btn-close').click().end();
        });

    });

    context('/search/?type=Page', function () {

        before(function () {
            cy.visit('/pages', { headers: cypressVisitHeaders }); // We should get redirected to ?type=Page
        });

        beforeEach(function () {
            // Ensure we preserve search session cookie for proper ordering.
            cy.session('preserveCookies', () => {
                // Ensure we preserve search session cookie for proper ordering.
                cy.getCookie('searchSessionID').then((cookie) => {
                    if (cookie) {
                        cy.setCookie('searchSessionID', cookie.value);
                    }
                });
            });
        });

        it('Should redirect to /search/?type=Page correctly', function () {
            cy.location('search').should('include', 'type=Page').end()
                .location('pathname').should('include', '/search/');
        });

        it('Should have at least 10 results.', function () {
            cy.get('.search-results-container .search-result-row').then(($searchResultElems) => {
                expect($searchResultElems.length).to.be.greaterThan(10);
            });
        });

    });

    context('Publications, Files', function () {
        before(function () {
            cy.visit('/pages', { headers: cypressVisitHeaders }).end();
            cy.loginSMaHT({ 'email': 'cypress-main-scientist@cypress.hms.harvard.edu', 'useEnvToken': false }).end()
                .get(navUserAcctDropdownBtnSelector)
                .should('not.contain.text', 'Login').end();
        });

        after(function () {
            cy.logoutSMaHT();
        });

        it('/files/ should redirect to /search/?type=File', function () {
            cy.visit('/files/', { headers: cypressVisitHeaders }).location('search').should('include', 'type=File').end()
                .location('pathname').should('include', '/search/');
        });

        it('Should have columns for data category, format', function () {
            cy.get('.headers-columns-overflow-container .columns .search-headers-column-block[data-field="data_type"]').contains("Data Category");
            cy.get('.headers-columns-overflow-container .columns .search-headers-column-block[data-field="file_format.display_title"]').contains("Data Format");
        });
    });

});
