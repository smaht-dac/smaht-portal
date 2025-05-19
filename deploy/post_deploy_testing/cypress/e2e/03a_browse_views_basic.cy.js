import { cypressVisitHeaders } from '../support';
import {
    navBrowseBtnSelector,
    navUserAcctDropdownBtnSelector,
} from '../support/selectorVars';

const dataNavBarItemSelectorStr =
    '#top-nav div.navbar-collapse .navbar-nav a.id-data-menu-item';

describe('Browse Views - Basic Tests', function () {
    before(function () {
        cy.visit('/', { headers: cypressVisitHeaders });
        cy.loginSMaHT({
            email: 'cypress-main-scientist@cypress.hms.harvard.edu',
            useEnvToken: false,
        })
            .end()
            .get(navUserAcctDropdownBtnSelector)
            .should('not.contain.text', 'Login')
            .then((accountListItem) => {
                expect(accountListItem.text()).to.contain('SCM');
            })
            .end();
    });

    after(function () {
        cy.logoutSMaHT();
    });

    context('Navigation and Redirection', function () {
        it('If start from home page, clicking on Browse by File nav menu item gets us to Browse page.', function () {
            cy.get(dataNavBarItemSelectorStr)
                .should('have.class', 'dropdown-toggle')
                .click()
                .should('have.class', 'dropdown-open-for')
                .then(() => {})
                .get(navBrowseBtnSelector)
                .click()
                .then(() => {
                    cy.get('#page-title-container .page-title').should(
                        'contain',
                        'SMaHT Production Data'
                    );
                });
        });

        it('If point browser to /browse/ page (no URL params), we also get redirected to Production Data correctly.', function () {
            // cy.visit('/');¨
            cy.visit('/browse/', {
                headers: cypressVisitHeaders,
                failOnStatusCode: false,
            });

            // Wait for redirects: we should be taken from /browse/ to /browse/?type=File&sample_summary.studies=Production&status=released
            cy.location('search').should(
                'include',
                'sample_summary.studies=Production'
            );
        });

        //TODO: Add test for when we have data to test with.
        it.skip('There is at least 1 Donor in default browse view.', function () {
            cy.getQuickInfoBar().then((info) => {
                cy.log('Files Generated: ' + info.file);
                expect(info.file).to.be.at.least(1);

                cy.log('Donors: ' + info.donor);
                expect(info.donor).to.be.at.least(1);

                cy.log('Tissues: ' + info.tissue);
                expect(info.tissue).to.be.at.least(1);

                cy.log('Assays: ' + info.assay);
                expect(info.assay).to.be.at.least(1);

                cy.log('Total File Size: ' + info['file-size']);
                expect(info['file-size']).to.be.at.least(1);
            });
        });

        it('Tests the expanding and collapsing of the toggle button.', function () {
            cy.get('.sliding-sidebar-nav-container .toggle-button')
                .click({ force: true })
                .should('have.attr', 'aria-expanded', 'true')
                .get('.sliding-sidebar-ui-container')
                .should('have.class', 'show-nav')
                .end()
                .get('.sliding-sidebar-nav-container .toggle-button')
                .click({ force: true })
                .should('have.attr', 'aria-expanded', 'false')
                .get('.sliding-sidebar-ui-container')
                .should('have.class', 'collapse-nav')
                .end();
        });

        // TODO: Add facet filtering test when we have more data to test with.

        // TODO: Add file download test when we have more data to test with.
    });
});
