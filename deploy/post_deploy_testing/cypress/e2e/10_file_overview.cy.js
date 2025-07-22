import { cypressVisitHeaders } from "../support";

describe('File Overview - Verify Random 3 Files That are Released, Having QC Metrics', function () {

    before(function () {
        cy.visit('/', { headers: cypressVisitHeaders });

        cy.loginSMaHT({ 'email': 'cypress-main-scientist@cypress.hms.harvard.edu', 'useEnvToken': false })
            .validateUser('SCM');
    });

    it('Verify Random 3 Released Files with QC Metrics', function () {

        cy.visit('/search/?type=File&status=released&quality_metrics%21=No+value&sort=-file_status_tracking.released_date', { headers: cypressVisitHeaders })
            .get('#slow-load-container')
            .should('not.have.class', 'visible')
            .end()
            .get('.facet-charts.loading')
            .should('not.exist')
            .then(() => {

                const TEST_FILE_COUNT = 3;

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

                                // Check Donor ID and Study
                                ['Donor ID', 'Study'].forEach((field) => {
                                    cy.get('.data-card .header-text')
                                        .contains('Sample Information')
                                        .parent()
                                        .siblings('.body')
                                        .find('.datum-title span')
                                        .contains(field)
                                        .parent()
                                        .siblings('.datum-value')
                                        .invoke('text')
                                        .should((value) => {
                                            expect(value).not.to.match(/^\s*$/);
                                            expect(value).not.to.match(/N\/A|^-\s*$/);
                                        });
                                });

                                // Check Experimental Assay, Sequencing Platform, Dataset Target Coverage
                                ['Experimental Assay', 'Sequencing Platform', 'Dataset Target Coverage'].forEach((field) => {
                                    cy.get('.data-card .header-text')
                                        .contains('Data Information')
                                        .parent()
                                        .siblings('.body')
                                        .find('.datum-title span')
                                        .contains(field)
                                        .parent()
                                        .siblings('.datum-value')
                                        .invoke('text')
                                        .should((value) => {
                                            expect(value).not.to.match(/^\s*$/);
                                            expect(value).not.to.match(/N\/A|^-\s*$/);
                                        });
                                });

                                // Get File Size for later modal comparison
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

                                // Check Size and MD5 Checksum fields
                                ['Size', 'MD5 Checksum'].forEach((field) => {
                                    cy.get('.data-card .datum-title span')
                                        .contains(field)
                                        .parent()
                                        .siblings('.datum-value')
                                        .invoke('text')
                                        .should((value) => {
                                            expect(value).not.to.match(/^\s*$/);
                                            expect(value).not.to.match(/N\/A|^-\s*$/);
                                        });
                                });

                                // Check Public Release Date is valid
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

                                // Check default active tab
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

                                // 1. QC Overview Status must have a value
                                cy.get('#file-overview\\.qc-overview .header.top')
                                    .should('contain.text', 'QC Overview Status:')
                                    .within(() => {
                                        cy.get('.badge').invoke('text').should((status) => {
                                            expect(status.trim()).to.not.be.empty;
                                        });
                                    });

                                // 2. Check View Relatedness Chart button params under Critical QC
                                cy.get('#file-overview\\.qc-overview h2.header.mb-2')
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

                                // 3. Check Visualize Quality Metrics button params
                                cy.get('#file-overview\\.qc-overview .header.top')
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
                                cy.get('#file-overview\\.qc-overview h2.header.mb-2')
                                    .contains('General QC')
                                    .parent()
                                    .within(() => {
                                        cy.get('table.qc-overview-tab-table').should('exist');
                                        cy.get('tbody tr').its('length').should('be.gte', 1);
                                    });

                                // --- Download Modal checks start ---
                                cy.get('#download_tsv_multiselect').should('be.visible').and('not.be.disabled').click();

                                cy.get('.modal').should('be.visible').within(() => {
                                    // There should be two radio buttons (by name)
                                    cy.get('input[type="radio"][name="curl"]').should('exist');
                                    cy.get('input[type="radio"][name="aws_cli"]').should('exist');
                                    cy.get('input[type="radio"]').should('have.length', 2);

                                    // By default, cURL tab should be active and cURL command visible
                                    cy.get('button.nav-link.active').should('contain.text', 'cURL');
                                    cy.get('input[type="radio"][name="curl"]').should('be.checked');
                                    cy.get('.tab-pane.active.show').within(() => {
                                        cy.get('.curl-command').should('be.visible');
                                        cy.get('.aws_cli-command').should('not.exist');
                                    });

                                    // Switch to AWS CLI tab
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

                                cy.get('.modal').should('not.exist');

                                // Ensure the modal is closed before proceeding
                                cy.get('.modal').should('not.exist');

                                // Go back to the list page and continue with the next file
                                cy.go('back');
                                cy.get('.search-result-row[data-row-number]', { timeout: 10000 })
                                    .should('have.length.at.least', TEST_FILE_COUNT)
                                    .as('resultRows');

                                cy.then(() => testVisit(index + 1));
                            }); // End of fileAccession.then()
                        }); // End of $a.then()
                } // End of testVisit function

                // Start testing from the first file
                testVisit(0);
            }) // End of .then() after visit/load
            .logoutSMaHT();
    });


});