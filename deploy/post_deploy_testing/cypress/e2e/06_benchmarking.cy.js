import { cypressVisitHeaders } from "../support";

const dataNavBarItemSelectorStr = '#top-nav div.navbar-collapse .navbar-nav a.id-data-menu-item';

let selectedCheckFileNumberCount = 0;
let allResultTotalCount = 0;

// Checkbox selection and deselection helper functions
function checkFileCheckbox($checkBox) {
    selectedCheckFileNumberCount += 1;
    return cy.wrap($checkBox).scrollToCenterElement().check({ force: true }).end();
}

function unCheckFileCheckbox($checkBox) {
    selectedCheckFileNumberCount -= 1;
    if (selectedCheckFileNumberCount >= 0) {
        return cy.wrap($checkBox).scrollToCenterElement().uncheck({ force: true }).end();
    }
}

// Helper function for escaping CSS selectors with numeric starting IDs
const escapeElementWithNumericId = (selector) => {
    return /^#\d/.test(selector) ? `[id="${selector.substring(1)}"]` : selector;
};

// Helper function to switch tabs and check the command content
function verifyTabContent(tabKey, expectedText) {
    cy.get(`div.code-snippet-container > ul.nav-pills > li.nav-item > button.nav-link[data-rr-ui-event-key="${tabKey}"]`)
        .click()
        .should('have.class', 'active');

    cy.get('.code-snippet-container > div.tab-content > div.tab-pane.active.show > div.curl-command-wrapper > pre')
        .invoke('text')
        .then((text) => {
            expect(text).to.include(expectedText);
        });
}

describe('Benchmarking Layout Test', function () {

    before(function () {
        cy.visit('/', { headers: cypressVisitHeaders });
        cy.loginSMaHT({ email: 'cypress-main-scientist@cypress.hms.harvard.edu', useEnvToken: false })
            .validateUser('SCM')
            .end();
    });

    after(function () {
        cy.logoutSMaHT();
    });

    context('Navigation and Page Redirection', function () {
        it('Click & visit benchmarking pages from menu, ensure relevant tab is activated and works.', function () {
            cy.get(dataNavBarItemSelectorStr).should('have.class', 'dropdown-toggle').click()
                .should('have.class', 'dropdown-open-for')
                .then(() => {
                    cy.get('.big-dropdown-menu .no-level-2-children .custom-static-links > div.col-12:nth-child(2) a.primary-big-link').should('be.visible').then(($listItems) => {
                        expect($listItems).to.have.length(3); // Ensuring 3 benchmarking pages in dropdown
                        const allLinkElementHREFs = Cypress._.map($listItems, (liEl) => {
                            const path = new URL(liEl.href, window.location.origin).pathname;
                            return path;
                        }).reverse();

                        let prevTitle = '';
                        let count = 0;

                        function testVisit() {
                            cy.get('#page-title-container .page-title').should('not.have.text', prevTitle)
                                .then((t) => {
                                    const titleText = t.text();
                                    prevTitle = titleText;

                                    cy.title().should('equal', `${titleText} – SMaHT Data Portal`).end();

                                    Cypress.log({ name: 'Page Title', message: titleText });
                                    // Since COLO829 SNV/Indel Detection Challenge has a different layout, we need to handle it differently
                                    if (titleText !== 'COLO829 SNV/Indel Detection Challenge') {
                                        //This tests a toggle button that collapses and expands.
                                        cy.get('.benchmarking-layout .information-container button.toggle-information-text-button')
                                            .click({ force: true })
                                            .should('have.attr', 'aria-expanded', 'false')
                                            .get('#benchmarking-page-description-container').should('have.class', 'collapsed').end()
                                            .get('.benchmarking-layout .information-container button.toggle-information-text-button')
                                            .click({ force: true })
                                            .should('have.attr', 'aria-expanded', 'true')
                                            .get('#benchmarking-page-description-container').should('have.class', 'expanded').end();

                                        // Navigate through each tab and check if it has the active class
                                        cy.location('pathname').then((currentPath) => {
                                            // Iterate through all tabs
                                            cy.get('div.benchmarking-layout ul.nav-tabs li.nav-item button.nav-link').each(($button) => {
                                                const eventKey = $button.attr('data-rr-ui-event-key');
                                                const fullPath = `${currentPath}${eventKey}`;

                                                cy.wrap($button).click({ force: true })
                                                    .should('have.class', 'active');

                                                // Wait for the spinner to disappear before checking results count
                                                cy.get('.tab-pane.active .search-results-outer-container').should('have.attr', 'data-context-loading', 'false').end();

                                                // Ensure the active link in the sidebar matches the tab's path
                                                cy.get('.sliding-sidebar-nav-container .accordion .sidenav-link.active a').should(($activeLink) => {
                                                    const hrefValue = $activeLink.attr('href');
                                                    expect(hrefValue).to.equal(fullPath);
                                                });

                                                // Now check the results count after the spinner is gone
                                                cy.get('.tab-pane.active.show #results-count')
                                                    .invoke('text')
                                                    .should('not.equal', '0')
                                                    .then((originalFileText) => {
                                                        cy.wrap($button)
                                                            .find('.badge')
                                                            .invoke('text')
                                                            .then((badgeText) => {
                                                                expect(badgeText.trim()).to.equal(originalFileText.trim());
                                                            });
                                                    });
                                            }).then(() => {
                                                Cypress.log({
                                                    name: "Tab Navigation Completed",
                                                    message: "All tabs navigated and verified successfully."
                                                });
                                            });

                                        });
                                    } else {
                                        cy
                                            .get('.search-results-container.fully-loaded')
                                            .should('be.visible').end()
                                            .get('.search-results-container .search-result-row .search-result-column-block input[type="checkbox"]')
                                            .should('have.length.greaterThan', 0);
                                    }

                                    count++;
                                    if (count < $listItems.length) {
                                        cy.get(dataNavBarItemSelectorStr).click().should('have.class', 'dropdown-open-for').then(() => {
                                            cy.get(`div.big-dropdown-menu a[href="${escapeElementWithNumericId(allLinkElementHREFs[count])}"]`).click({ force: true })
                                                .then(($nextListItem) => {
                                                    const linkHref = $nextListItem.attr('href');
                                                    cy.location('pathname').should('equal', linkHref);
                                                    testVisit();
                                                });
                                        });
                                    }
                                });
                        }

                        cy.wrap($listItems.last()).scrollIntoView().should('be.visible').click({ force: true }).then(($linkElem) => {
                            const linkHref = $linkElem.attr('href');
                            cy.location('pathname').should('equal', linkHref);
                            testVisit();
                        });
                    });
                }).end();
        });

        it('Tests the collapsing and expanding of the toggle button.', function () {
            cy.get('.sliding-sidebar-nav-container .toggle-button')
                .click({ force: true })
                .should('have.attr', 'aria-expanded', 'false')
                .get('.sliding-sidebar-ui-container').should('have.class', 'collapse-nav').end()
                .get('.sliding-sidebar-nav-container .toggle-button')
                .click({ force: true })
                .should('have.attr', 'aria-expanded', 'true')
                .get('.sliding-sidebar-ui-container').should('have.class', 'show-nav').end();
        });
    });

    context('File Selection and Download Validation', function () {
        before(function () {
            cy.visit('/data/benchmarking/COLO829', { headers: cypressVisitHeaders });
        });

        it('Should check all checkboxes', () => {
            cy.get('#page-title-container .page-title').should('have.text', 'COLO829').end()
                .get('.search-results-container .search-result-row .search-result-column-block input[type="checkbox"]').each(($checkBox) => {
                    checkFileCheckbox($checkBox).end();
                });
        });

        it('Should match selected files count with the displayed count', () => {
            cy.get('#download_tsv_multiselect').then(($selectedIndexCount) => {
                const selectedFileText = $selectedIndexCount.text();
                const selectedFileCount = parseInt(selectedFileText.match(/\d+/)[0]);
                expect(selectedCheckFileNumberCount).to.equal(selectedFileCount);
            });
        });

        it('Should click download and validate selected files metadata', () => {
            cy.get('#download_tsv_multiselect').click({ force: true });
            cy.get('.tsv-metadata-stat-title').contains('Selected Files')
                .siblings('.tsv-metadata-stat')
                .invoke('text')
                .then((text) => {
                    expect(selectedCheckFileNumberCount).to.equal(parseInt(text));
                });

            // Use the helper function to test each tab
            verifyTabContent('curl', 'curl');
            verifyTabContent('aws', 'AWS_ACCESS_KEY_ID');

            cy.get('.modal-header > .btn-close').click({ force: true }).end();
        });

        it('Should uncheck all checkboxes', () => {
            cy.get('.search-results-container .search-result-row .search-result-column-block input[type="checkbox"]').each(($checkBox) => {
                unCheckFileCheckbox($checkBox);
            });
        });

        it('Should validate original total results count', () => {
            cy.get('#results-count').then(($origTotalResults) => {
                const originalFileText = $origTotalResults.text();
                allResultTotalCount = parseInt(originalFileText.match(/\d+/)[0]);

                cy.get('#select-all-files-button').click({ force: true }).end()
                    .get('#select-all-files-button i.icon-circle-notch').should('not.exist').end();
                cy.get('#download_tsv_multiselect').invoke('text').then((text) => {
                    const selectedFile = parseInt(text.match(/\d+/)[0]);
                    expect(allResultTotalCount).to.equal(selectedFile);
                });

                cy.get('#select-all-files-button').click({ force: true }).end()
                    .get('#select-all-files-button i.icon-circle-notch').should('not.exist').end();
                cy.get('#download_tsv_multiselect').invoke('text').then((text) => {
                    const selectedFile = parseInt(text.match(/\d+/)[0]);
                    expect(selectedFile).to.equal(0);
                });
            });
        });
    });

    context('Facet Interaction and Filtering Validation', function () {
        before(function () {
            cy.visit('/data/benchmarking/COLO829', { headers: cypressVisitHeaders });
        });

        it('Verify Column Sorting Icon Transitions', function () {
            cy.get('div.search-headers-column-block[data-column-key="annotated_filename"] .column-sort-icon > i.icon-sort-down')
                .scrollIntoView()
                .click({ force: true })
                .then(($icon) => {
                    cy.wrap($icon).should('not.have.class', 'icon-circle-notch');
                })
                .click({ force: true })
                .then(($icon) => {
                    cy.wrap($icon).should('not.have.class', 'icon-circle-notch');
                })
                .then(() => {
                    cy.get('div.search-headers-column-block[data-column-key="annotated_filename"] .column-sort-icon > i')
                        .should('have.class', 'icon-sort-up');
                });
        });

        it('Switch between included and excluded properties in facets, exclude a term', function () {
            let externalDataCount, initialDataCount, includeDataCount;

            // Handle specific uncaught exceptions
            cy.get('#slow-load-container').should('not.have.class', 'visible').end()
                .get('.benchmarking-layout .icon-circle-notch').should('not.exist').end()
                .get('.search-results-container .icon-circle-notch').should('not.exist').end();

            // Capture initial data count from results
            cy.get('.tab-pane.active.show #results-count').invoke('text').then((count) => {
                initialDataCount = parseInt(count);
                expect(initialDataCount).to.be.greaterThan(0);
            }).end();

            // Toggle to "Excluded Properties"
            cy.get(".facets-header .facets-title").should('have.text', 'Included Properties')
                .scrollToCenterElement().end()
                .get(".facets-header button").first().click({ force: true }).end()
                .get(".facets-header .facets-title").should('have.text', 'Excluded Properties').end()
                .get('.facet.closed[data-field="file_sets.libraries.assay.display_title"] > h5').scrollIntoView().should('be.visible').click().end()
                .get('.facet[data-field="file_sets.libraries.assay.display_title"] .facet-list-element:not([data-is-grouping="true"]) a').first().within(($term) => {
                    cy.get('span.facet-count').then((assayCount) => {
                        externalDataCount = parseInt(assayCount.text());
                        expect(externalDataCount).to.be.greaterThan(0);
                    }).end();

                    cy.wrap($term)
                        .scrollIntoView()
                        .should('be.visible')
                        .click({ force: true }).end();
                }).end();

            // Verify count after exclusion
            cy.get('.facets-container').should('have.attr', 'data-context-loading', 'false').end()
                .get('.tab-pane.active.show #results-count').invoke('text').then((nextCounts1) => {
                    expect(parseInt(nextCounts1)).to.equal(initialDataCount - externalDataCount);
                });

            // Toggle back to "Included Properties"
            cy.get(".facets-header button").first().click({ force: true }).end()
                .get(".facets-header .facets-title").should('have.text', 'Included Properties').end();

            // Re-include the first term
            cy.get('.facet[data-field="file_sets.libraries.assay.display_title"] .persistent .facet-list-element:not([data-is-grouping="true"]) a').first().within(($term) => {
                cy.wrap($term).click({ force: true }).end();
            }).end();

            // Verify initial count after re-inclusion
            cy.get('.facets-container').should('have.attr', 'data-context-loading', 'false').end()
                .get('.tab-pane.active.show #results-count').invoke('text').then((nextCounts2) => {
                    expect(initialDataCount).to.equal(parseInt(nextCounts2));
                }).end();

            // Exclude the term again and verify external count
            cy.get('.facet[data-field="file_sets.libraries.assay.display_title"] .facet-list-element:not([data-is-grouping="true"]) a').first().within(($term) => {
                cy.wrap($term).click({ force: true }).end();
            }).end();

            // Verify included count matches the external data count
            cy.get('.facets-container').should('have.attr', 'data-context-loading', 'false').end()
                .get('.tab-pane.active.show #results-count').invoke('text').then((nextCounts3) => {
                    includeDataCount = parseInt(nextCounts3);
                    expect(includeDataCount).to.equal(externalDataCount);
                }).end();

            // Ensure result count matches initial data count after clearing filters
            cy.get('.properties-controls button[data-tip="Clear all filters"]').click({ force: true }).end();

            cy.get('.facets-container').should('have.attr', 'data-context-loading', 'false').end()
                .get('.tab-pane.active.show #results-count').invoke('text').then((nextCounts4) => {
                    expect(initialDataCount).to.equal(parseInt(nextCounts4));
                }).end();
        });
    });

    context('Embedded Search Container Functionality', function () {
        it('Should collapse all facets', function () {
            cy.get('#slow-load-container').should('not.have.class', 'visible').end()
                .get('.benchmarking-layout .icon-circle-notch').should('not.exist').end()
                .get('.search-results-container .icon-circle-notch').should('not.exist').end()
                .get('.properties-controls button[data-tip="Collapse all facets below"]').click({ force: true }).end()
                .get('.facets-column .facets-body .facet').should('not.have.class', 'open').end();
        });

        it('Can press buttons at right & left to scroll to right side of search results table', function () {
            cy.get('#content div.shadow-border-layer div.edge-scroll-button.right-edge:not(.faded-out)').scrollIntoView()
                .trigger('mousedown', { 'button': 0, 'force': true })
                .should('have.class', 'faded-out') // Scroll until scrolling further is disabled.
                .trigger('mouseup', { 'force': true }) // Might become invisible
                .wait(1000) // Wait for state changes re: layouting to take effect, since trigger not supports chaining
                .end()
                .get('#content div.shadow-border-layer div.edge-scroll-button.left-edge:not(.faded-out)')
                .trigger('mousedown', { 'button': 0, 'force': true })
                .should('have.class', 'faded-out')
                .trigger('mouseup', { 'force': true })
                .end();
        });
    });
});
