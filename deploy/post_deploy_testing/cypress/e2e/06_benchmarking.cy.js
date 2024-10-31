import { cypressVisitHeaders } from "../support";
import { navUserAcctDropdownBtnSelector } from "../support/selectorVars";

const dataNavBarItemSelectorStr = '#top-nav div.navbar-collapse .navbar-nav a.id-data-menu-item';

let selectedCheckFileNumberCount = 0;
let allResultTotalCount = 0;

function checkFileCheckbox($checkBox) {
    selectedCheckFileNumberCount += 1;
    return cy.wrap($checkBox).scrollToCenterElement().check({ 'force': true }).end();
}

function unCheckFileCheckbox($checkBox) {
    selectedCheckFileNumberCount -= 1;
    if (selectedCheckFileNumberCount >= 0) {
        return cy.wrap($checkBox).scrollToCenterElement().uncheck({ 'force': true }).end();
    }
}

// we need to escape header id's starts with numeric character (like smaht-xyz), otherwise css query selectors not work properly
const escapeElementWithNumericId = function (selector) {
    return /^#\d/.test(selector) ? `[id="${selector.substring(1)}"]` : selector;
};

describe('Benchmarking Views - Basic Tests', function () {

    context('Navigation and Redirection', function () {
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
            // cy.logoutSMaHT();
        });

        it('Click & visit each page from menu, ensure ToC exists somewhere, ensure ToC works.', function () {

            cy.on('uncaught:exception', function (err, runnable) {
                if (err.message.includes("Did not get back a search response")) {
                    return false;
                }

                expect(err.message).to.include("return response;");

                Cypress.log({
                    'name': "Negligible JSON err.",
                    'message': "Hit error re: non-serializable function; fixed in subseq. deploys."
                });

                return false;
            });

            // Wait until help menu has loaded via AJAX and is a dropdown.
            // todo: Ensure we're selecting right 1 incase later add more -- test for `a.id-docs-menu-item` once in place upstream.
            cy.get(dataNavBarItemSelectorStr).should('have.class', 'dropdown-toggle').click().should('have.class', 'dropdown-open-for').then(() => {
                cy.get('div.big-dropdown-menu div.help-menu-tree:first-child a.level-3-title').then(($listItems) => {
                    console.log($listItems);

                    expect($listItems).to.have.length.above(6); // At least 6 benchmarking pages in dropdown.
                    const allLinkElementIDs = Cypress._.map($listItems, function (liEl) {
                        return liEl.id;
                    });

                    cy.get('.homepage-contents .homepage-header h1').should('contain', 'Somatic Mosaicism across Human Tissues Data Portal').then((title) => {

                        let prevTitle = title.text();
                        let count = 0;

                        function testVisit() {

                            function finish(titleText) {
                                count++;
                                Cypress.log({
                                    'name': "Benchmarking Page " + count + '/' + $listItems.length,
                                    'message': 'Visited page with title "' + titleText + '".'
                                });
                                if (count < $listItems.length) {
                                    cy.get(dataNavBarItemSelectorStr).click().should('have.class', 'dropdown-open-for').then(() => {
                                        //TODO: Remove wait() when a better workaround finds out
                                        //TODO: May apply possible solutions described in https://www.cypress.io/blog/2018/02/05/when-can-the-test-start
                                        cy.get('div.big-dropdown-menu a#' + escapeElementWithNumericId(allLinkElementIDs[count])).wait(1000).click({ force: true }).then(($nextListItem) => {
                                            const linkHref = $nextListItem.attr('href');
                                            cy.location('pathname').should('equal', linkHref);
                                            testVisit();
                                        });
                                    });
                                }
                            }

                            cy.get('#page-title-container .page-title').should('not.have.text', prevTitle).then((t) => {
                                var titleText = t.text();
                                expect(titleText).to.have.length.above(0);
                                cy.title().should('equal', titleText + ' – SMaHT Data Portal').end();
                                prevTitle = titleText;

                                // cy.get('.benchmarking-nav-container .benchmarking-nav-section .navlink-drop.active')
                                //     .invoke('text')
                                //     .then((text) => {
                                //         expect(text.trim()).to.equal(titleText);
                                //     });

                                cy.get('.benchmarking-layout-container .information-container button.toggle-information-text-button')
                                    .click({ force: true })
                                    .should('have.attr', 'aria-expanded', 'false')
                                    .then(() => {
                                        cy.get('#benchmarking-page-description-container')
                                            .should('have.class', 'collapsed');
                                    }).end()
                                    .get('.benchmarking-layout-container .information-container button.toggle-information-text-button')
                                    .click({ force: true })
                                    .should('have.attr', 'aria-expanded', 'true')
                                    .then(() => {
                                        cy.get('#benchmarking-page-description-container')
                                            .should('have.class', 'expanded');
                                    }).end();

                                finish(titleText);
                            });
                        }
                        cy.wrap($listItems.eq(0)).should('be.visible').click({ force: true }).then(function ($linkElem) {
                            cy.get('#slow-load-container').should('not.have.class', 'visible').end();
                            const linkHref = $linkElem.attr('href');
                            cy.location('pathname').should('equal', linkHref);
                            testVisit();
                        });

                    });
                });
            }).end();
        });

        it('should check all checkboxes', () => {
            cy.on('uncaught:exception', function (err, runnable) {
                // TODO: Investigate hydration errors occurring during SSR in Cypress tests.
                // It appears that Cypress injects a prop into the div on the client side, which doesn't exist on the server side, leading to hydration issues.
                // This suppression is temporary and should be removed once the issue is resolved.
                // https://github.com/cypress-io/cypress/issues/27204
                if (
                    /hydrat/i.test(err.message) ||
                    /Minified React error #418/.test(err.message) ||
                    /Minified React error #423/.test(err.message)
                ) {
                    return false;
                }

                if (err.message.includes("Did not get back a search response")) {
                    return false;
                }

                expect(err.message).to.include("return response;");

                Cypress.log({
                    'name': "Negligible JSON err.",
                    'message': "Hit error re: non-serializable function; fixed in subseq. deploys."
                });

                return false;
            });

            cy.visit('/data/benchmarking/COLO829', { headers: cypressVisitHeaders });
            cy.get('#page-title-container .page-title').should('have.text', 'COLO829').end()
                .get('#slow-load-container').should('not.have.class', 'visible')
                .get('.benchmarking-layout-container .benchmarking-layout i.icon-circle-notch').should('not.exist').end();
            cy.get('.search-results-container .react-infinite-container .search-result-row .search-result-column-block input[type="checkbox"]').each(($checkBox) => {
                checkFileCheckbox($checkBox).end();
            });
        });

        it('should match selected files count with the displayed count', () => {
            cy.get('#download_tsv_multiselect').then(($selectedIndexCount) => {
                const selectedFileText = $selectedIndexCount.text();
                let selectedFileCount = selectedFileText.match(/\d/g);
                selectedFileCount = parseInt(selectedFileCount.join(''));
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
                let originalFileText = $origTotalResults.text();
                originalFileText = originalFileText.match(/\d/g);
                allResultTotalCount = parseInt(originalFileText);

                cy.get('#select-all-files-button').click({ force: true }).end();
                cy.get('#select-all-files-button i.icon-circle-notch').should('not.exist').end();
                cy.get('#download_tsv_multiselect')
                    .invoke('text')
                    .then((text) => {
                        const selectedFile = parseInt(text.match(/\d/g));
                        expect(allResultTotalCount).to.equal(selectedFile);
                    });

                cy.get('#select-all-files-button').click({ force: true }).end();
                cy.get('#select-all-files-button i.icon-circle-notch').should('not.exist').end();
                cy.get('#download_tsv_multiselect')
                    .invoke('text')
                    .then((text) => {
                        const selectedFile = parseInt(text.match(/\d/g));
                        expect(selectedFile).to.equal(0);
                    });
            });
        });
    });
});

