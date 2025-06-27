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

    it('Visit Data Matrix, should expand SMHT008 and validate row and column summaries', function () {

        cy.loginSMaHT({ 'email': 'cypress-main-scientist@cypress.hms.harvard.edu', 'useEnvToken': false })
            .validateUser('SCM')
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
                cy.contains('div#data_matrix_comparison h2.section-title', 'Data Matrix').should('be.visible');

                // Ensure the specific data matrix exists
                cy.get('#data-matrix-for_production').should('exist');

                const expectedLabels = ['Skin', 'Heart', 'Blood'];
                const columnTotals = {};

                cy.get('#data-matrix-for_production').within(() => {
                    // --- Step 1: Process each row individually ---
                    cy.get('.grouping.depth-0').each(($row) => {
                        const $label = $row.find('.grouping-row h4 .inner');
                        const rowLabel = $label.text().trim();

                        // Get row-summary before expansion
                        const rowSummaryText = $row.find('[data-block-type="row-summary"] span').text().trim();
                        const expectedRowSummary = parseInt(rowSummaryText, 10);

                        // Expand if collapsed
                        const expandIcon = $row.find('i.icon-plus');
                        if (expandIcon.length > 0) {
                            cy.wrap(expandIcon).click();
                        }

                        // Now re-wrap this row for scoped actions
                        cy.wrap($row).as('currentRow');

                        // Step 1.1: Check expected child labels
                        cy.get('@currentRow')
                            .find('.child-blocks .grouping-row .inner')
                            .then(($labels) => {
                                const labelTexts = [...$labels].map((el) => el.textContent.trim());
                                expect(labelTexts).to.include.members(expectedLabels);
                            });

                        // Step 1.2: Sum regular blocks in this row only
                        cy.get('@currentRow')
                            .find('.child-blocks [data-block-type="regular"] span')
                            .then(($regularSpans) => {
                                const actualRowSum = Cypress._.sum(
                                    [...$regularSpans].map((el) => parseInt(el.textContent.trim(), 10))
                                );

                                expect(actualRowSum, `Row summary for ${rowLabel}`).to.equal(expectedRowSummary);

                                // While here, accumulate column totals globally
                                cy.get('@currentRow')
                                    .find('.child-blocks [data-block-type="regular"]')
                                    .each(($el) => {
                                        const groupKey = $el.parent().attr('data-group-key');
                                        const value = parseInt($el.text().trim(), 10);
                                        if (!isNaN(value)) {
                                            columnTotals[groupKey] = (columnTotals[groupKey] || 0) + value;
                                        }
                                    });
                            });
                    });

                    // --- Step 2: Validate column summaries globally ---
                    cy.get('[data-block-type="col-summary"]').each(($summaryEl) => {
                        const key = $summaryEl.parent().attr('data-group-key');
                        if (key === 'column-summary') return; // ✅ skip special column

                        const expected = parseInt($summaryEl.text().trim(), 10);
                        const actual = columnTotals[key] || 0;

                        expect(actual, `Column summary for ${key}`).to.equal(expected);
                    });

                });
            })
            .logoutSMaHT();
    });

});