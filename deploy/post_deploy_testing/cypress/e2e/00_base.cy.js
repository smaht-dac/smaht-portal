import { cypressVisitHeaders } from '../support';

describe('Basic functionality: page loads and can authenticate.', function () {
    it('Has correct title', function () {
        cy.visit('/', { headers: cypressVisitHeaders })
            .end()
            .title()
            .should('include', 'SMaHT Data Portal')
            .end();
    });

    it('Can login and out', function () {
        // Login
        cy.loginSMaHT({
            email: 'cypress-main-scientist@cypress.hms.harvard.edu',
            useEnvToken: false,
        })
            .get('.user-first-name')
            .contains('SCM')
            .end();

        // Log out
        cy.logoutSMaHT().end();
    });
});
