import { cypressVisitHeaders } from "../support";
import { navUserAcctDropdownBtnSelector } from "../support/selectorVars";

describe('Post-Deployment Search View Tests', function () {

    context('Search Page Validation (Item Type)', function () {

        before(function () {
            cy.visit('/search/', { headers: cypressVisitHeaders });
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

        it('Load as you scroll works for ?type=Item', function () {

            cy.location('search').should('include', 'type=Item');

            cy.searchPageTotalResultCount().then((totalCountExpected) => {
                const pageCount = Math.min(10, parseInt(totalCountExpected / 10));

                for (let page = 0; page < pageCount; page++) {
                    cy.scrollToBottom().then(() => {
                        cy.get('.search-results-container .search-result-row[data-row-number="' + (10 * (page + 1)) + '"]').should('have.length', 1);
                    });
                }

            });

        });

        it('Filter by "Type" filter icon within search results', function () {
            cy.visit('/search/?type=Item', { headers: cypressVisitHeaders });

            cy.loginSMaHT({ 'email': 'cypress-main-scientist@cypress.hms.harvard.edu', 'useEnvToken': false }).end()
                .get(navUserAcctDropdownBtnSelector)
                .should('not.contain.text', 'Login')
                .then((accountListItem) => {
                    expect(accountListItem.text()).to.contain('SCM');
                }).end()
                .get('.facet-list li.facet-list-element[data-key="File"] .facet-item').should('have.text', 'File').end();

            cy.searchPageTotalResultCount().then((totalCountExpected) => {
                const intervalCount = Math.floor(Math.random() * 5);//Math.min(5, parseInt(totalCountExpected / 25));
                cy.get('.search-result-row.detail-closed[data-row-number="' + intervalCount + '"] .search-result-column-block[data-field="@type"] .item-type-title').then(function ($typeTitle) {
                    const typeTitle = $typeTitle.text();
                    const separator = typeTitle.includes(' ') ? ' ' : '';

                    cy.get('.search-result-row.detail-closed[data-row-number="' + intervalCount + '"] .search-result-column-block[data-field="@type"] .icon-container .icon').click({ force: true }).end();
                    cy.get('#slow-load-container').should('not.have.class', 'visible').end();
                    cy.get('#page-title-container .page-title').should('contain', typeTitle.replace(separator, '')).end();
                }).end().logoutSMaHT();

            });
        });

    });
});
