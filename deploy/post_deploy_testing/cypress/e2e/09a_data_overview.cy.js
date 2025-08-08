import { cypressVisitHeaders, ROLE_TYPES } from "../support";
import { dataNavBarItemSelectorStr } from "../support/selectorVars";

/** * Waits for the popover to become visible.
 * @param {number} timeout - The maximum time to wait for the popover to become visible, in milliseconds.
 * @returns {Cypress.Chainable} A Cypress chainable that resolves when the popover is visible.
 * This function performs the following steps:
 * 1. Gets the window object to access the document.
 * 2. Starts a timer to track how long it has been waiting.
 * 3. Defines a recursive function `check` that:
 *    - Checks if the popover element is visible.
 *    - If visible, resolves the promise with the popover element.
 *    - If not visible and the timeout has not been reached, sets a timeout to check again after 100 milliseconds.
 *    - If the timeout is reached, rejects the promise with an error.
 * 4. Calls the `check` function to start the process.
 * @throws {Error} If the popover does not become visible within the specified timeout.
 * @returns {Cypress.Chainable} A Cypress chainable that resolves when the popover is visible.
 */
function waitForPopoverVisible(timeout = 10000) {
    const start = Date.now();

    return cy.window().then((win) =>
        new Cypress.Promise((resolve, reject) => {
            function check() {
                const el = win.document.querySelector('#jap-popover');

                const visible =
                    el &&
                    el.offsetParent !== null &&
                    getComputedStyle(el).visibility !== 'hidden' &&
                    getComputedStyle(el).display !== 'none' &&
                    parseFloat(getComputedStyle(el).opacity || '1') > 0;

                if (visible) {
                    resolve(el);            // ✅ return the actual DOM element
                } else if (Date.now() - start > timeout) {
                    reject(new Error(`Popover never became visible: ${Date.now() - start}ms elapsed, el.offsetParent: ${el ? el.offsetParent : 'null'}, visibility: ${el ? getComputedStyle(el).visibility : 'unknown'}, display: ${el ? getComputedStyle(el).display : 'unknown'}, opacity: ${el ? getComputedStyle(el).opacity : 'unknown'}`));
                } else {
                    setTimeout(check, 100);
                }
            }
            check();
        })
    );
}

/** * Waits until the popover is fully closed.
 * @param {number} timeout - The maximum time to wait for the popover to close, in milliseconds.
 * @returns {Cypress.Chainable} A Cypress chainable that resolves when the popover is closed.
 * This function performs the following steps:
 * 1. Gets the window object to access the document.
 * 2. Starts a timer to track how long it has been waiting.
 * 3. Defines a recursive function `check` that:
 *    - Checks if the popover element is still visible.
 *    - If not visible, resolves the promise.
 *    - If still visible and the timeout has not been reached, sets a timeout to check again after 100 milliseconds.
 *    - If the timeout is reached, rejects the promise with an error.
 * 4. Calls the `check` function to start the process.
 * @throws {Error} If the popover does not close within the specified timeout.
 * @returns {Cypress.Chainable} A Cypress chainable that resolves when the popover is closed.
 */
function waitUntilPopoverClosed(timeout = 4000) {
    return cy.window().then((win) => {
        const start = Date.now();
        return new Cypress.Promise((resolve, reject) => {
            function check() {
                const el = win.document.querySelector('#jap-popover');
                const stillVisible =
                    el &&
                    el.offsetParent !== null &&
                    getComputedStyle(el).visibility !== 'hidden' &&
                    getComputedStyle(el).display !== 'none' &&
                    parseFloat(getComputedStyle(el).opacity || '1') > 0;

                if (!stillVisible) {
                    resolve();
                } else if (Date.now() - start > timeout) {
                    reject(new Error('Popover did not close in time'));
                } else {
                    setTimeout(check, 100);
                }
            }
            check();
        });
    });
}

/** * Asserts that the popover is visible and contains the expected donor, assay, and value.
 * * @param {Object} params - The parameters for the assertion.
 * * @param {string} params.donor - The expected donor name.
 * * @param {string} params.assay - The expected assay name.
 * * @param {string} params.tissue - The expected tissue name.
 * * @param {number} params.value - The expected file count value.
 * * @returns {Cypress.Chainable} A Cypress chainable that resolves when the assertion is complete.
 * This function performs the following steps:
 * 1. Waits for the popover to become visible.
 * 2. Asserts that the popover is visible and contains the expected donor, assay, tissue, and value.
 * 3. Closes the popover by clicking outside of it.
 * 4. Waits until the popover is fully closed.
 * 5. Logs the assertion details.
 */
function assertPopover({ donor, assay, tissue, value, blockType = 'regular', depth = 0 }) {
    // wait until the element itself is truly visible
    waitForPopoverVisible().then((popoverEl) => {
        // let Cypress do all subsequent retries
        cy.wrap(popoverEl).should('be.visible').within(() => {
            if (blockType === 'regular') {
                // donor (left col-4) – Cypress keeps retrying until text matches
                if (donor) {
                    cy.get('.primary-row .col-4', { timeout: 10000 })
                        .eq(0)
                        .find('.value')
                        .should('have.text', donor);
                }

                // tissue (mid col-4)
                if (tissue) {
                    cy.get('.primary-row .col-4', { timeout: 10000 })
                        .eq(1)
                        .find('.value')
                        .should('have.text', tissue);
                }

                // assay
                if (assay) {
                    cy.get('.secondary-row .col-4', { timeout: 10000 })
                        .eq(0) // first col-4 in secondary-row
                        .find('.value')
                        .should('contain.text', assay);
                }

                // file count – retry until text is numeric and equals expected
                cy.get('.secondary-row .col-4', { timeout: 10000 })
                    .eq(2)
                    .find('.value')
                    .invoke('text')
                    .then((t) => parseInt(t.trim(), 10))
                    .should('equal', value);
            } else if (blockType === 'row-summary') {
                // tissue (primary row)
                if (tissue) {
                    cy.get('.primary-row .col-12.value', { timeout: 10000 })
                        .should('contain.text', tissue);
                }

                // donor (secondary row - left column)
                if (assay) {
                    cy.get('.secondary-row .col-4', { timeout: 10000 })
                        .eq(0) // first col-4 in secondary-row
                        .find('.value')
                        .should('contain.text', assay);
                }

                // file count – retry until text is numeric and equals expected
                cy.get('.secondary-row .col-4', { timeout: 10000 })
                    .eq(2)
                    .find('.value')
                    .invoke('text')
                    .then((t) => parseInt(t.trim(), 10))
                    .should('equal', value);
            } else if (blockType === 'col-summary') {
                // assay (primary row)
                if (assay) {
                    cy.get('.primary-row .col-12.value', { timeout: 10000 })
                        .should('contain.text', assay);
                }

                // file count – retry until text is numeric and equals expected
                cy.get('.secondary-row .col-4', { timeout: 10000 })
                    .eq(2)
                    .find('.value')
                    .invoke('text')
                    .then((t) => parseInt(t.trim(), 10))
                    .should('equal', value);
            }

        });
    })
        .then(() => {
            // close the pop-over
            cy.document()
                .its('body')
                .then((body) => cy.wrap(body).click(0, 0, { force: true }));

            // wait until it is fully removed/faded-out
            return waitUntilPopoverClosed();
        })
        .then(() => {
            Cypress.log({
                name: 'assertPopover',
                message: `value: ${value}, donor: ${donor}, tissue: ${tissue}, assay: ${assay}`,
            });
        });
}

/**
 * Confirm that the matrix shows exactly the labels in `expectedLabels`
 * (in DOM order) across ALL .header-section-lower blocks, and that
 * each label row contains ≥1 col-summary block.
 *
 * @param {string[]} expectedLabels  e.g. ['Donors']  or ['Donors','Cell Lines']
 */
function validateLowerHeaders(expectedLabels) {
    // Gather every label text in order
    cy.get('.header-section-lower .grouping-row .label-section span')
        .then(($spans) => [...$spans].map((el) => el.textContent.trim()))
        .should('deep.equal', expectedLabels);

    // For each label, assert ≥1 col-summary under its row
    expectedLabels.forEach((lbl) => {
        cy.contains('.header-section-lower .label-section span', lbl)
            .closest('.grouping-row')
            .within(() => {
                cy.get('[data-block-type="col-summary"]').its('length')
                    .should('be.greaterThan', 0);
            });
    });
}
/** * Validates the data matrix popover content for specified donors and labels.
 * * @param {string} matrixId - The CSS selector for the data matrix.
 * @param {string[]} donors - An array of donor IDs to validate.
 * @param {string[]} mustLabels - An array of labels that must be present in the popover.
 * @param {string[]} optionalLabels - An array of labels that may be present in the popover.
 * @param {string[]} expectedLowerLabels - An array of expected lower header labels.
 * * @returns {void}
 * This function performs the following validations:
 * 1. Asserts that the popover is visible.
 * 2. Validates the presence of required labels.
 * 3. Checks for the correct donor and assay information.
 * 4. Confirms the file count is as expected.
 */
function testMatrixPopoverValidation(matrixId = '#data-matrix-for_production', donors = ['SMHT004', 'SMHT008'], mustLabels = ['Non-exposed Skin', 'Heart', 'Blood'], optionalLabels = [], expectedLowerLabels = ['Donors']) {
    cy.get(matrixId).should('exist');

    const columnTotals = {};

    cy.get(matrixId).within(() => {
        validateLowerHeaders(expectedLowerLabels);

        // this code block makes all collapsed sections as expanded
        // TODO: implement test cases for all collapsed sections
        cy.get('.grouping.depth-0.may-collapse').each(($row) => {
            const $label = $row.find('.grouping-row h4 .inner');
            const rowLabel = $label.first().text().trim();

            const rowSummaryText = $row.find('[data-block-type="row-summary"] span').text().trim();
            const expectedRowSummary = parseInt(rowSummaryText, 10);

            const expandIcon = $row.find('i.icon-plus');
            if (expandIcon.length > 0) {
                cy.wrap(expandIcon).click();
            }

            cy.wrap($row).as('currentRow');

            if (donors.includes(rowLabel)) {
                cy.get('@currentRow')
                    .find('.child-blocks .grouping-row .inner')
                    .then(($labels) => {
                        const labelTexts = [...$labels].map((el) => el.textContent.trim());
                        if (mustLabels.length > 0) {
                            expect(labelTexts).to.include.members(mustLabels);
                        }
                        if (optionalLabels.length > 0) {
                            expect(optionalLabels).to.include.members(labelTexts);
                        }
                    });
            }

            cy.get('@currentRow')
                .find('.child-blocks .grouping-row .inner')
                .then(($labels) => {
                    const labelTexts = [...$labels].map((el) => el.textContent.trim());
                    expect(labelTexts).to.not.include('N/A');
                });

            cy.get('@currentRow')
                .find('.child-blocks [data-block-type="regular"] span')
                .then(($spans) => {
                    const sum = Cypress._.sum([...$spans].map((el) => parseInt(el.textContent.trim(), 10)));
                    expect(sum, `Row summary for ${rowLabel}`).to.equal(expectedRowSummary);
                });

            cy.get('@currentRow')
                .find('.child-blocks [data-block-type="regular"]')
                .each(($block) => {
                    const value = parseInt($block.text().trim(), 10);
                    const assay = $block.parent().attr('data-group-key');
                    if (!isNaN(value)) {
                        columnTotals[assay] = (columnTotals[assay] || 0) + value;
                    }
                });
        });

        // Random 10 regular block popovers
        cy.get('[data-block-type="regular"]').then(($allBlocks) => {
            const allBlocks = Array.from($allBlocks);
            const selected = Cypress._.sampleSize(allBlocks, 10);

            const testCases = selected.map((el) => {
                const $el = Cypress.$(el);
                const value = parseInt($el.text().trim(), 10);
                const donor = $el.closest('.grouping.depth-0').find('.grouping-row h4 .inner').eq(0).text().trim();
                const tissue = $el.closest('.grouping.depth-1').find('.grouping-row h4 .inner').eq(0).text().trim();
                const assay = $el.parent().attr('data-group-key');
                return { el, donor, assay, tissue, value };
            });

            testCases.forEach(({ el, donor, tissue, assay, value }) => {
                if (value > 0) {
                    cy.wrap(el).scrollIntoView().click({ force: true });
                    assertPopover({ donor, assay, tissue, value });
                }
            });
        });

        // Random 10 row-summary block popovers
        cy.get('[data-block-type="row-summary"]').then(($blocks) => {
            Cypress._.sampleSize([...$blocks], 10).forEach((el) => {
                const value = parseInt(Cypress.$(el).text().trim(), 10);
                if (value > 0) {
                    const donor = Cypress.$(el).closest('.grouping.depth-0').find('h4 .inner').eq(0).text().trim();
                    cy.wrap(el).scrollIntoView().click({ force: true });
                    assertPopover({ donor, assay: '', value, blockType: 'row-summary' });
                }
            });
        });

        // Random 3 col-summary block popovers
        cy.get('[data-block-type="col-summary"]:not([data-block-value="0"])').then(($blocks) => {
            Cypress._.sampleSize([...$blocks], 3).forEach((el) => {
                const value = parseInt(Cypress.$(el).text().trim(), 10);
                if (value > 0) {
                    const assay = Cypress.$(el).parent().attr('data-group-key');
                    cy.wrap(el).scrollIntoView().click({ force: true });
                    assertPopover({ donor: '', assay: assay, value, blockType: 'col-summary' });
                }
            });
        });
    });
}

describe('Data Overview - Retracted Files, Data Matrix for Production, Data Matrix for Benchmarking', function () {

    before(function () {
        cy.visit('/', { headers: cypressVisitHeaders });
    });

    it('Visit Retracted Files List', function () {

        cy.loginSMaHT(ROLE_TYPES.SMAHT_DBGAP)
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

        cy.loginSMaHT(ROLE_TYPES.SMAHT_DBGAP)
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
                cy.contains('div#page-title-container h1.page-title', 'Data Matrix').should('be.visible');

                testMatrixPopoverValidation('#data-matrix-for_production', ['SMHT004', 'SMHT008'], ['Non-exposed Skin', 'Heart', 'Blood'], [], ['Donors']);
            })
            .logoutSMaHT();
    });

    it('Visit Data Matrix for Benchmarking, should expand ST001, ST002, ST003, ST004 and validate row/column summaries, popover content', function () {

        cy.loginSMaHT(ROLE_TYPES.SMAHT_DBGAP)
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
                cy.contains('div#page-title-container h1.page-title', 'Data Matrix').should('be.visible');

                testMatrixPopoverValidation('#data-matrix-for_benchmarking', ['ST001', 'ST002', 'ST003', 'ST004'], [], ['Non-exposed Skin', 'Lung', 'Brain', 'Liver', 'Ascending Colon'], ['Cell Lines', 'Donors']);
            })
            .logoutSMaHT();
    });

});
