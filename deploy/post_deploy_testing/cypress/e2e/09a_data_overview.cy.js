import { cypressVisitHeaders, ROLE_TYPES } from "../support";
import { dataNavBarItemSelectorStr } from "../support/selectorVars";
import { testMatrixPopoverValidation } from "../support/utils/dataMatrixUtils";

describe('Data Overview - Retracted Files, Data Matrix for Production, Data Matrix for Benchmarking', function () {

    before(function () {
        cy.visit('/', { headers: cypressVisitHeaders });
    });

    it('Visit Retracted Files List', function () {

        cy.loginSMaHT(ROLE_TYPES.SMAHT_DBGAP)
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
                cy.contains('div#retracted-files h2.section-title', 'List of Retracted Files').should('be.visible');

                cy.get('.search-result-row[data-row-number]').as('resultRows');

                // Ensure at least 5 results exist
                cy.get('@resultRows').should('have.length.at.least', 5);

                // Define a recursive function to step through rows
                function testVisit(index) {
                    // Stop recursion after checking 5 rows
                    if (index >= 5) return;

                    // Alias the current search result row
                    cy.get('@resultRows').eq(index).as('currentRow');

                    // Check that the "retraction_reason" field is not empty
                    cy.get('@currentRow')
                        .find('[data-field="retraction_reason"] .value')
                        .should('not.be.empty');

                    // Get the <a> tag in the "accession" field and store its text
                    cy.get('@currentRow')
                        .find('[data-field="accession"] a')
                        .then(($a) => {
                            // Store the accession code (e.g. SMAFICYTBKA5) from the link text
                            const expectedAccession = $a.text().trim();

                            // Remove target="_blank" so that click stays in same tab
                            cy.wrap($a)
                                .invoke('removeAttr', 'target')
                                .click();

                            // Verify the detail page is loaded
                            cy.get('.file-view-header', { timeout: 10000 }).should('be.visible');

                            // Check that file status is "Retracted"
                            cy.get('.status-group .status')
                                .should('be.visible')
                                .and('contain.text', 'Retracted');

                            // Check that the callout message contains "was retracted"
                            // TODO: verify text if retraction reason is available
                            cy.get('.callout.warning .callout-text')
                                .should('contain.text', 'was retracted');

                            // Check that the accession value matches the one we clicked on
                            cy.get('.accession')
                                .should('be.visible')
                                .and('have.text', expectedAccession);
                        });

                    // Go back to the list page
                    cy.go('back');

                    // Wait for the list page to reload and ensure it has rows again
                    cy.get('.search-result-row[data-row-number]', { timeout: 10000 })
                        .should('have.length.at.least', 5)
                        .as('resultRows'); // Re-alias since DOM was reloaded

                    // Continue with the next row
                    cy.then(() => testVisit(index + 1));
                }

                // Start the recursive check
                testVisit(0);
            })
            .logoutSMaHT();
    });

    it('Visit Data Matrix for Production, should expand SMHT004, SMHT008 and validate row/column summaries, popover content', function () {

        cy.loginSMaHT(ROLE_TYPES.SMAHT_DBGAP)
            .get(dataNavBarItemSelectorStr)
            .should('have.class', 'dropdown-toggle')
            .click()
            .should('have.class', 'dropdown-open-for').then(() => {

                cy.get('.big-dropdown-menu.is-open a.big-link[href="/data-matrix"]')
                    .click({ force: true }).then(function ($linkElem) {
                        cy.get('#slow-load-container').should('not.have.class', 'visible').end();
                        const linkHref = $linkElem.attr('href');
                        cy.location('pathname').should('equal', linkHref);
                    });

                // Verify that the page contains the correct header
                cy.contains('div#page-title-container h1.page-title', 'Data Matrix').should('be.visible');

                testMatrixPopoverValidation('#data-matrix-for_production', ['SMHT004', 'SMHT008', 'SMHT009'], ['Non-exposed Skin', 'Heart', 'Blood'], [], ['Donors']);
            })
            .logoutSMaHT();
    });

    it('Visit Data Matrix for Benchmarking, should expand ST001, ST002, ST003, ST004 and validate row/column summaries, popover content', function () {

        cy.loginSMaHT(ROLE_TYPES.SMAHT_DBGAP)
            .get(dataNavBarItemSelectorStr)
            .should('have.class', 'dropdown-toggle')
            .click()
            .should('have.class', 'dropdown-open-for').then(() => {

                cy.get('.big-dropdown-menu.is-open a.big-link[href="/data-matrix"]')
                    .click({ force: true }).then(function ($linkElem) {
                        cy.get('#slow-load-container').should('not.have.class', 'visible').end();
                        const linkHref = $linkElem.attr('href');
                        cy.location('pathname').should('equal', linkHref);
                    });

                // Verify that the page contains the correct header
                cy.contains('div#page-title-container h1.page-title', 'Data Matrix').should('be.visible');

                testMatrixPopoverValidation('#data-matrix-for_benchmarking', ['ST001', 'ST002', 'ST003', 'ST004'], [], ['Non-exposed Skin', 'Lung', 'Brain', 'Liver', 'Ascending Colon'], ['Cell Lines', 'Donors']);
            })
            .logoutSMaHT();
    });

});
