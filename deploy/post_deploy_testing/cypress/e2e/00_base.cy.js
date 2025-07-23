import { cypressVisitHeaders, ROLE_TYPES } from '../support';

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
        cy.loginSMaHT(ROLE_TYPES.SMAHT_DBGAP)
            .validateUser('SCM')
            .end();

        // Log out
        cy.logoutSMaHT().end();
    });
});
