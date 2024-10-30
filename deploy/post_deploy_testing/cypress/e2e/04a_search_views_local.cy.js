import _ from 'underscore';
import { cypressVisitHeaders } from '../support';
import { navUserAcctDropdownBtnSelector } from '../support/selectorVars';

describe('Deployment/CI Search View Tests', function () {

    context('/search/?type=Item', function () {

        before(function () {
            cy.visit('/search/', { headers: cypressVisitHeaders });
        });

        it('Has at least 50 results for /search/?type=Item', function () {
            cy.location('search').should('include', 'type=Item').end()
                .get('.search-results-container .search-result-row').then(($searchResultElems) => {
                    expect($searchResultElems.length).to.equal(10);
                }).end()
                .searchPageTotalResultCount().should('be.greaterThan', 50);
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

        it('/files/ should redirect to /search/?type=File', function(){
            cy.visit('/files/', { headers: cypressVisitHeaders }).location('search').should('include', 'type=File').end()
                .location('pathname').should('include', '/search/');
        });

        it('Should have columns for data category, format', function () {
            cy.get('.headers-columns-overflow-container .columns .search-headers-column-block[data-field="data_type"]').contains("Data Category");
            cy.get('.headers-columns-overflow-container .columns .search-headers-column-block[data-field="file_format.display_title"]').contains("Data Format");
        });
    });

});
