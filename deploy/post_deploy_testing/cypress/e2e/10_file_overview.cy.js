// cypress/e2e/file_overview_by_role.cy.js
import { cypressVisitHeaders, ROLE_TYPES } from "../support";

/* ----------------------------- ROLE MATRIX -----------------------------
   Toggle which roles run this suite. Adjust per your access model.

   - runOutputFilesWithQC: visit OutputFiles (with QC) and validate 3 items end-to-end.
   - runAccessForbiddenStatusCheck: verify that files with specific statuses are not accessible (404) for the role.
------------------------------------------------------------------------- */
const ROLE_MATRIX = {
    UNAUTH: {
        label: "Unauthenticated",
        isAuthenticated: false,
        runOutputFilesWithQC: true,
        runAccessForbiddenStatusCheck: true,

        expectedCanDownloadFile: false,
        expectedCanDownloadProtectedFile: false,
        expectedQCOverviewTabVisible: false,
        expectedShouldNotVisibleStatus: ["open-early", "open-network", "protected-early", "protected-network", "in review"],
    },

    [ROLE_TYPES.SMAHT_DBGAP]: {
        label: "SMAHT_DBGAP",
        isAuthenticated: true,
        runOutputFilesWithQC: true,
        runAccessForbiddenStatusCheck: false,

        expectedCanDownloadFile: true,
        expectedCanDownloadProtectedFile: true,
        expectedQCOverviewTabVisible: true,
        expectedShouldNotVisibleStatus: ["in review"],
    },

    [ROLE_TYPES.SMAHT_NON_DBGAP]: {
        label: "SMAHT_NON_DBGAP",
        isAuthenticated: true,
        runOutputFilesWithQC: true,
        runAccessForbiddenStatusCheck: true,

        expectedCanDownloadFile: true,
        expectedCanDownloadProtectedFile: false,
        expectedQCOverviewTabVisible: false,
        expectedShouldNotVisibleStatus: ["protected-early", "protected-network", "in review"],
    },

    [ROLE_TYPES.PUBLIC_DBGAP]: {
        label: "PUBLIC_DBGAP",
        isAuthenticated: true,
        runOutputFilesWithQC: true,
        runAccessForbiddenStatusCheck: true,

        expectedCanDownloadFile: true,
        expectedCanDownloadProtectedFile: true,
        expectedQCOverviewTabVisible: true,
        expectedShouldNotVisibleStatus: ["open-early", "open-network", "protected-early", "protected-network", "in review"],
    },

    [ROLE_TYPES.PUBLIC_NON_DBGAP]: {
        label: "PUBLIC_NON_DBGAP",
        isAuthenticated: true,
        runOutputFilesWithQC: true,
        runAccessForbiddenStatusCheck: true,

        expectedCanDownloadFile: true,
        expectedCanDownloadProtectedFile: false,
        expectedQCOverviewTabVisible: false,
        expectedShouldNotVisibleStatus: ["open-early", "open-network", "protected-early", "protected-network", "in review"],
    },
};

/* ----------------------------- SESSION HELPERS ----------------------------- */

function goto(url = "/", headers = cypressVisitHeaders) {
    cy.visit(url, { headers });
}

function loginIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) cy.loginSMaHT(roleKey).end();
}

function logoutIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) cy.logoutSMaHT();
}

/* ----------------------------- STEP HELPERS ----------------------------- */

/** Verify Random 3 Open Files with QC Metrics */
function stepOutputFilesWithQC(caps) {
    const TEST_FILE_COUNT = 3;

    cy.visit(
        "/search/?type=OutputFile&donors.external_id%21=No+value&quality_metrics%21=No+value&sample_summary.studies%21=No+value&sort=-file_status_tracking.released",
        { headers: cypressVisitHeaders }
    )
        .get("#slow-load-container")
        .should("not.have.class", "visible")
        .end()
        .get(".facet-charts.loading")
        .should("not.exist")
        .then(() => {
            cy.get('.search-result-row[data-row-number]').as('resultRows');

            // Ensure there are at least 3 results
            cy.get('@resultRows').should('have.length.at.least', TEST_FILE_COUNT);

            function testVisit(index) {
                if (index >= TEST_FILE_COUNT) return;

                // Alias the current row
                cy.get('@resultRows').eq(index).as('currentRow');

                // Find and click the annotated file link
                cy.get('@currentRow')
                    .find('[data-field="annotated_filename"] a')
                    .then(($a) => {
                        const expectedAnnotatedFileName = $a.text().trim();

                        // Remove target to open in same tab and click
                        cy.wrap($a)
                            .invoke('removeAttr', 'target')
                            .click({ force: true });

                        // Ensure the file detail page is loaded
                        cy.get('.file-view-header', { timeout: 10000 }).should('be.visible');

                        // Check the detail page title
                        cy.get('.view-title-text')
                            .should('be.visible')
                            .and('have.text', expectedAnnotatedFileName);

                        // Get File Accession and do further checks
                        cy.get('.accession').invoke('text').then((fileAccession) => {

                            /**
                            * Reusable helper to verify that specific field values within a data-card section
                            * are not empty and, optionally, not equal to 'N/A' or '-'.
                            *
                            * @param {string} sectionTitle - The header text of the section to check.
                            * @param {Array<string>} fieldNames - The list of field labels to validate.
                            * @param {Array<string>} [allowNAFields=[]] - Fields allowed to contain 'N/A' or '-'.
                            */
                            function checkFields(sectionTitle, fieldNames, allowNAFields = []) {
                                cy.get('.data-card .header-text')
                                    .contains(sectionTitle)
                                    .parent()
                                    .siblings('.body')
                                    .within(() => {
                                        fieldNames.forEach((field) => {
                                            cy.get('.datum-title span')
                                                .contains(field)
                                                .parent()
                                                .siblings('.datum-value')
                                                .invoke('text')
                                                .should((value) => {
                                                    // Always expect a non-empty value
                                                    expect(value).not.to.match(/^\s*$/);

                                                    // Disallow 'N/A' or '-' unless this field is explicitly allowed
                                                    if (!allowNAFields.includes(field)) {
                                                        expect(value).not.to.match(/N\/A|^-\s*$/);
                                                    }
                                                });
                                        });
                                    });
                            }

                            // Sample Information: these fields must always have valid values
                            checkFields('Sample Information', ['Donor ID', 'Study']);

                            // Data Information: some fields (like Genome Coverage) may occasionally be 'N/A'
                            checkFields(
                                'Data Information',
                                ['Experimental Assay', 'Sequencing Platform', 'Genome Coverage', 'Target Genome Coverage'],
                                ['Genome Coverage', 'Target Genome Coverage'] // allowed to contain 'N/A'
                            );

                            // File Properties: extract the "Size" and "Accession" value for later comparison in modal validation
                            cy.get('.data-card .header-text')
                                .contains('File Properties')
                                .parent()
                                .siblings('.body')
                                .find('.datum-title span')
                                .contains('Size')
                                .parent()
                                .siblings('.datum-value')
                                .invoke('text')
                                .as('fileSize');

                            // File Properties: ensure both fields have valid values
                            checkFields('File Properties', ['Access','Size', 'MD5 Checksum']);

                            // fileSize must be in KB, MB, GB or TB format
                            cy.get('@fileSize').should((sizeText) => {
                                expect(sizeText).to.match(/^\d+(\.\d+)?\s*(KB|MB|GB|TB)$/i);
                            });

                            cy.get('.datum-value .file-status')
                                .then(($el) => {
                                    const textNode = [...$el[0].childNodes]
                                        .find((node) => node.nodeType === Node.TEXT_NODE)
                                        ?.textContent.trim();
                                    cy.wrap(textNode).as('status');
                                });

                            // Public Release Date: must always contain a valid date (not empty or 'N/A')
                            cy.get('.data-card .datum-title span')
                                .contains('Public Release Date')
                                .parent()
                                .siblings('.datum-value')
                                .find('.localized-date-time')
                                .invoke('text')
                                .should((dateText) => {
                                    expect(dateText).not.to.match(/^\s*$/);
                                    expect(dateText).not.to.match(/N\/A|^-\s*$/);
                                });


                            // Tab navigation checks
                            const tabNames = [
                                'Analysis Information',
                                'QC Overview',
                                'Associated Files'
                            ];

                            // Default active tab
                            cy.get('.tab-router .dot-tab-nav-list button.active')
                                .should('have.length', 1)
                                .and('contain.text', tabNames[0]);

                            // Switch and check other tabs
                            for (let i = 1; i < tabNames.length; i++) {
                                cy.get('.tab-router .dot-tab-nav-list .btn-title')
                                    .contains(tabNames[i])
                                    .parents('button')
                                    .click();
                                cy.get('.tab-router .dot-tab-nav-list button.active')
                                    .should('have.length', 1)
                                    .and('contain.text', tabNames[i]);
                            }

                            // Go to QC Overview tab for QC checks
                            cy.get('.tab-router .dot-tab-nav-list .btn-title')
                                .contains('QC Overview')
                                .parents('button')
                                .click();

                            if (caps.expectedQCOverviewTabVisible === true) {
                                // 1. QC Overview Status must have a value
                                cy.get('#file-overview .qc-overview-tab .header.top')
                                    .should('contain.text', 'QC Overview Status:')
                                    .within(() => {
                                        cy.get('.badge').invoke('text').should((status) => {
                                            expect(status.trim()).to.not.be.empty;
                                        });
                                    });

                                // 2. "View Relatedness Chart" button params under Critical QC
                                cy.get('#file-overview .qc-overview-tab h2.header.mb-2')
                                    .contains('Critical QC')
                                    .parent()
                                    .within(() => {
                                        cy.get('a.btn-outline-secondary')
                                            .should('exist')
                                            .should((a) => {
                                                const url = a[0].getAttribute('href');
                                                expect(url).to.include('tab=');
                                                expect(url).to.include('file=');
                                                const match = url.match(/[?&]file=([^&]+)/);
                                                expect(match, 'file param should exist').to.not.be.null;
                                                const fileParamValue = decodeURIComponent(match[1]);
                                                expect(fileParamValue).to.equal(fileAccession);
                                            });
                                    });

                                // 3. "Visualize Quality Metrics" button params
                                cy.get('#file-overview .qc-overview-tab .header.top')
                                    .find('a.btn-primary')
                                    .should('exist')
                                    .should((a) => {
                                        const url = a[0].getAttribute('href');
                                        expect(url).to.include('tab=');
                                        expect(url).to.include('file=');
                                        const match = url.match(/[?&]file=([^&]+)/);
                                        expect(match, 'file param should exist').to.not.be.null;
                                        const fileParamValue = decodeURIComponent(match[1]);
                                        expect(fileParamValue).to.equal(fileAccession);
                                    });

                                // 4. General QC table must have at least one row
                                cy.get('#file-overview .qc-overview-tab h2.header.mb-2')
                                    .contains('General QC')
                                    .parent()
                                    .within(() => {
                                        cy.get('table.qc-overview-tab-table').should('exist');
                                        cy.get('tbody tr').its('length').should('be.gte', 1);
                                    });
                            } else {
                                // QC Overview tab is visible but shows Protected Data message
                                cy.get('#file-overview #file-overview\\.qc-overview').should('exist').within(() => {
                                    cy.get('.protected-data h4').should('be.visible').and('contain.text', 'Protected Data');
                                });
                            }

                            if (caps.expectedCanDownloadFile === true) {

                                cy.get('@status').then((status) => {

                                    if (status.toLowerCase().includes('protected') && !caps.expectedCanDownloadProtectedFile) {
                                        // Protected file download not expected to be allowed
                                        cy.get('.download-button.btn.btn-primary[disabled]').then(($disabledButton) => {
                                            cy.wrap($disabledButton)
                                                .trigger('mouseover', { force: true }); // Trigger a hover event
                                            cy.get('.popover.download-popover').should('be.visible');
                                            cy.wrap($disabledButton).trigger('mouseout', { force: true });
                                            cy.get('.popover.download-popover').should('not.exist');
                                        });
                                    } else {
                                        // --- Download Modal checks ---
                                        cy.get('#download_tsv_multiselect')
                                            .should('be.visible')
                                            .and('not.be.disabled')
                                            .click();

                                        cy.get('.modal').should('be.visible').within(() => {
                                            // Two radio buttons exist
                                            cy.get('input[type="radio"][name="curl"]').should('exist');
                                            cy.get('input[type="radio"][name="aws_cli"]').should('exist');
                                            cy.get('input[type="radio"]').should('have.length', 2);

                                            // Default: cURL active
                                            cy.get('button.nav-link.active').should('contain.text', 'cURL');
                                            cy.get('input[type="radio"][name="curl"]').should('be.checked');
                                            cy.get('.tab-pane.active.show').within(() => {
                                                cy.get('.curl-command').should('be.visible');
                                                cy.get('.aws_cli-command').should('not.exist');
                                            });

                                            // Switch to AWS CLI
                                            cy.get('button.nav-link').contains('AWS CLI').click();
                                            cy.get('button.nav-link.active').should('contain.text', 'AWS CLI');
                                            cy.get('input[type="radio"][name="aws_cli"]').should('be.checked');
                                            cy.get('.tab-pane.active.show').within(() => {
                                                cy.get('.aws_cli-command').should('be.visible');
                                                cy.get('.curl-command').should('not.exist');
                                            });

                                            // Download button text reflects selection
                                            cy.get('button').contains(/Download AWS CLI File Manifest/i).should('be.visible');
                                            cy.get('button.nav-link').contains('cURL').click();
                                            cy.get('button.nav-link.active').should('contain.text', 'cURL');
                                            cy.get('input[type="radio"][name="curl"]').should('be.checked');
                                            cy.get('button').contains(/Download cURL File Manifest/i).should('be.visible');

                                            // Additional metadata buttons
                                            cy.contains('Download Additional Metadata Files')
                                                .parent()
                                                .within(() => {
                                                    ['Biosample', 'Analyte', 'Sequencing'].forEach((type) => {
                                                        cy.get('button')
                                                            .contains(type)
                                                            .should('be.visible')
                                                            .and('not.be.disabled');
                                                    });
                                                });

                                            // Close modal
                                            cy.get('.btn-close, [aria-label="Close"], button:contains("Close")').first().click({ force: true });
                                        });
                                        cy.get('.modal').should('not.exist');
                                    }
                                });
                            } else if (caps.expectedCanDownloadFile === "disabled") {
                                // Handle the case where the download button is disabled
                                cy.get('.download-button.btn.btn-primary[disabled]').then(($disabledButton) => {
                                    cy.wrap($disabledButton)
                                        .trigger('mouseover', { force: true }); // Trigger a hover event
                                    cy.get('.popover.download-popover').should('be.visible');
                                    cy.wrap($disabledButton).trigger('mouseout', { force: true });
                                    cy.get('.popover.download-popover').should('not.exist');
                                });
                            }

                            // Back to the list and continue
                            cy.go('back');
                            cy.get('.search-result-row[data-row-number]', { timeout: 10000 })
                                .should('have.length.at.least', TEST_FILE_COUNT)
                                .as('resultRows');

                            cy.then(() => testVisit(index + 1));
                        }); // accession then
                    }); // anchor then
            } // testVisit

            // Kick off the loop
            testVisit(0);
        });
}

// Verify user should not list any files having status in expectedShouldNotVisibleStatus array and get 404 code in /search page
function stepAccessForbiddenStatusCheck(caps) {
    // override caps.expectedShouldNotVisibleStatus for devtest has still "released" files that need to be replaced with "open-network"
    const baseUrl = Cypress.config().baseUrl || "";
    const clonedStatus = [...caps.expectedShouldNotVisibleStatus];
    if (baseUrl.includes("devtest.smaht.org") && caps.expectedShouldNotVisibleStatus.includes("open-network")) {
        clonedStatus.push("released");
    }

    const params = clonedStatus.map((status) => `status=${encodeURIComponent(status)}`).join('&');
    cy.request({
        url: `/search/?type=File&${params}`,
        headers: cypressVisitHeaders,
        failOnStatusCode: false,
    }).then((response) => {
        expect(response.status).to.eq(404);
    });
}

/* ----------------------------- PARAMETERIZED SUITE ----------------------------- */

const ROLES_TO_TEST = [
    "UNAUTH",
    ROLE_TYPES.SMAHT_DBGAP,
    ROLE_TYPES.SMAHT_NON_DBGAP,
    ROLE_TYPES.PUBLIC_DBGAP,
    ROLE_TYPES.PUBLIC_NON_DBGAP,
];

describe("File Overview by role — 3 released files with QC", () => {
    ROLES_TO_TEST.forEach((roleKey) => {
        const caps = ROLE_MATRIX[roleKey];
        const label = caps.label || String(roleKey);

        context(`${label} → released files with QC`, () => {
            before(() => {
                goto("/");
                loginIfNeeded(roleKey);
            });

            after(() => {
                logoutIfNeeded(roleKey);
            });

            it(`verifies random 3 released files with QC (enabled: ${caps.runOutputFilesWithQC})`, () => {
                if (!caps.runOutputFilesWithQC) return;
                stepOutputFilesWithQC(caps);
            });

            it(`verifies access forbidden for specific file statuses (enabled: ${caps.runAccessForbiddenStatusCheck})`, () => {
                if (!caps.runAccessForbiddenStatusCheck) return;
                stepAccessForbiddenStatusCheck(caps);
            });
        });
    });
});
