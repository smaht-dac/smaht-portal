import _ from 'underscore';
import { cypressVisitHeaders } from '../support';
import { navUserAcctDropdownBtnSelector } from '../support/selectorVars';

describe('Deployment/CI Search View Tests', function () {

    before(function () {
        cy.visit('/', { headers: cypressVisitHeaders });
        cy.loginSMaHT({ 'email': 'cypress-main-scientist@cypress.hms.harvard.edu', 'useEnvToken': false }).end()
            .get(navUserAcctDropdownBtnSelector)
            .should('not.contain.text', 'Login')
            .then((accountListItem) => {
                expect(accountListItem.text()).to.contain('SCM');
            }).end();
    });

    after(function () {
        cy.logoutSMaHT();
    });

    context('/search/?type=Item', function () {

        before(function () {
            cy.visit('/search/', { headers: cypressVisitHeaders });
        });

        it('Has at least 50 results for /search/?type=Item', function () {
            cy.location('search').should('include', 'type=Item').end()
                .get('div.search-result-row.loading').should('not.exist').end()
                .get('.search-results-container .search-result-row').then(($searchResultElems) => {
                    expect($searchResultElems.length).to.be.at.least(10);
                }).end()
                .searchPageTotalResultCount().should('be.greaterThan', 50);
        });

        it('Search `File` from dropdown and verify link selection', function () {
            // Type "File" in the search input
            cy.get('.facets-column .facets-container .expandable-list .form-control[type="search"]').type('File');

            // Verify that all facet list elements contain "File"
            cy.get('div.facet.open[data-field="type"] .facet-list-element[data-key]').each(($el) => {
                cy.wrap($el).should('contain.text', 'File'); // Check each element for the text "File"
            });

            // Verify that unwanted results are not visible
            cy.get('.facet-list-element[data-key]').should('not.contain.text', 'NotExpectedResult'); // Ensure unwanted result is absent

            // Click on the "File" link
            cy.get('li[data-key="File"] a').click();

            // Verify the page title contains "File"
            cy.get('#page-title-container .page-title').should('contain', 'File');
        });

        it('Should show/hide columns and ensure correct behavior in the results table', function () {
            cy.get('.above-results-table-row button[data-tip="Configure visible columns"]').click({ force: true }).should('have.class', 'active');
            cy.get('.search-result-config-panel').should('have.class', 'show');
            // since all columns selected, unselect one of them (currently, 3rd one)
            cy.get('.search-result-config-panel .row .column-option:nth-child(4) .checkbox.clickable.is-active')
                .first()
                .scrollIntoView()
                .click()
                .should('have.not.class', 'is-active')
                .find('label input')
                .invoke('val')
                .then((value) => {
                    cy.get(`.search-results-container .search-headers-row div[data-field="${value}"]`)
                        .should('not.exist');

                    cy.get(`.search-result-config-panel .row .checkbox.clickable:not(.is-active) input[value="${value}"]`)
                        .click()
                        .should('not.have.class', 'is-active')
                        .then(() => {
                            cy.get(`.search-results-container .search-headers-row div[data-field="${value}"]`)
                                .should('not.exist');
                        });
                });
            // re-select it
            cy.get('.search-result-config-panel .row .checkbox.clickable:not(.is-active)')
                .first()
                .scrollIntoView()
                .click()
                .should('have.class', 'is-active')
                .find('label input')
                .invoke('val')
                .then((value) => {
                    cy.get(`.search-results-container .search-headers-row div[data-field="${value}"]`)
                        .should('exist')
                        .then(($div) => {
                            expect($div).to.have.attr('data-field', value);
                        });


                    cy.get(`.search-result-config-panel .row .checkbox.clickable.is-active input[value="${value}"]`)
                        .click()
                        .should('not.have.class', 'is-active')
                        .then(() => {
                            cy.get(`.search-results-container .search-headers-row div[data-field="${value}"]`)
                                .should('not.exist');
                        });
                });

            cy.get('.search-result-config-panel .close-button').click({ force: true })
                .get('.search-result-config-panel').should('not.have.class', 'active');
        });

        it('Should redirect to detail view and check if the title matches data-tip', function () {
            cy.visit('/search/?type=File&status=released&data_generation_summary.assays!=No+value', { headers: cypressVisitHeaders });

            cy.get('.results-column .result-table-row div.search-result-column-block[data-field="annotated_filename"] .value a')
                .first()
                .scrollIntoView()
                .then(($element) => {

                    const textContent = $element.text();
                    cy.wrap($element)
                        .invoke('removeAttr', 'target') // we prevent new tab display since cypress not supports multi-tab testing
                        .click({ force: true });

                    cy.get('.file-view-title h1.file-view-title-text')
                        .invoke('text')
                        .then((text) => {
                            expect(text.trim()).to.eq(textContent);
                        });
                });
        });

        it('Should trigger batch files download modal and close it successfully', function () {
            let fileSize;

            cy.get('.datum').each(($el) => {
                if ($el.find('.datum-title').text().trim() === 'Size') {
                    cy.wrap($el).find('.datum-value').invoke('text').then((text) => {
                        fileSize = text.trim();
                    });
                }
            });

            cy.get('#download_tsv_multiselect').click({ force: true })
                .get('div.modal.batch-files-download-modal').should('have.class', 'show');

            cy.get('.tsv-metadata-stat .icon-circle-notch').should('not.exist')
                .get('.tsv-metadata-stat-title').each(($title) => {
                    if ($title.text().trim() === 'Selected Files Size') {
                        cy.wrap($title).next('.tsv-metadata-stat')
                            .invoke('text').then((selectedSize) => {
                                selectedSize = selectedSize.trim();

                                expect(selectedSize).to.equal(fileSize);
                            });
                    }
                });

            cy.get('.modal-header > .btn-close').should('be.visible').click()
                .get('div.modal.batch-files-download-modal').should('not.exist')
        });

        it('Should switch between tabs and apply active class', function () {
            cy.get('.tabs-bar-outer > .tabs-bar > a.tab-item[data-tab-for="details"]')
                .click({ force: true }).should('have.class', 'active').end()
                .get('.tabs-bar-outer > .tabs-bar > a.tab-item[data-tab-for="file-overview"]')
                .click({ force: true }).should('have.class', 'active').end();
        });

        it('Verifies that the data-status of the status indicator dot and status group are equal', function () {
            cy.get('.status-indicator-dot').invoke('data', 'status').then((indicatorStatus) => {
                cy.get('.status-group i.status-indicator-dot').invoke('data', 'status').then((groupStatus) => {
                    expect(indicatorStatus).to.equal(groupStatus);
                });
            });
        });

        it('Checks for the exclamation icon in the tab navigation and verifies its presence in the content if it exists', function () {
            // Check that loading icons do not exist
            cy.get('.benchmarking-layout .icon-circle-notch').should('not.exist');
            cy.get('.search-results-container .icon-circle-notch').should('not.exist');

            cy.document().then((doc) => {
                const iconExists = doc.querySelectorAll('.tab-router .dot-tab-nav-list i.icon-exclamation-triangle').length > 0;

                let dataExists = false;
                const resultCountElem = doc.querySelector('#results-count');
                if (resultCountElem && parseInt(resultCountElem.textContent) > 0) {
                    dataExists = true;
                }

                if (iconExists && dataExists) {
                    cy.get('div.tab-router-contents > div.content i.icon-exclamation-triangle')
                        .should('exist').scrollIntoView().end();

                    cy.get('.search-result-column-block[data-field="tsv_notes"] .btn.btn-link').each(($button) => {
                        cy.wrap($button).click({ force: true })
                            .get('.popover.show').should('exist');

                        cy.wrap($button).click({ force: true })
                            .get('.popover.show').should('not.exist');
                    });
                } else {
                    cy.log('The exclamation icon is not present in the tab navigation list.');
                }
            });
        });

    });

    context('/search/?type=Page', function () {

        before(function () {
            cy.visit('/pages', { headers: cypressVisitHeaders }); // We should get redirected to ?type=Page
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

        it('Should redirect to /search/?type=Page correctly', function () {
            cy.location('search').should('include', 'type=Page').end()
                .location('pathname').should('include', '/search/');
        });

        it('Should have at least 10 results.', function () {
            cy.get('.search-results-container .search-result-row').then(($searchResultElems) => {
                expect($searchResultElems.length).to.be.greaterThan(10);
            });
        });

    });

    context('/search/?type=File', function () {
        before(function () {
            cy.visit('/pages', { headers: cypressVisitHeaders }).end();
            cy.loginSMaHT({ 'email': 'cypress-main-scientist@cypress.hms.harvard.edu', 'useEnvToken': false }).end()
                .get(navUserAcctDropdownBtnSelector)
                .should('not.contain.text', 'Login')
                .then((accountListItem) => {
                    expect(accountListItem.text()).to.contain('SCM');
                }).end();
        });

        it('/files/ should redirect to /search/?type=File', function () {
            cy.visit('/files/', { headers: cypressVisitHeaders }).location('search').should('include', 'type=File').end()
                .location('pathname').should('include', '/search/');
        });

        it('Should have columns for data category, format', function () {
            cy.get('.headers-columns-overflow-container .columns .search-headers-column-block[data-field="data_type"]').contains("Data Type");
            cy.get('.headers-columns-overflow-container .columns .search-headers-column-block[data-field="file_format.display_title"]').contains("Format");
        });
    });

});
