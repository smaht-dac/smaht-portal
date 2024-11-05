import { cypressVisitHeaders } from "../support";
import { navUserAcctDropdownBtnSelector } from "../support/selectorVars";

// todo: Ensure we're selecting right 1 incase later add more -- test for `a.id-docs-menu-item` once in place upstream.
const documentationNavBarItemSelectorStr = '#top-nav div.navbar-collapse .navbar-nav a.id-docs-menu-item';

// we need to escape header id's starts with numeric character (like smaht-xyz), otherwise css query selectors not work properly
const escapeElementWithNumericId = function (selector) {
    return /^#\d/.test(selector) ? `[id="${selector.substring(1)}"]` : selector;
};

describe('Documentation Page & Content Tests', function () {

    before(function () {
        cy.visit('/', { headers: cypressVisitHeaders });
    });


    it('Click & visit each page from menu, ensure ToC exists somewhere, ensure ToC works.', function () {

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

            expect(err.message).to.include("return response;");

            Cypress.log({
                'name': "Negligible JSON err.",
                'message': "Hit error re: non-serializable function; fixed in subseq. deploys."
            });

            return false;
        });

        // Wait until help menu has loaded via AJAX and is a dropdown.
        // todo: Ensure we're selecting right 1 incase later add more -- test for `a.id-docs-menu-item` once in place upstream.
        cy.loginSMaHT({ 'email': 'cypress-main-scientist@cypress.hms.harvard.edu', 'useEnvToken': false }).end()
            .get(navUserAcctDropdownBtnSelector)
            .should('not.contain.text', 'Login')
            .then((accountListItem) => {
                expect(accountListItem.text()).to.contain('SCM');
            }).end()
            .get(documentationNavBarItemSelectorStr).should('have.class', 'dropdown-toggle').click().should('have.class', 'dropdown-open-for').then(() => {
                cy.get('div.big-dropdown-menu div.level-1-title-container a, div.big-dropdown-menu a.level-2-title').then(($listItems) => {
                    console.log($listItems);

                    expect($listItems).to.have.length.above(9); // At least 9 help pages in dropdown.
                    const allLinkElementIDs = Cypress._.map($listItems, function (liEl) {
                        return liEl.id;
                    });

                    cy.get('.homepage-contents .homepage-header h1').should('contain', 'Somatic Mosaicism across Human Tissues Data Portal').then((title) => {

                        let prevTitle = title.text();
                        let count = 0;
                        let haveWeSeenPageWithTableOfContents = false;

                        function testVisit() {

                            function finish(titleText) {
                                count++;
                                Cypress.log({
                                    'name': "Documentation Page " + count + '/' + $listItems.length,
                                    'message': 'Visited page with title "' + titleText + '".'
                                });
                                if (count < $listItems.length) {
                                    cy.get(documentationNavBarItemSelectorStr).click().should('have.class', 'dropdown-open-for').then(() => {
                                        //TODO: Remove wait() when a better workaround finds out
                                        //TODO: May apply possible solutions described in https://www.cypress.io/blog/2018/02/05/when-can-the-test-start
                                        cy.get('div.big-dropdown-menu a#' + escapeElementWithNumericId(allLinkElementIDs[count])).wait(1000).click().then(($nextListItem) => {
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

                                // Verify the presence of <pre> elements and ensure each one is not empty.
                                cy.document().then((doc) => {
                                    const elements = doc.querySelectorAll('.rst-container > div > pre');
                                    if (elements.length > 0) {
                                        cy.get('.rst-container > div > pre').each(($pre) => {
                                            const textContent = $pre.text().trim();
                                            expect(textContent).to.not.be.empty;
                                        });
                                    } else {
                                        cy.log('No <pre> elements found under .rst-container > div');
                                    }
                                });

                                // Variable to track if we've encountered a page with a Table of Contents
                                if (!haveWeSeenPageWithTableOfContents) {
                                    cy.window().then((win) => {
                                        const tocItems = win.document.querySelectorAll('div.table-of-contents li.table-content-entry a');

                                        if (tocItems.length > 0) {
                                            haveWeSeenPageWithTableOfContents = true;
                                            const originalScrollY = win.scrollY;

                                            // Scroll to top for a consistent starting point
                                            cy.scrollTo('top', { ensureScrollable: false }).then(() => {
                                                // Select the last Table of Contents link item
                                                cy.get('div.table-of-contents li.table-content-entry a').last().then(($link) => {
                                                    const linkHref = $link.attr('href');

                                                    // Ensure the target element of the link is visible after clicking
                                                    cy.wrap($link).click({ force: true });
                                                    cy.get(escapeElementWithNumericId(linkHref)).wait(1000).should('be.visible').then(() => {
                                                        expect(win.scrollY).to.not.equal(originalScrollY);
                                                        finish(titleText);
                                                    });
                                                });
                                            });
                                        } else {
                                            finish(titleText);
                                        }
                                    });
                                } else {
                                    finish(titleText);
                                }
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
            })
            .logoutSMaHT();

    });


    it('Every documentation page has links which return success status codes - SAMPLING', function () {

        cy.loginSMaHT({ 'email': 'cypress-main-scientist@cypress.hms.harvard.edu', 'useEnvToken': false }).end()
            .get(navUserAcctDropdownBtnSelector)
            .should('not.contain.text', 'Login')
            .then((accountListItem) => {
                expect(accountListItem.text()).to.contain('SCM');
            }).end()
            .get(documentationNavBarItemSelectorStr).should('have.class', 'dropdown-toggle').click().should('have.class', 'dropdown-open-for').then(() => {

                // Get all links to _level 2_ static pages. Exclude directory pages for now. Do directory pages in later test.
                // Randomly selects 5 links out of all items listed from the Help dropdown menu. If one of those randomly selected links is
                // Contact Us then the test fails since Contact Us page lacks content to be tested.
                cy.get('.big-dropdown-menu.is-open a.level-2-title').then(($listItems) => {

                    console.log($listItems);
                    const listItemsTotalCount = $listItems.length;

                    expect(listItemsTotalCount).to.be.above(9); // At least 9 documentation pages in dropdown.

                    // To avoid running on every single page x multiple network requests, lets create a random
                    // sampling of 5 list item indices to visit.
                    var itemIndicesToVisit = Cypress._.sampleSize(Cypress._.range(listItemsTotalCount), 5);

                    let prevTitle = null;
                    let count = 0;

                    function testVisit() {

                        cy.get('#page-title-container .page-title').should('not.have.text', prevTitle).then((t) => {
                            var titleText = t.text();
                            expect(titleText).to.have.length.above(0);
                            prevTitle = titleText;

                            if (titleText !== 'Data Release Status' && titleText !== 'Troubleshooting') {
                                const linkSelector = '.help-entry.static-section-entry a:not([href^="#"]):not([href^="mailto:"]):not([href*=".gov"])';

                                cy.get(linkSelector).then(() => {

                                    count++;

                                    Cypress.log({
                                        'name': "Documentation Page " + count + '/5/' + listItemsTotalCount,
                                        'message': 'Visited page with title "' + titleText + '".'
                                    });

                                    if (itemIndicesToVisit.length > 0) {
                                        const nextIndexToVisit = itemIndicesToVisit.shift();
                                        cy.get(documentationNavBarItemSelectorStr).should('have.class', 'dropdown-toggle').click().should('have.class', 'dropdown-open-for').then(() => {
                                            cy.get('.big-dropdown-menu.is-open a.level-2-title').eq(nextIndexToVisit).click().then(function ($linkElem) {
                                                const linkHref = $linkElem.attr('href');
                                                cy.location('pathname').should('equal', linkHref);
                                                testVisit();
                                            });
                                        });
                                    }
                                });
                            }
                        });
                    }

                    const firstItemIndexToVisit = itemIndicesToVisit.shift();
                    cy.wrap($listItems.eq(firstItemIndexToVisit)).click().then(function ($linkElem) {
                        const linkHref = $linkElem.attr('href');
                        cy.location('pathname').should('equal', linkHref);
                        testVisit();
                    });

                });
            })
            .logoutSMaHT();
    });
});