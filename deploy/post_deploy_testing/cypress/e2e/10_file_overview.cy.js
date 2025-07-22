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
            .should('not.exist').then(() => {

                const TEST_FILE_COUNT = 3;

                cy.get('.search-result-row[data-row-number]').as('resultRows');

                // Ensure at least 3 results exist
                cy.get('@resultRows').should('have.length.at.least', TEST_FILE_COUNT);

                // Define a recursive function to step through rows
                function testVisit(index) {
                    // Stop recursion after checking 3 rows
                    if (index >= TEST_FILE_COUNT) return;

                    // Alias the current search result row
                    cy.get('@resultRows').eq(index).as('currentRow');

                    // Get the <a> tag in the "annotated_file_name" field and store its text
                    cy.get('@currentRow')
                        .find('[data-field="annotated_filename"] a')
                        .then(($a) => {
                            // Store the annotated file name from the link text
                            const expectedAnnotatedFileName = $a.text().trim();

                            // Remove target="_blank" so that click stays in same tab
                            cy.wrap($a)
                                .invoke('removeAttr', 'target')
                                .click({ force: true }); // Click the link to visit the detail page

                            // Verify the detail page is loaded
                            cy.get('.file-view-header', { timeout: 10000 }).should('be.visible');

                            // Check that the accession value matches the one we clicked on
                            cy.get('.view-title-text')
                                .should('be.visible')
                                .and('have.text', expectedAnnotatedFileName);

                            // Check that the File Accession value appears in the Annotated Name
                            cy.get('.accession').invoke('text').then((fileAccession) => {
                                cy.get('.data-card .datum-title span')
                                    .contains('Annotated Name')
                                    .parent()
                                    .siblings('.datum-value')
                                    .invoke('text')
                                    .should((annotatedName) => {
                                        expect(annotatedName).to.include(fileAccession);
                                    });
                            });

                            // Check that Size and MD5 Checksum values are valid (not empty, 'N/A' or '-')
                            ['Size', 'MD5 Checksum'].forEach((field) => {
                                cy.get('.data-card .datum-title span')
                                    .contains(field)
                                    .parent()
                                    .siblings('.datum-value')
                                    .invoke('text')
                                    .should((value) => {
                                        expect(value).not.to.match(/^\s*$/);      // not empty
                                        expect(value).not.to.match(/N\/A|^-\s*$/); // not 'N/A' or '-'
                                    });
                            });

                            // Check that there is a valid Public Release Date
                            cy.get('.data-card .datum-title span')
                                .contains('Public Release Date')
                                .parent()
                                .siblings('.datum-value')
                                .find('.localized-date-time')
                                .invoke('text')
                                .should((dateText) => {
                                    expect(dateText).not.to.match(/^\s*$/);      // not empty
                                    expect(dateText).not.to.match(/N\/A|^-\s*$/); // not 'N/A' or '-'
                                });

                            // Check that Donor ID and Study are valid (not empty, 'N/A' or '-')
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
                                        expect(value).not.to.match(/^\s*$/);      // not empty
                                        expect(value).not.to.match(/N\/A|^-\s*$/); // not 'N/A' or '-'
                                    });
                            });

                            // Check that Experimental Assay, Sequencing Platform and Dataset Target Coverage are valid
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
                                        expect(value).not.to.match(/^\s*$/);      // not empty
                                        expect(value).not.to.match(/N\/A|^-\s*$/); // not 'N/A' or '-'
                                    });
                            });

                            // Check that the Download File button is enabled
                            cy.get('#download_tsv_multiselect').should('be.visible').and('not.be.disabled');

                            // List of tab names in order
                            const tabNames = [
                                'Analysis Information',
                                'QC Overview',
                                'Associated Files'
                            ];

                            // By default, the first tab should be active
                            cy.get('.tab-router .dot-tab-nav-list button.active')
                                .should('have.length', 1)
                                .and('contain.text', tabNames[0]);

                            // Loop through each tab except the first (which is already active)
                            for (let i = 1; i < tabNames.length; i++) {
                                // Click the tab by its title
                                cy.get('.tab-router .dot-tab-nav-list .btn-title')
                                    .contains(tabNames[i])
                                    .parents('button')
                                    .click();

                                // After click, check that only the clicked tab is active
                                cy.get('.tab-router .dot-tab-nav-list button.active')
                                    .should('have.length', 1)
                                    .and('contain.text', tabNames[i]);
                            }

                            // Switch to "QC Overview" tab to check its content
                            cy.get('.tab-router .dot-tab-nav-list .btn-title')
                                .contains('QC Overview')
                                .parents('button')
                                .click();

                            // 1. There should be a value for QC Overview Status
                            cy.get('#file-overview\\.qc-overview .header.top')
                                .should('contain.text', 'QC Overview Status:')
                                .within(() => {
                                    cy.get('.badge').invoke('text').should((status) => {
                                        expect(status.trim()).to.not.be.empty;
                                    });
                                });

                            // 2. Under Critical QC, "View Relatedness Chart" button link should have "tab" and "file" query params
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
                                        });
                                });

                            // 3. "Visualize Quality Metrics" button link should have "tab" and "file" query params
                            cy.get('#file-overview\\.qc-overview .header.top')
                                .find('a.btn-primary')
                                .should('exist')
                                .should((a) => {
                                    const url = a[0].getAttribute('href');
                                    expect(url).to.include('tab=');
                                    expect(url).to.include('file=');
                                });

                            // 4. Under General QC, there should be a table with at least one row
                            cy.get('#file-overview\\.qc-overview h2.header.mb-2')
                                .contains('General QC')
                                .parent()
                                .within(() => {
                                    cy.get('table.qc-overview-tab-table').should('exist');
                                    cy.get('tbody tr').its('length').should('be.gte', 1);
                                });
                        });

                    // Go back to the list page
                    cy.go('back');

                    // Wait for the list page to reload and ensure it has rows again
                    cy.get('.search-result-row[data-row-number]', { timeout: 10000 })
                        .should('have.length.at.least', TEST_FILE_COUNT)
                        .as('resultRows'); // Re-alias since DOM was reloaded

                    // Continue with the next row
                    cy.then(() => testVisit(index + 1));
                }

                // Start the recursive check
                testVisit(0);
            })
            .logoutSMaHT();
    });

});