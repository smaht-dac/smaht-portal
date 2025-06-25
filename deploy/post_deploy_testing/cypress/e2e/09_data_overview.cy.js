import { cypressVisitHeaders } from "../support";

const dataNavBarItemSelectorStr = '#top-nav div.navbar-collapse .navbar-nav a.id-data-menu-item';

describe('Data Overview Page & Content Tests', function () {

    before(function () {
        cy.visit('/', { headers: cypressVisitHeaders });
    });

    it('Visit Retracted Files List', function () {

        cy.loginSMaHT({ 'email': 'cypress-main-scientist@cypress.hms.harvard.edu', 'useEnvToken': false })
            .validateUser('SCM')
            .get(dataNavBarItemSelectorStr)
            .should('have.class', 'dropdown-toggle')
            .click()
            .should('have.class', 'dropdown-open-for').then(() => {

                cy.get('.big-dropdown-menu.is-open a.big-link[href="/retracted-files"]')
                    .click({ force: true }).then(function ($linkElem) {
                        cy.get('#slow-load-container').should('not.have.class', 'visible').end();
                        const linkHref = $linkElem.attr('href');
                        cy.location('pathname').should('equal', linkHref);
                    });

                // Verify that the page contains the correct header
                cy.contains('div#retracted_files h2.section-title', 'List of Retracted Files').should('be.visible');

                cy.get('.search-result-row[data-row-number]').as('resultRows');

                // Ensure at least 5 results exist
                cy.get('@resultRows').should('have.length.at.least', 5);

                // Define a recursive function to step through rows
                function checkRow(index) {
                    if (index >= 5) return; // Limit to 5 rows

                    cy.get('@resultRows').eq(index).as('currentRow');

                    // Check retraction reason exists
                    cy.get('@currentRow')
                        .find('[data-field="retraction_reason"] .value')
                        .should('not.be.empty');

                    // Open file detail page in same tab
                    cy.get('@currentRow')
                        .find('[data-field="accession"] a')
                        .then(($a) => {
                            cy.wrap($a)
                                .invoke('removeAttr', 'target')
                                .click();
                        });

                    // Wait for detail page to load
                    cy.get('.file-view-header', { timeout: 10000 }).should('be.visible');

                    // Check that the file is marked as Retracted
                    cy.get('.status-group .status')
                        .should('be.visible')
                        .and('contain.text', 'Retracted');

                    // Check the attention message
                    cy.get('.callout.warning .callout-text')
                        .should('contain.text', 'was retracted due to');

                    // Go back and wait for results page to load
                    cy.go('back');

                    // Wait for rows to be available again
                    cy.get('.search-result-row[data-row-number]', { timeout: 10000 }).should('have.length.at.least', 5);

                    // Recursively proceed to next row
                    cy.then(() => checkRow(index + 1));
                }

                // Start the recursive check
                checkRow(0);


            })
            .logoutSMaHT();
    });

});