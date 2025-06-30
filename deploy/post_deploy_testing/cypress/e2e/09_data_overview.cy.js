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

    it('Visit Data Matrix for Production, should expand SMHT004, SMHT008 and validate row/column summaries, popover content', function () {

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
                    cy.get('.grouping.depth-0').each(($row) => {
                        const $label = $row.find('.grouping-row h4 .inner');
                        const rowLabel = $label.text().trim();

                        const rowSummaryText = $row.find('[data-block-type="row-summary"] span').text().trim();
                        const expectedRowSummary = parseInt(rowSummaryText, 10);

                        const expandIcon = $row.find('i.icon-plus');
                        if (expandIcon.length > 0) {
                            cy.wrap(expandIcon).click();
                        }

                        cy.wrap($row).as('currentRow');

                        // Only for SMHT004 and SMHT008: expected labels should exist
                        if (['SMHT004', 'SMHT008'].includes(rowLabel)) {
                            cy.get('@currentRow')
                                .find('.child-blocks .grouping-row .inner')
                                .then(($labels) => {
                                    const labelTexts = [...$labels].map((el) => el.textContent.trim());
                                    expect(labelTexts).to.include.members(expectedLabels);
                                });
                        }

                        // For all rows: labels must not include 'N/A'
                        cy.get('@currentRow')
                            .find('.child-blocks .grouping-row .inner')
                            .then(($labels) => {
                                const labelTexts = [...$labels].map((el) => el.textContent.trim());
                                expect(labelTexts).to.not.include('N/A');
                            });

                        // Validate row-summary matches sum of regular blocks
                        cy.get('@currentRow')
                            .find('.child-blocks [data-block-type="regular"] span')
                            .then(($regularSpans) => {
                                const actualRowSum = Cypress._.sum(
                                    [...$regularSpans].map((el) => parseInt(el.textContent.trim(), 10))
                                );

                                expect(actualRowSum, `Row summary for ${rowLabel}`).to.equal(expectedRowSummary);
                            });

                        // For each regular block: validate popover content and track column totals
                        cy.get('@currentRow')
                            .find('.child-blocks [data-block-type="regular"]')
                            .each(($block) => {
                                const value = parseInt($block.text().trim(), 10);
                                const assay = $block.parent().attr('data-group-key');

                                if (value > 0) {
                                    // Step 1: Click the block and ensure it's visible
                                    cy.wrap($block)
                                        .scrollIntoView()
                                        .should('be.visible')
                                        .click({ force: true });

                                    // Step 2: Retry DOM polling manually (NOT cy.get directly)
                                    cy.document().then((doc) => {
                                        const checkPopover = () => {
                                            const popover = doc.querySelector('#jap-popover');
                                            if (popover) {
                                                // Step 3: Wrap the real element manually
                                                cy.wrap(popover).should('be.visible').within(() => {
                                                    cy.get('.primary-row .col-6')
                                                        .first()
                                                        .find('.text-500')
                                                        .should('have.text', rowLabel);

                                                    cy.get('.primary-row .col-6.text-end .text-500')
                                                        .should('contain.text', assay);

                                                    cy.get('.secondary-row .value.text-600')
                                                        .invoke('text')
                                                        .then((text) => {
                                                            const totalFiles = parseInt(text.trim(), 10);
                                                            expect(totalFiles).to.equal(value);
                                                        });
                                                });

                                                cy.root().click('topLeft', { force: true }); // exits popover scope
                                            } else {
                                                // Retry after 100ms, up to N times
                                                if (!Cypress._.isUndefined(doc._japPopoverRetryCount)) {
                                                    doc._japPopoverRetryCount += 1;
                                                } else {
                                                    doc._japPopoverRetryCount = 1;
                                                }

                                                if (doc._japPopoverRetryCount <= 20) {
                                                    setTimeout(checkPopover, 100); // retry up to 2s
                                                } else {
                                                    throw new Error('Popover did not appear after clicking block.');
                                                }
                                            }
                                        };

                                        checkPopover();
                                    });

                                }

                                // Accumulate column totals
                                if (!isNaN(value)) {
                                    columnTotals[assay] = (columnTotals[assay] || 0) + value;
                                }
                            });
                    });

                    // After all rows, validate global column summaries
                    cy.then(() => {
                        cy.get('[data-block-type="col-summary"]').each(($summaryEl) => {
                            const key = $summaryEl.parent().attr('data-group-key');
                            if (key === 'column-summary') return;

                            const expected = parseInt($summaryEl.text().trim(), 10);
                            const actual = columnTotals[key] || 0;

                            expect(actual, `Column summary for ${key}`).to.equal(expected);
                        });
                    });
                });
            })
            .logoutSMaHT();
    });

});