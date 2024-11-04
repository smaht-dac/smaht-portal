import { cypressVisitHeaders } from "../support";
import { navUserAcctDropdownBtnSelector } from "../support/selectorVars";

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

describe('Benchmarking Layout Test', function () {

    context('Navigation and Redirection', function () {
        before(function () {
            cy.visit('/', { headers: cypressVisitHeaders });
            cy.loginSMaHT({ email: 'cypress-main-scientist@cypress.hms.harvard.edu', useEnvToken: false }).end()
                .get(navUserAcctDropdownBtnSelector)
                .should('not.contain.text', 'Login')
                .then((accountListItem) => {
                    expect(accountListItem.text()).to.contain('SCM');
                }).end();
        });

        after(function () {
            cy.logoutSMaHT();
        });

        it('Click & visit each page from menu, ensure ToC exists and works.', function () {
            cy.get(dataNavBarItemSelectorStr).should('have.class', 'dropdown-toggle').click()
                .should('have.class', 'dropdown-open-for')
                .then(() => {
                    cy.get('div.big-dropdown-menu div.help-menu-tree:first-child a.level-3-title').then(($listItems) => {
                        expect($listItems).to.have.length.above(6); // Ensuring at least 6 benchmarking pages in dropdown
                        const allLinkElementIDs = Cypress._.map($listItems, (liEl) => liEl.id);

                        let prevTitle = '';
                        let count = 0;

                        function testVisit() {
                            cy.get('#page-title-container .page-title').should('not.have.text', prevTitle)
                                .then((t) => {
                                    const titleText = t.text();
                                    prevTitle = titleText;

                                    cy.title().should('equal', `${titleText} – SMaHT Data Portal`).end();

                                    //This tests a toggle button that collapses and expands.
                                    cy.get('.benchmarking-layout-container .information-container button.toggle-information-text-button')
                                        .click({ force: true })
                                        .should('have.attr', 'aria-expanded', 'false')
                                        .get('#benchmarking-page-description-container').should('have.class', 'collapsed').end()
                                        .get('.benchmarking-layout-container .information-container button.toggle-information-text-button')
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
                                            cy.get('.search-results-container i.icon-spin').should('not.exist');

                                            // Ensure the active link in the sidebar matches the tab's path
                                            cy.get('.benchmarking-nav-container .accordion .sidenav-link.active a').should(($activeLink) => {
                                                const hrefValue = $activeLink.attr('href');
                                                expect(hrefValue).to.equal(fullPath);
                                            });

                                            // Now check the results count after the spinner is gone
                                            cy.get('.tab-pane.active.show #results-count').invoke('text').then((originalFileText) => {
                                                cy.wrap($button).find('.badge').invoke('text').then((badgeText) => {
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

                                    count++;
                                    if (count < $listItems.length) {
                                        cy.get(dataNavBarItemSelectorStr).click().should('have.class', 'dropdown-open-for').then(() => {
                                            cy.get(`div.big-dropdown-menu a#${escapeElementWithNumericId(allLinkElementIDs[count])}`).wait(1000).click({ force: true })
                                                .then(($nextListItem) => {
                                                    const linkHref = $nextListItem.attr('href');
                                                    cy.location('pathname').should('equal', linkHref);
                                                    testVisit();
                                                });
                                        });
                                    }
                                });
                        }

                        cy.wrap($listItems.eq(0)).should('be.visible').click({ force: true }).then(($linkElem) => {
                            const linkHref = $linkElem.attr('href');
                            cy.location('pathname').should('equal', linkHref);
                            testVisit();
                        });
                    });
                }).end();
        });

        it('Tests the collapsing and expanding of the toggle button.', function () {
            cy.get('.benchmarking-nav-container .toggle-button')
                .click({ force: true })
                .should('have.attr', 'aria-expanded', 'false')
                .get('.benchmarking-ui-container').should('have.class', 'collapse-nav').end()
                .get('.benchmarking-nav-container .toggle-button')
                .click({ force: true })
                .should('have.attr', 'aria-expanded', 'true')
                .get('.benchmarking-ui-container').should('have.class', 'show-nav').end();
        });

    });

    context('Data Selection', function () {
        before(function () {
            cy.visit('/', { headers: cypressVisitHeaders });
            cy.loginSMaHT({ email: 'cypress-main-scientist@cypress.hms.harvard.edu', useEnvToken: false }).end()
                .get(navUserAcctDropdownBtnSelector)
                .should('not.contain.text', 'Login')
                .then((accountListItem) => {
                    expect(accountListItem.text()).to.contain('SCM');
                }).end();
            cy.visit('/data/benchmarking/COLO829', { headers: cypressVisitHeaders });
        });

        after(function () {
            cy.logoutSMaHT();
        });

        it('should check all checkboxes', () => {
            cy.get('#page-title-container .page-title').should('have.text', 'COLO829').end()
                .get('.search-results-container .search-result-row .search-result-column-block input[type="checkbox"]').each(($checkBox) => {
                    checkFileCheckbox($checkBox).end();
                });
        });

        it('should match selected files count with the displayed count', () => {
            cy.get('#download_tsv_multiselect').then(($selectedIndexCount) => {
                const selectedFileText = $selectedIndexCount.text();
                const selectedFileCount = parseInt(selectedFileText.match(/\d+/)[0]);
                expect(selectedCheckFileNumberCount).to.equal(selectedFileCount);
            });
        });

        it('should click download and validate selected files metadata', () => {
            cy.get('#download_tsv_multiselect').click({ force: true });
            cy.get('.tsv-metadata-stat-title').contains('Selected Files')
                .siblings('.tsv-metadata-stat')
                .invoke('text')
                .then((text) => {
                    expect(selectedCheckFileNumberCount).to.equal(parseInt(text));
                });
            cy.get('.fade.show.modal-backdrop').click({ force: true }).end();
        });

        it('should uncheck all checkboxes', () => {
            cy.get('.search-results-container .search-result-row .search-result-column-block input[type="checkbox"]').each(($checkBox) => {
                unCheckFileCheckbox($checkBox);
            });
        });

        it('should validate original total results count', () => {
            cy.get('#results-count').then(($origTotalResults) => {
                const originalFileText = $origTotalResults.text();
                allResultTotalCount = parseInt(originalFileText.match(/\d+/)[0]);

                cy.get('#select-all-files-button').click({ force: true }).end();
                cy.get('#download_tsv_multiselect').invoke('text').then((text) => {
                    const selectedFile = parseInt(text.match(/\d+/)[0]);
                    expect(allResultTotalCount).to.equal(selectedFile);
                });

                cy.get('#select-all-files-button').click({ force: true }).end();
                cy.get('#download_tsv_multiselect').invoke('text').then((text) => {
                    const selectedFile = parseInt(text.match(/\d+/)[0]);
                    expect(selectedFile).to.equal(0);
                });
            });
        });
    });

    context('Facets', function () {

        before(function () {
            cy.visit('/', { headers: cypressVisitHeaders });
            cy.loginSMaHT({ email: 'cypress-main-scientist@cypress.hms.harvard.edu', useEnvToken: false }).end()
                .get(navUserAcctDropdownBtnSelector)
                .should('not.contain.text', 'Login')
                .then((accountListItem) => {
                    expect(accountListItem.text()).to.contain('SCM');
                }).end();
            cy.visit('/data/benchmarking/COLO829', { headers: cypressVisitHeaders });
        });

        after(function () {
            cy.logoutSMaHT();
        });

        it('Switch between included and excluded properties in facets, exclude a term and check ExpSet counts', function () {
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
                .get(".facets-header .facets-title").should('have.text', 'Excluded Properties').end();

            // Select first term and store its count
            cy.get('.facet[data-field="file_sets.libraries.assay.display_title"] .facet-list-element:first-child a').within(($term) => {
                cy.get('span.facet-count').then((assayCount) => {
                    externalDataCount = parseInt(assayCount.text());
                    expect(externalDataCount).to.be.greaterThan(0);
                }).end();

                cy.wrap($term)
                    .scrollIntoView()
                    .should('be.visible')
                    .click({ force: true })
                    /*.get('span.facet-selector i.icon')
                    .should('have.class', 'icon-minus-square')*/.end();
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
            cy.get('.facet[data-field="file_sets.libraries.assay.display_title"] .persistent .facet-list-element:first-child a').within(($term) => {
                cy.wrap($term).click({ force: true }).end();
            }).end();

            // Verify initial count after re-inclusion
            cy.get('.facets-container').should('have.attr', 'data-context-loading', 'false').end()
                .get('.tab-pane.active.show #results-count').invoke('text').then((nextCounts2) => {
                    expect(initialDataCount).to.equal(parseInt(nextCounts2));
                }).end();

            // Exclude the term again and verify external count
            cy.get('.facet[data-field="file_sets.libraries.assay.display_title"] .facet-list-element:first-child a').within(($term) => {
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

    context('Embedded Search Container', function () {
        before(function () {
            cy.visit('/data/benchmarking/COLO829', { headers: cypressVisitHeaders });
            cy.loginSMaHT({ email: 'cypress-main-scientist@cypress.hms.harvard.edu', useEnvToken: false }).end()
                .get(navUserAcctDropdownBtnSelector)
                .should('not.contain.text', 'Login')
                .then((accountListItem) => {
                    expect(accountListItem.text()).to.contain('SCM');
                }).end();
        });

        after(function () {
            cy.logoutSMaHT();
        })

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
