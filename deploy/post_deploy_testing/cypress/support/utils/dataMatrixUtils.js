// Sends a GET request to the given URL and returns the `total` field from JSON response.
//
// SMaHT's browse/search API returns HTTP 404 with a valid JSON body (`total: 0`,
// "No results found") whenever a filter combination currently matches zero
// results - that is a documented, correct contract, not a transport failure.
// `failOnStatusCode:false` lets us read that body instead of throwing a
// CypressError; any other non-200 status, or a body without a numeric
// `total`, still fails loudly with the response attached.
export function getApiTotalFromUrl(url) {
    // Ensure the URL requests JSON format (append if missing)
    const normalizedUrl = String(url).replace(/^(https?:\/\/[^/]+)\/\/+/, '$1/').replace(/^\/\/+/, '/');
    const fullUrl = normalizedUrl.includes('format=json') ? normalizedUrl : `${normalizedUrl}&format=json&frame=raw`;

    return cy.request({
        method: 'GET',
        url: fullUrl,
        failOnStatusCode: false,
    }).then((response) => {
        const { status, body } = response;
        const isDocumentedEmptyResult = status === 404 && body && body.total === 0;

        if (status !== 200 && !isDocumentedEmptyResult) {
            throw new Error(
                `getApiTotalFromUrl: unexpected response for ${fullUrl} - status ${status}, body: ${JSON.stringify(body).slice(0, 500)}`
            );
        }

        if (typeof body?.total !== 'number') {
            throw new Error(
                `getApiTotalFromUrl: response for ${fullUrl} (status ${status}) has no numeric 'total' field: ${JSON.stringify(body).slice(0, 500)}`
            );
        }

        return body.total;
    });
}

/**
 * Compares a UI-derived count against the live API `total` for the same URL,
 * tolerating one round of transient data churn between when the UI value was
 * read and when this check runs. If the two values still disagree after a
 * single re-read, this throws with the exact URL, UI count, and API total so
 * the failure is a diagnostic rather than a bare `expected X to equal Y`.
 */
export function reconcileApiTotalWithUiCount(url, uiCount, { context = '', retries = 1, retryDelayMs = 1500 } = {}) {
    const label = context ? `${context}: ` : '';

    function attempt(remaining) {
        return getApiTotalFromUrl(url).then((apiTotal) => {
            if (apiTotal === uiCount) {
                return apiTotal;
            }
            if (remaining > 0) {
                return cy.wait(retryDelayMs).then(() => attempt(remaining - 1));
            }
            throw new Error(
                `${label}UI/API count divergence persisted after re-read - url: ${url}, uiCount: ${uiCount}, apiTotal: ${apiTotal}`
            );
        });
    }

    return attempt(retries);
}

// Safely parse a number from text content (e.g. " 11 " → 11)
export function parseIntSafe(text) {
    const n = parseInt(String(text).trim(), 10);
    return Number.isNaN(n) ? 0 : n;
}

/**
 * Waits for the popover to become visible.
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
                    resolve(el);            // return the actual DOM element
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
function assertPopover({ donor, assay, tissue, value, blockType = 'regular', depth = 0, verifyTotalFromApi = true }) {
    // wait until the element itself is truly visible
    cy.waitForPopoverShow().then(() =>
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
                        .should('equal', value)
                        .then((uiCount) => {
                            if (verifyTotalFromApi) {
                                // Get the URL from the "Browse Files" button in footer
                                cy.get('.footer-row a.btn.btn-primary')
                                    .invoke('attr', 'href')
                                    .then((href) => {
                                        // If the href is relative (starts with "/"), prefix with baseUrl
                                        const fullUrl = href.startsWith('http')
                                            ? href
                                            : `${Cypress.config('baseUrl')}${href}`;

                                        // Reconcile API total with UI count, tolerating one
                                        // round of transient data churn before failing.
                                        return reconcileApiTotalWithUiCount(fullUrl, uiCount, {
                                            context: 'Popover total (regular block) vs API total',
                                        });
                                    });
                            } else {
                                Cypress.log({
                                    name: 'Skipping API total check for regular block',
                                    message: `UI count is ${uiCount}, but API check is skipped as per parameters.`,
                                });
                            }
                        });
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
                        .should('equal', value)
                        .then((uiCount) => {
                            if (verifyTotalFromApi) {
                                // Get the URL from the "Browse Files" button in footer
                                cy.get('.footer-row a.btn.btn-primary')
                                    .invoke('attr', 'href')
                                    .then((href) => {
                                        // If the href is relative (starts with "/"), prefix with baseUrl
                                        const fullUrl = href.startsWith('http')
                                            ? href
                                            : `${Cypress.config('baseUrl')}${href}`;

                                        // Reconcile API total with UI count, tolerating one
                                        // round of transient data churn before failing.
                                        return reconcileApiTotalWithUiCount(fullUrl, uiCount, {
                                            context: 'Popover total (row-summary) vs API total',
                                        });
                                    });
                            } else {
                                Cypress.log({
                                    name: 'Skipping API total check for row-summary',
                                    message: `UI count is ${uiCount}, but API check is skipped as per parameters.`,
                                });
                            }
                        });
                } else if (blockType === 'col-summary') {
                    // assay (primary row)
                    if (assay) {
                        const expectedAssayLabel =
                            assay === 'overall-summary' ? 'Overall' : assay;

                        cy.get('.primary-row .col-12.value', { timeout: 10000 })
                            .should('contain.text', expectedAssayLabel);
                    }

                    // Validate that expected block value appears in numeric popover metrics
                    // (e.g. Donors or Total Files depending on clicked summary row).
                    cy.get('.secondary-row .col-4', { timeout: 10000 })
                        .then(($cols) => {
                            const numericValues = [];
                            let totalFilesValue = null;

                            [...$cols].forEach((col) => {
                                const $col = Cypress.$(col);
                                const label = $col.find('.label').text().trim();
                                const rawText = $col.find('.value').text().trim();
                                const numericValue = parseIntSafe(
                                    rawText.replace(/,/g, '')
                                );
                                if (!Number.isNaN(numericValue)) {
                                    numericValues.push(numericValue);
                                    if (label === 'Total Files') {
                                        totalFilesValue = numericValue;
                                    }
                                }
                            });

                            expect(
                                numericValues,
                                `Popover numeric metrics should include expected value ${value}`
                            ).to.include(value);

                            const uiCountForApiValidation = totalFilesValue !== null
                                ? totalFilesValue
                                : (numericValues.length > 0 ? Math.max(...numericValues) : value);

                            if (verifyTotalFromApi) {
                                // Get the URL from the "Browse Files" button in footer
                                cy.get('.footer-row a.btn.btn-primary')
                                    .invoke('attr', 'href')
                                    .then((href) => {
                                        // If the href is relative (starts with "/"), prefix with baseUrl
                                        const fullUrl = href.startsWith('http')
                                            ? href
                                            : `${Cypress.config('baseUrl')}${href}`;

                                        // Reconcile API total with UI count, tolerating one
                                        // round of transient data churn before failing.
                                        return reconcileApiTotalWithUiCount(fullUrl, uiCountForApiValidation, {
                                            context: 'Popover total (col-summary) vs API total',
                                        });
                                    });
                            } else {
                                Cypress.log({
                                    name: 'Skipping API total check for col-summary',
                                    message: `Popover expected value is ${value}, but API check is skipped as per parameters.`,
                                });
                            }
                        });
                }

            });
        }))
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
                message: `value: ${value}, donor: ${donor}, tissue: ${tissue}, assay: ${assay}, verifyTotalFromApi: ${verifyTotalFromApi}`,
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

function hasNonZeroVariantCallSetsSummary(matrixId) {
    const $variantSummaryBlocks = Cypress.$(
        `${matrixId} [data-group-key="Variant Call Sets"] [data-block-type="col-summary"]`
    );

    return [...$variantSummaryBlocks].some((el) => {
        const value = parseInt(
            ((el.getAttribute('data-block-value') || Cypress.$(el).text()) || '').trim(),
            10
        );
        return value > 0;
    });
}

function hasNonZeroDSASummary(matrixId) {
    const $dsaSummaryBlocks = Cypress.$(
        `${matrixId} [data-group-key="DSA"] [data-block-type="col-summary"]`
    );
    return [...$dsaSummaryBlocks].some((el) => {
        const value = parseInt(
            ((el.getAttribute('data-block-value') || Cypress.$(el).text()) || '').trim(),
            10
        );
        return value > 0;
    });
}

function assertMatrixTotalFileCount(sum, expectedFilesCount, label, matrixId, allowVariantCallSetMatrixUndercount, allowDSARowSummaryOvercount) {
    if (!allowVariantCallSetMatrixUndercount) {
        if (allowDSARowSummaryOvercount && label.includes('row-summary') && hasNonZeroDSASummary(matrixId)) {
            expect(
                sum,
                `${label} with DSA present should be at least donor summary file count`
            ).to.be.at.least(expectedFilesCount);
            return;
        }
        expect(sum, `${label} should be at least expected file count`).to.be.at.least(expectedFilesCount);
        return;
    }

    const hasVariantCallSets = hasNonZeroVariantCallSetsSummary(matrixId);

    if (hasVariantCallSets) {
        // Variant Call Sets can overlap with CODEC / NanoSeq / VistaSeq counts,
        // so the summed col-summary total can legitimately exceed the donor
        // summary file count.
        expect(
            expectedFilesCount,
            `${label} with Variant Call Sets present should be at most summed col-summary file count`
        ).to.be.at.most(sum);
    } else {
        if (allowDSARowSummaryOvercount && label.includes('row-summary') && hasNonZeroDSASummary(matrixId)) {
            expect(
                sum,
                `${label} with DSA present should be at least donor summary file count`
            ).to.be.at.least(expectedFilesCount);
            return;
        }
        expect(sum, `${label} should match donor summary file count`).to.equal(expectedFilesCount);
    }
}

function rowHasDSAColumn($row, regularBlocksSelector) {
    const $regularBlocks = $row.find(regularBlocksSelector);
    return [...$regularBlocks].some((block) => {
        const groupKey = Cypress.$(block).parent().attr('data-group-key');
        return groupKey === 'DSA';
    });
}

function rowHasAnyAssayColumn($row, regularBlocksSelector, assayNames) {
    const normalizedAssayNames = assayNames.map((assayName) =>
        String(assayName).trim().toLowerCase()
    );

    const $regularBlocks = $row.find(regularBlocksSelector);
    return [...$regularBlocks].some((block) => {
        const groupKey = String(Cypress.$(block).parent().attr('data-group-key') || '')
            .trim()
            .toLowerCase();
        return normalizedAssayNames.includes(groupKey);
    });
}

function extractColumnTotalsFromBlocks($blocks, { visibleOnly = false } = {}) {
    const columnTotals = {};

    [...$blocks].forEach((block) => {
        const $block = Cypress.$(block);
        if (visibleOnly && !$block.is(':visible')) return;

        const groupKey = String($block.parent().attr('data-group-key') || '').trim();
        if (!groupKey || groupKey === 'overall-summary') return;

        const blockValue = parseFloat(String($block.attr('data-block-value') || $block.text() || '').replace(/,/g, '').trim());
        if (Number.isNaN(blockValue)) return;

        columnTotals[groupKey] = (columnTotals[groupKey] || 0) + blockValue;
    });

    return columnTotals;
}

function getMatrixSectionColumnTotals(matrixId, labelText = 'Total Files') {
    return cy.document().then((doc) => {
        const $matrix = Cypress.$(doc).find(matrixId).first();
        expect($matrix.length, `expected to find matrix ${matrixId}`).to.be.greaterThan(0);

        const $sectionHeaders = $matrix.find('.header-section-lower').filter((_, headerEl) => {
            return Cypress.$(headerEl)
                .find('.grouping-row .label-section span')
                .filter((__, spanEl) => Cypress.$(spanEl).text().trim() === labelText)
                .length > 0;
        });

        expect(
            $sectionHeaders.length,
            `expected to find at least one ${labelText} summary band inside ${matrixId}`
        ).to.be.greaterThan(0);

        return [...$sectionHeaders].map((headerEl, sectionIndex) => {
            const $header = Cypress.$(headerEl);
            const $summaryRow = $header.find('.grouping-row').filter((_, rowEl) => {
                return Cypress.$(rowEl)
                    .find('.label-section span')
                    .filter((__, spanEl) => Cypress.$(spanEl).text().trim() === labelText)
                    .length > 0;
            }).first();

            expect(
                $summaryRow.length,
                `expected to find summary band row ${labelText} inside ${matrixId} section ${sectionIndex + 1}`
            ).to.be.greaterThan(0);

            const summaryColumnTotals = extractColumnTotalsFromBlocks(
                $summaryRow.find('[data-block-type="col-summary"]')
            );

            const sectionRegularBlocks = [];
            let sectionNode = headerEl.nextElementSibling;
            while (sectionNode) {
                const $sectionNode = Cypress.$(sectionNode);
                if ($sectionNode.hasClass('header-section-lower')) {
                    break;
                }
                sectionRegularBlocks.push(...$sectionNode.find('[data-block-type="regular"]').toArray());
                sectionNode = sectionNode.nextElementSibling;
            }

            const visibleColumnTotals = extractColumnTotalsFromBlocks(sectionRegularBlocks, { visibleOnly: true });
            const $precedingPrimaryLabel = $summaryRow.prev('.total-donors-summary-row').find('.label-section span').first();
            const sectionLabel = $precedingPrimaryLabel.text().trim() || `${labelText} section ${sectionIndex + 1}`;

            return {
                sectionIndex,
                sectionLabel,
                summaryColumnTotals,
                visibleColumnTotals
            };
        });
    });
}

function assertFileColumnSummaryMatchesVisibleCells(matrixId, labelText = 'Total Files') {
    return getMatrixSectionColumnTotals(matrixId, labelText).then((sections) => {
        expect(
            sections.length,
            `${labelText} section summaries should exist for ${matrixId}`
        ).to.be.greaterThan(0);

        sections.forEach(({ sectionLabel, summaryColumnTotals, visibleColumnTotals }) => {
            const allColumnKeys = Cypress._.uniq([
                ...Object.keys(visibleColumnTotals || {}),
                ...Object.keys(summaryColumnTotals || {})
            ]);

            expect(
                allColumnKeys.length,
                `${sectionLabel} ${labelText} summary should include assay columns`
            ).to.be.greaterThan(0);

            allColumnKeys.forEach((columnKey) => {
                const visibleCellSum = visibleColumnTotals?.[columnKey] || 0;
                const summaryValue = summaryColumnTotals?.[columnKey];

                expect(
                    summaryValue,
                    `${sectionLabel} ${labelText} summary should include a value for ${columnKey}`
                ).to.not.equal(undefined);

                expect(
                    summaryValue,
                    `${sectionLabel} ${labelText} summary for ${columnKey} should equal the sum of visible cells underneath`
                ).to.equal(visibleCellSum);
            });
        });
    });
}

function collapseTopLevelMatrixRows(matrixId) {
    return cy.document().then((doc) => {
        const $rows = Cypress.$(doc).find(`${matrixId} .grouping.depth-0`);
        expect($rows.length, `expected to find top-level matrix rows for ${matrixId}`).to.be.greaterThan(0);
        const openRows = $rows.filter('.may-collapse.open');

        openRows.each((index, row) => {
            const $icon = Cypress.$(row).find('i.icon-minus');
            if ($icon.length) {
                cy.wrap($icon).click();
            }
        });

        if (openRows.length === 0) {
            cy.log('No open rows found to collapse');
        }

        Cypress.log({ name: 'Collapse Rows', message: `${openRows.length} rows collapsed` });
    });
}

/** * Validates the data matrix popover content for specified donors and labels.
 * * @param {string} matrixId - The CSS selector for the data matrix.
 * @param {string[]} donors - An array of donor IDs to validate.
 * @param {string[]} mustLabels - An array of labels that must be present in the popover.
 * @param {string[]} optionalLabels - An array of labels that may be present in the popover.
 * @param {string[]} expectedLowerLabels - An array of expected lower header labels.
 * @param {number} regularBlockCount - The number of regular blocks to test popovers for.
 * @param {number} rowSummaryBlockCount - The number of row summary blocks to test popovers for.
 * @param {number} colSummaryBlockCount - The number of column summary blocks to test popovers for.
 * @param {number|null} expectedFilesCount - The expected number of files to be found, set "null" to skip strict total check.
 * @param {boolean} allowVariantCallSetMatrixUndercount - Allow donor overview matrices with Variant Call Sets
 * to undercount vs summary because some files are intentionally omitted from the matrix.
 * @param {boolean} allowDSARowSummaryOvercount - Allow relaxed row-summary reconciliation
 * when DSA summary columns are present.
 * @param {string[]} skipColSummaryTotalCheckForDonors - Donor allowlist to skip strict
 * col-summary total reconciliation.
 * @param {boolean} verifyTotalFromApi - Whether to cross-check the total file count from the API.
 * @returns {void}
 * This function performs the following validations:
 * 1. Asserts that the popover is visible.
 * 2. Validates the presence of required labels.
 * 3. Checks for the correct donor and assay information.
 * 4. Confirms the file count is as expected.
 * 5. Validates the lower headers and their associated col-summary blocks.
 */
export function testMatrixPopoverValidation(
    matrixId = '#data-matrix-for_production',
    {
        donors = ['SMHT004', 'SMHT008'],
        mustLabels = ['Non-exposed Skin', 'Heart', 'Blood'],
        optionalLabels = [],
        expectedLowerLabels = ['Donors'],
        regularBlockCount = 6,
        rowSummaryBlockCount = 6,
        colSummaryBlockCount = 2,
        expectedFilesCount = 1,
        expectedTissuesCount = null,
        allowVariantCallSetMatrixUndercount = false,
        allowDSARowSummaryOvercount = false,
        skipColSummaryTotalCheckForDonors = [],
        verifyTotalFromApi = true,
    }) {
    cy.get(matrixId).should('exist');

    if (typeof expectedFilesCount === 'number' && expectedFilesCount === 0) {
        cy.get(`${matrixId} .stacked-block-viz-container .no-data-available`).should('contain.text', 'No data available');
        return;
    }

    cy.get(matrixId).within(() => {
        validateLowerHeaders(expectedLowerLabels);

        let anyCollapsibleRows = false;
        //collapse all to a fresh start
        cy.get('.grouping.depth-0').then(($rows) => {
            collapseTopLevelMatrixRows(matrixId);
            anyCollapsibleRows = $rows.filter('.may-collapse').length > 0;
            Cypress.log({ name: 'Has Any Collapsible/Expandable Rows', message: `${anyCollapsibleRows}` });

            assertFileColumnSummaryMatchesVisibleCells(matrixId, 'Total Files');

            // this code block makes all collapsed sections as expanded
            // TODO: implement test cases for all collapsed sections
            if (anyCollapsibleRows) {
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
                            const hasDSAColumn = rowHasDSAColumn($row, '.child-blocks [data-block-type="regular"]');
                            const hasVariantCallSetAssayColumn = rowHasAnyAssayColumn(
                                $row,
                                '.child-blocks [data-block-type="regular"]',
                                ['CODEC', 'NanoSeq', 'VISTA-Seq']
                            );
                            const hasVariantCallSets = hasNonZeroVariantCallSetsSummary(matrixId);
                            if (hasVariantCallSetAssayColumn && hasVariantCallSets) {
                                expect(sum, `Row summary for ${rowLabel} with CODEC/NanoSeq/VISTA-Seq and Variant Call Sets`).to.be.at.least(expectedRowSummary);
                            } else if (hasDSAColumn) {
                                expect(sum, `Row summary for ${rowLabel} with DSA column`).to.be.at.least(expectedRowSummary);
                            } else {
                                expect(sum, `Row summary for ${rowLabel}`).to.equal(expectedRowSummary);
                            }
                        });
                });
            }
        });

        // Random [regularBlockCount] regular block popovers
        cy.get('[data-block-type="regular"]').then(($allBlocks) => {
            const allBlocks = Array.from($allBlocks);
            const selected = Cypress._.sampleSize(allBlocks, regularBlockCount);

            const testCases = selected.map((el) => {
                const $el = Cypress.$(el);
                const value = parseInt(
                    (($el.find('[data-count]').attr('data-count') || $el.attr('data-count') || $el.text()) || '').trim(),
                    10
                );
                const donor = $el.closest('.grouping.depth-0').find('.grouping-row h4 .inner').eq(0).text().trim();
                const tissue = $el.closest('.grouping.depth-1').find('.grouping-row h4 .inner').eq(0).text().trim();
                const assay = $el.parent().attr('data-group-key');
                return { el, donor, assay, tissue, value };
            });

            testCases.forEach(({ el, donor, tissue, assay, value }) => {
                if (value > 0) {
                    cy.wrap(el).scrollIntoView().click({ force: true });
                    assertPopover({ donor, assay, tissue, value, verifyTotalFromApi });
                }
            });
        });

        // Random [rowSummaryBlockCount] row-summary block popovers
        cy.get('[data-block-type="row-summary"]').then(($blocks) => {
            Cypress._.sampleSize([...$blocks], rowSummaryBlockCount).forEach((el) => {
                const $el = Cypress.$(el);
                const value = parseInt(
                    (($el.find('[data-count]').attr('data-count') || $el.attr('data-count') || $el.text()) || '').trim(),
                    10
                );
                if (value > 0) {
                    const donor = $el.closest('.grouping.depth-0').find('h4 .inner').eq(0).text().trim();
                    cy.wrap(el).scrollIntoView().click({ force: true });
                    assertPopover({ donor, assay: '', value, blockType: 'row-summary', verifyTotalFromApi });
                }
            });
            // verify overall file count matches expectedFilesCount
            if (typeof expectedFilesCount === 'number' && expectedFilesCount > 0) {
                cy.log(`Expected matrix total to reconcile with ${expectedFilesCount} files.`);
                let sum = 0;
                [...$blocks].forEach((el) => {
                    const value = parseInt(Cypress.$(el).text().trim(), 10);
                    if (value > 0) {
                        sum += value;
                    }
                });
                assertMatrixTotalFileCount(
                    sum,
                    expectedFilesCount,
                    'Total file count across row-summary blocks',
                    matrixId,
                    allowVariantCallSetMatrixUndercount,
                    allowDSARowSummaryOvercount
                );
            }
        });

        // Random [colSummaryBlockCount] col-summary block popovers
        cy.get('[data-block-type="col-summary"]:not([data-block-value="0"])').then(($blocks) => {
            Cypress._.sampleSize([...$blocks], colSummaryBlockCount).forEach((el) => {
                const $el = Cypress.$(el);
                const value = parseInt(
                    (($el.find('[data-count]').attr('data-count') || $el.attr('data-count') || $el.text()) || '').trim(),
                    10
                );
                if (value > 0) {
                    const assay = $el.parent().attr('data-group-key');
                    cy.wrap(el).scrollIntoView().click({ force: true });
                    assertPopover({ donor: '', assay: assay, value, blockType: 'col-summary', verifyTotalFromApi });
                }
            });
            // verify overall file count matches expectedFilesCount
            if (typeof expectedFilesCount === 'number' && expectedFilesCount > 0) {
                const shouldSkipColSummaryTotalCheck = Array.isArray(skipColSummaryTotalCheckForDonors)
                    && donors.some((donorId) => skipColSummaryTotalCheckForDonors.includes(donorId));
                if (shouldSkipColSummaryTotalCheck) {
                    cy.log('Skipping col-summary strict total check for configured donor(s).');
                    return;
                }
                cy.log(`Expected matrix total to reconcile with ${expectedFilesCount} files.`);
                let sum = 0;
                [...$blocks].forEach((el) => {
                    const groupKey = Cypress.$(el).parent().attr('data-group-key');
                    if (groupKey === 'overall-summary') {
                        return;
                    }
                    const value = parseInt(Cypress.$(el).text().trim(), 10);
                    if (value > 0) {
                        sum += value;
                    }
                });
                assertMatrixTotalFileCount(
                    sum,
                    expectedFilesCount,
                    'Total file count across col-summary blocks',
                    matrixId,
                    allowVariantCallSetMatrixUndercount,
                    allowDSARowSummaryOvercount
                );
            }
        });

        // Check total unique tissues in the matrix
        if (typeof expectedTissuesCount === 'number' && expectedTissuesCount > 0) {
            cy.get('.grouping.depth-0').then(($rows) => {
                anyCollapsibleRows = $rows.filter('.may-collapse').length > 0;
                // expand all tissues to ensure we capture all unique tissues
                if (anyCollapsibleRows) {
                    cy.get('.grouping.depth-0.may-collapse').each(($row) => {
                        const expandIcon = $row.find('i.icon-plus');
                        if (expandIcon.length > 0) {
                            cy.wrap(expandIcon).click();
                        }
                    });
                }

                const uniqueTissues = new Set();

                cy.get(anyCollapsibleRows ? '.grouping.depth-1 .grouping-row .inner' : '.grouping.depth-0 .grouping-row .inner').then(($labels) => {
                    $labels.each((index, label) => {
                        const tissue = Cypress.$(label).text().trim();
                        if (tissue && tissue !== 'N/A') {
                            uniqueTissues.add(tissue);
                        }
                    });

                    const tissueCount = uniqueTissues.size;
                    expect(tissueCount, 'Total unique tissues in matrix').to.equal(expectedTissuesCount);
                });
            });
        }

        // Check sum of regular blocks in a row equals to the row summary
        // Note: collapse all to a fresh start
        if (verifyTotalFromApi) { // conditional because of COLO829 public donor matrix is not fully consistent
            cy.get('.grouping.depth-0').then(($rows) => {
                // filter only open rows
                const openRows = $rows.filter('.may-collapse.open');

                openRows.each((index, row) => {
                    const $icon = Cypress.$(row).find('i.icon-minus');
                    if ($icon.length) {
                        cy.wrap($icon).click();
                    }
                });

                cy.get('.grouping.depth-0').each(($row) => {

                    cy.wrap($row).within(() => {
                        const rowSummaryText = $row.find('.blocks-container [data-block-type="row-summary"] span').text().trim();
                        const expectedRowSummary = parseInt(rowSummaryText, 10);

                        cy.wrap($row)
                        .find('.blocks-container [data-block-type="regular"] span')
                        .then(($spans) => {
                            const sum = Cypress._.sum([...$spans].map((el) => parseInt(el.textContent.trim(), 10)));
                            const rowLabel = $row.find('.grouping-row h4 .inner').first().text().trim();
                            const hasDSAColumn = rowHasDSAColumn($row, '.blocks-container [data-block-type="regular"]');
                            const hasVariantCallSetAssayColumn = rowHasAnyAssayColumn(
                                $row,
                                '.blocks-container [data-block-type="regular"]',
                                ['CODEC', 'NanoSeq', 'VISTA-Seq']
                            );
                            const hasVariantCallSets = hasNonZeroVariantCallSetsSummary(matrixId);
                            if (hasVariantCallSetAssayColumn && hasVariantCallSets) {
                                expect(sum, `Row summary for ${rowLabel} with CODEC/NanoSeq/VISTA-Seq and Variant Call Sets`).to.be.at.least(expectedRowSummary);
                            } else if (hasDSAColumn) {
                                expect(sum, `Row summary for ${rowLabel} with DSA column`).to.be.at.least(expectedRowSummary);
                            } else {
                                expect(sum, `Row summary for ${rowLabel}`).to.equal(expectedRowSummary);
                            }
                        });
                    });
                });
            });
        }
    });
}

export function waitForMatrixModeRender(matrixId) {
    cy.get(`${matrixId} .matrix-render-surface`, { timeout: 20000 })
        .should('exist')
        .and('not.have.class', 'is-refreshing');

    cy.get(`${matrixId} .matrix-refresh-overlay`).should('not.exist');
}

function getDisplayedMatrixFileCount(matrixId) {
    return cy.get(`${matrixId} .matrix-total-files-count`)
        .should('be.visible')
        .invoke('text')
        .then((text) => parseInt(String(text).replace(/[^0-9]/g, ''), 10));
}

function getMatrixToggleButton(matrixId, label) {
    return cy.contains(`${matrixId} .matrix-counts-toggle-inline .view-toggle button`, label);
}

function getFirstPositiveRegularBlockText(matrixId) {
    return cy.get(`${matrixId} [data-block-type="regular"]`).then(($blocks) => {
        const firstPositiveBlock = [...$blocks].find((block) => {
            const blockValue = parseFloat(block.getAttribute('data-block-value'));
            return Cypress.$(block).is(':visible') && !Number.isNaN(blockValue) && blockValue > 0;
        });

        expect(firstPositiveBlock, 'expected at least one visible positive regular matrix block').to.exist;
        return cy.wrap(firstPositiveBlock).find('span').invoke('text').then((text) => String(text).trim());
    });
}

function getFirstPositiveRegularBlockInfo(matrixId) {
    return cy.get(`${matrixId} [data-block-type="regular"]`).then(($blocks) => {
        const firstPositiveBlock = [...$blocks].find((block) => {
            const blockValue = parseFloat(block.getAttribute('data-block-value'));
            return Cypress.$(block).is(':visible') && !Number.isNaN(blockValue) && blockValue > 0;
        });

        expect(firstPositiveBlock, 'expected at least one visible positive regular matrix block').to.exist;

        const rawValue = parseFloat(firstPositiveBlock.getAttribute('data-block-value'));
        return cy.wrap(firstPositiveBlock).find('span').invoke('text').then((text) => {
            return {
                element: firstPositiveBlock,
                rawValue,
                displayText: String(text).trim()
            };
        });
    });
}

function formatCoverageBoxValue(rawValue) {
    const normalizedValue = Number(rawValue) || 0;
    if (normalizedValue <= 0) {
        return '0X';
    }

    const units = [
        { threshold: 1e9, suffix: 'B' },
        { threshold: 1e6, suffix: 'M' },
        { threshold: 1e3, suffix: 'K' },
    ];

    const matchingUnit = units.find(({ threshold }) => Math.abs(normalizedValue) >= threshold) || null;
    if (!matchingUnit) {
        const rounded = normalizedValue < 100
            ? Math.round(normalizedValue * 10) / 10
            : Math.round(normalizedValue);
        return `${rounded.toLocaleString()}X`;
    }

    const scaledValue = normalizedValue / matchingUnit.threshold;
    const decimals = scaledValue >= 100 ? 0 : 1;
    const formattedScaledValue = Number.parseFloat(scaledValue.toFixed(decimals)).toLocaleString();
    return `${formattedScaledValue}${matchingUnit.suffix}X`;
}

function parseCoverageValue(text) {
    return parseFloat(String(text).replace(/,/g, '').replace(/X/g, '').trim());
}

function assertCoverageBlockMatchesPopover(matrixId, contextLabel = 'Coverage view') {
    getFirstPositiveRegularBlockInfo(matrixId).then(({ element, rawValue, displayText }) => {
        const expectedBoxValue = formatCoverageBoxValue(rawValue);
        const expectedPopoverValue = Math.round(rawValue * 100) / 100;

        expect(
            displayText,
            `${contextLabel} box value should match coverage formatting for the underlying block value`
        ).to.equal(expectedBoxValue);

        cy.wrap(element).scrollIntoView().click({ force: true });

        cy.waitForPopoverShow().then(() =>
            waitForPopoverVisible().then((popoverEl) => {
                cy.wrap(popoverEl).should('be.visible').within(() => {
                    cy.get('.secondary-row .col-4', { timeout: 10000 })
                        .eq(1)
                        .find('.value')
                        .invoke('text')
                        .then((text) => {
                            const popoverCoverageValue = parseCoverageValue(text);
                            expect(
                                popoverCoverageValue,
                                `${contextLabel} popover Total Coverage should match the clicked box value`
                            ).to.equal(expectedPopoverValue);
                        });
                });
            })
        )
            .then(() => {
                cy.document()
                    .its('body')
                    .then((body) => cy.wrap(body).click(0, 0, { force: true }));

                return waitUntilPopoverClosed();
            });
    });
}

function getSummaryBandOverallValue(matrixId, labelText) {
    return cy.contains(`${matrixId} .header-section-lower .grouping-row .label-section span`, labelText)
        .closest('.grouping-row')
        .find('[data-group-key="overall-summary"] [data-block-type="col-summary"]')
        .should('exist')
        .invoke('attr', 'data-block-value')
        .then((value) => parseFloat(String(value).trim()));
}

function getDonorTissueAssayOptions(matrixId) {
    return cy.get(`${matrixId} .matrix-assay-select`)
        .should('be.visible')
        .find('option')
        .then(($options) => [...$options].map((option) => {
            return {
                label: option.textContent.trim(),
                value: option.value
            };
        }));
}

function getDonorTissueAllOption(matrixId) {
    return getDonorTissueAssayOptions(matrixId).then((options) => {
        const [allOption] = options;
        expect(allOption, 'Donor x Tissue assay dropdown should include an All option first').to.exist;
        return allOption;
    });
}

function selectDonorTissueAssayAndGetFileCount(matrixId, assayValue, assayLabelForMessage = assayValue) {
    cy.get(`${matrixId} .matrix-assay-select`)
        .select(assayValue, { force: true })
        .should('have.value', assayValue);

    waitForMatrixModeRender(matrixId);

    cy.get(`${matrixId} .matrix-assay-select`).should('have.value', assayValue);

    return getDisplayedMatrixFileCount(matrixId).then((leftPanelCount) =>
        getSummaryBandOverallValue(matrixId, 'Total Files').then((summaryValue) => {
            expect(
                summaryValue,
                `Donor x Tissue Total Files summary should be numeric for assay ${assayLabelForMessage}`
            ).to.be.greaterThan(0);
            return { leftPanelCount, summaryValue };
        })
    );
}

export function testDonorAssayFilesCoverageToggle(matrixId) {
    let donorAssayFileCount = null;

    getMatrixToggleButton(matrixId, 'Files')
        .should('have.class', 'active')
        .and('have.attr', 'aria-pressed', 'true');
    getMatrixToggleButton(matrixId, 'Coverage')
        .should('not.have.class', 'active')
        .and('have.attr', 'aria-pressed', 'false');

    getDisplayedMatrixFileCount(matrixId).then((count) => {
        donorAssayFileCount = count;
    });

    getFirstPositiveRegularBlockText(matrixId).then((text) => {
        expect(text, 'Donor x Assay files view should show plain numeric block labels').to.not.match(/X$/);
    });

    getMatrixToggleButton(matrixId, 'Coverage').click({ force: true });

    waitForMatrixModeRender(matrixId);
    getMatrixToggleButton(matrixId, 'Coverage')
        .should('have.class', 'active')
        .and('have.attr', 'aria-pressed', 'true');
    getMatrixToggleButton(matrixId, 'Files')
        .should('not.have.class', 'active')
        .and('have.attr', 'aria-pressed', 'false');

    getDisplayedMatrixFileCount(matrixId).then((count) => {
        expect(
            count,
            'left facet-panel file count should stay the same in Coverage view'
        ).to.equal(donorAssayFileCount);
    });

    getFirstPositiveRegularBlockText(matrixId).then((text) => {
        expect(text, 'Donor x Assay coverage view should show coverage labels ending with X').to.match(/X$/);
    });

    assertCoverageBlockMatchesPopover(matrixId, 'Donor x Assay coverage view');

    getMatrixToggleButton(matrixId, 'Files').click({ force: true });

    waitForMatrixModeRender(matrixId);
    getMatrixToggleButton(matrixId, 'Files')
        .should('have.class', 'active')
        .and('have.attr', 'aria-pressed', 'true');
    getMatrixToggleButton(matrixId, 'Coverage')
        .should('not.have.class', 'active')
        .and('have.attr', 'aria-pressed', 'false');

    getDisplayedMatrixFileCount(matrixId).then((count) => {
        expect(
            count,
            'left facet-panel file count should return unchanged after toggling back to Files'
        ).to.equal(donorAssayFileCount);
    });

    getFirstPositiveRegularBlockText(matrixId).then((text) => {
        expect(text, 'Donor x Assay files view should be restored after toggling back').to.not.match(/X$/);
    });
}

export function testTissueAssayFilesDonorsToggle(matrixId) {
    let displayedFileCount = null;
    let totalTissuesCount = null;
    let totalFilesSummaryValue = null;

    cy.get(matrixId).within(() => {
        validateLowerHeaders(['Total Tissues', 'Total Files']);
    });

    getMatrixToggleButton(matrixId, 'Files')
        .should('have.class', 'active')
        .and('have.attr', 'aria-pressed', 'true');
    getMatrixToggleButton(matrixId, 'Donors')
        .should('not.have.class', 'active')
        .and('have.attr', 'aria-pressed', 'false');

    getDisplayedMatrixFileCount(matrixId).then((count) => {
        displayedFileCount = count;
    });

    getSummaryBandOverallValue(matrixId, 'Total Tissues').then((value) => {
        totalTissuesCount = value;
    });

    getSummaryBandOverallValue(matrixId, 'Total Files').then((value) => {
        totalFilesSummaryValue = value;
        expect(
            value,
            'Tissue x Assay overall Total Files summary should match the left facet-panel file count'
        ).to.equal(displayedFileCount);
    });

    collapseTopLevelMatrixRows(matrixId);
    assertFileColumnSummaryMatchesVisibleCells(matrixId, 'Total Files');

    getFirstPositiveRegularBlockText(matrixId).then((text) => {
        expect(text, 'Tissue x Assay files view should show plain numeric block labels').to.not.match(/X$/);
    });

    getMatrixToggleButton(matrixId, 'Donors').click({ force: true });

    waitForMatrixModeRender(matrixId);
    cy.get(matrixId).within(() => {
        validateLowerHeaders(['Total Tissues', 'Total Donors']);
    });

    getMatrixToggleButton(matrixId, 'Donors')
        .should('have.class', 'active')
        .and('have.attr', 'aria-pressed', 'true');
    getMatrixToggleButton(matrixId, 'Files')
        .should('not.have.class', 'active')
        .and('have.attr', 'aria-pressed', 'false');

    getDisplayedMatrixFileCount(matrixId).then((count) => {
        expect(
            count,
            'left facet-panel file count should stay the same in Tissue x Assay donors view'
        ).to.equal(displayedFileCount);
    });

    getSummaryBandOverallValue(matrixId, 'Total Tissues').then((value) => {
        expect(
            value,
            'Tissue x Assay overall Total Tissues summary should stay the same when toggling to Donors'
        ).to.equal(totalTissuesCount);
    });

    getSummaryBandOverallValue(matrixId, 'Total Donors').then((value) => {
        expect(
            value,
            'Tissue x Assay overall Total Donors summary should be numeric'
        ).to.be.greaterThan(0);
        expect(
            value,
            'Tissue x Assay overall Total Donors summary should differ from the Total Files summary after toggling'
        ).to.not.equal(totalFilesSummaryValue);
    });

    getFirstPositiveRegularBlockText(matrixId).then((text) => {
        expect(text, 'Tissue x Assay donors view should still show plain numeric block labels').to.not.match(/X$/);
    });

    getMatrixToggleButton(matrixId, 'Files').click({ force: true });

    waitForMatrixModeRender(matrixId);
    cy.get(matrixId).within(() => {
        validateLowerHeaders(['Total Tissues', 'Total Files']);
    });

    getMatrixToggleButton(matrixId, 'Files')
        .should('have.class', 'active')
        .and('have.attr', 'aria-pressed', 'true');
    getMatrixToggleButton(matrixId, 'Donors')
        .should('not.have.class', 'active')
        .and('have.attr', 'aria-pressed', 'false');

    getDisplayedMatrixFileCount(matrixId).then((count) => {
        expect(
            count,
            'left facet-panel file count should return unchanged after toggling Tissue x Assay back to Files'
        ).to.equal(displayedFileCount);
    });

    getSummaryBandOverallValue(matrixId, 'Total Files').then((value) => {
        expect(
            value,
            'Tissue x Assay overall Total Files summary should be restored after toggling back'
        ).to.equal(totalFilesSummaryValue);
    });

    collapseTopLevelMatrixRows(matrixId);
    assertFileColumnSummaryMatchesVisibleCells(matrixId, 'Total Files');
}

export function testDonorTissueMode(matrixId) {
    let allAssaysLeftPanelCount = null;
    let allAssaysSummaryValue = null;
    const nonAllAssayTotals = [];

    cy.contains(`${matrixId} .matrix-mode-tab`, 'Donor x Tissue')
        .click({ force: true })
        .should('have.class', 'active');

    waitForMatrixModeRender(matrixId);
    cy.get(matrixId)
        .should('have.class', 'matrix-mode-tissue')
        .and('have.class', 'matrix-mode-donor-tissue');
    cy.get(`${matrixId} .matrix-counts-toggle-inline`).should('be.visible');
    cy.get(`${matrixId} .matrix-assay-select`)
        .should('be.visible')
        .find('option')
        .its('length')
        .should('be.greaterThan', 1);

    getDonorTissueAllOption(matrixId).then((allOption) =>
        selectDonorTissueAssayAndGetFileCount(matrixId, allOption.value, allOption.label).then(({ leftPanelCount, summaryValue }) => {
            allAssaysLeftPanelCount = leftPanelCount;
            allAssaysSummaryValue = summaryValue;

            expect(
                summaryValue,
                'Donor x Tissue All-option Total Files summary should match the left facet-panel file count before assay filtering'
            ).to.equal(leftPanelCount);

            return getDonorTissueAssayOptions(matrixId).then((options) => {
                const nonAllOptions = options.filter(({ value }) => value !== allOption.value);

                expect(nonAllOptions, 'Donor x Tissue assay dropdown should include non-All assay options').to.have.length.greaterThan(0);

                function collectNonAllAssayTotals(index = 0) {
                    if (index >= nonAllOptions.length) {
                        return cy.wrap(null);
                    }

                    const { label, value } = nonAllOptions[index];
                    return selectDonorTissueAssayAndGetFileCount(matrixId, value, label)
                        .then(({ leftPanelCount, summaryValue }) => {
                            expect(
                                leftPanelCount,
                                `Donor x Tissue left facet-panel file count should persist when assay dropdown switches to ${label}`
                            ).to.equal(allAssaysLeftPanelCount);
                            expect(
                                summaryValue,
                                `Donor x Tissue ${label} Total Files summary should not exceed the persistent left facet-panel file count`
                            ).to.be.at.most(allAssaysLeftPanelCount);
                            nonAllAssayTotals.push({ label, count: summaryValue });
                        })
                        .then(() => collectNonAllAssayTotals(index + 1));
                }

                return collectNonAllAssayTotals().then(() => {
                    const summedNonAllAssays = nonAllAssayTotals.reduce((sum, { count: nextCount }) => sum + nextCount, 0);
                    return selectDonorTissueAssayAndGetFileCount(matrixId, allOption.value, allOption.label).then(({ leftPanelCount, summaryValue }) => {
                        expect(
                            leftPanelCount,
                            'Donor x Tissue left facet-panel file count should remain stable after iterating through non-All assay options'
                        ).to.equal(allAssaysLeftPanelCount);
                        expect(
                            summaryValue,
                            'Donor x Tissue All-option Total Files summary should remain stable after iterating through non-All assay options'
                        ).to.equal(allAssaysSummaryValue);
                        expect(
                            summedNonAllAssays,
                            'Sum of Donor x Tissue Total Files values across non-All assay dropdown options should cover the All-option total'
                        ).to.be.at.least(summaryValue);
                    });
                });
            });
        })
    ).then(() => {
        getDonorTissueAllOption(matrixId).then((allOption) => {
            selectDonorTissueAssayAndGetFileCount(matrixId, allOption.value, allOption.label).then(({ leftPanelCount, summaryValue }) => {
                expect(
                    leftPanelCount,
                    'Donor x Tissue left facet-panel file count should still show the full All-option total after switching assay dropdown back'
                ).to.equal(allAssaysLeftPanelCount);
                expect(
                    summaryValue,
                    'Donor x Tissue All-option Total Files summary should be restored after switching assay dropdown back'
                ).to.equal(allAssaysSummaryValue);
            });
        });
    });
}

export function testProductionMatrixModeTabs(matrixId = '#data-matrix-for_production') {
    const tabLabels = ['Donor x Assay', 'Tissue x Assay', 'Donor x Tissue'];
    const fileCountsByMode = {};

    cy.get(matrixId).should('exist').within(() => {
        cy.get('.matrix-mode-tabs .matrix-mode-tab')
            .should('have.length', tabLabels.length)
            .then(($tabs) => {
                const labels = [...$tabs].map((tab) => tab.textContent.trim().replace(/\s+/g, ' '));
                expect(labels).to.deep.equal(tabLabels);
            });
    });

    cy.contains(`${matrixId} .matrix-mode-tab`, 'Donor x Assay')
        .should('have.class', 'active');

    waitForMatrixModeRender(matrixId);
    cy.get(matrixId)
        .should('not.have.class', 'matrix-mode-tissue')
        .and('not.have.class', 'matrix-mode-donor-tissue');
    cy.get(`${matrixId} .matrix-counts-toggle-inline`).should('be.visible');
    cy.get(`${matrixId} .matrix-assay-select`).should('not.exist');
    testDonorAssayFilesCoverageToggle(matrixId);
    getDisplayedMatrixFileCount(matrixId).then((count) => {
        fileCountsByMode.donorAssay = count;
    });

    cy.contains(`${matrixId} .matrix-mode-tab`, 'Tissue x Assay')
        .click({ force: true })
        .should('have.class', 'active');

    waitForMatrixModeRender(matrixId);
    cy.get(matrixId)
        .should('have.class', 'matrix-mode-tissue')
        .and('not.have.class', 'matrix-mode-donor-tissue');
    cy.get(`${matrixId} .matrix-counts-toggle-inline`).should('be.visible');
    cy.get(`${matrixId} .matrix-assay-select`).should('not.exist');
    testTissueAssayFilesDonorsToggle(matrixId);
    getDisplayedMatrixFileCount(matrixId).then((count) => {
        fileCountsByMode.tissueAssay = count;
        expect(
            count,
            'left facet-panel file count should match between Donor x Assay and Tissue x Assay'
        ).to.equal(fileCountsByMode.donorAssay);
    });

    testDonorTissueMode(matrixId);
    getDisplayedMatrixFileCount(matrixId).then((count) => {
        fileCountsByMode.donorTissue = count;
        expect(
            count,
            'left facet-panel file count should match between Donor x Assay and Donor x Tissue'
        ).to.equal(fileCountsByMode.donorAssay);
    });

    cy.contains(`${matrixId} .matrix-mode-tab`, 'Donor x Assay')
        .click({ force: true })
        .should('have.class', 'active');

    waitForMatrixModeRender(matrixId);
    cy.get(matrixId)
        .should('not.have.class', 'matrix-mode-tissue')
        .and('not.have.class', 'matrix-mode-donor-tissue');
    cy.get(`${matrixId} .matrix-counts-toggle-inline`).should('be.visible');
    cy.get(`${matrixId} .matrix-assay-select`).should('not.exist');
    getDisplayedMatrixFileCount(matrixId).then((count) => {
        expect(
            count,
            'left facet-panel file count should be unchanged after switching back to Donor x Assay'
        ).to.equal(fileCountsByMode.donorAssay);
    });
}
