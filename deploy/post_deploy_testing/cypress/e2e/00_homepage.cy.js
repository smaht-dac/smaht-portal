import { cypressVisitHeaders } from './../support';

describe('Home (Splash) Page', function () {
    it('Has correct title', function () {
        cy.visit('/', { headers: cypressVisitHeaders })
            .end()
            .title()
            .should('include', 'SMaHT Data Portal')
            .end()
            .get('.coming-soon')
            .should('have.text', 'Coming Soon')
            .get('.intro')
            .should(
                'have.text',
                'Welcome to the future home of the Somatic Mosaicism across Human Tissues (SMaHT) Data Portal'
            )
            .end();
    });
});
