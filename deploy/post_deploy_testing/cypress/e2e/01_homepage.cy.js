import { cypressVisitHeaders } from '../support';

describe('Home Page', function () {
    beforeEach(() => {
        cy.visit('/', { headers: cypressVisitHeaders });
        cy.loginSMaHT({
            email: 'cypress-main-scientist@cypress.hms.harvard.edu',
            useEnvToken: false,
        });
    });

    it('Header text is correct', () => {
        cy.get('.homepage-wrapper > .homepage-contents h1').contains(
            'Somatic Mosaicism across Human Tissues Data Portal'
        );
        cy.get('.homepage-wrapper > .homepage-contents h2')
            .contains(
                'A platform to search, visualize, and download somatic mosaic variants in normal tissues.'
            )
            .end();
    });

    it('Timeline dropdowns work as expected', () => {
        /* ==== Generated with Cypress Studio ==== */
        cy.get('#timeline .timeline-item .accordion .card-header-button').first().click({ force: true });
        cy.get('#timeline .timeline-item .accordion .card-header-button').first().click({ force: true });
    
        cy.get('#timeline .timeline-item .accordion .accordion-collapse.show .card-body').should('be.visible');
    
        cy.get('#timeline .timeline-item:nth-child(3) .card-header-button').click({ force: true });
        cy.get('#timeline .timeline-item:nth-child(4) .card-header-button').click({ force: true });
    
        cy.get('#timeline .timeline-item:nth-child(2) .accordion .card-header-button').first().click({ force: true });
        cy.get('#timeline .timeline-item:nth-child(3) .card-header-button').click({ force: true });
        /* ==== End Cypress Studio ==== */
    });

    it('Navbar dropdowns work as expected when logged in', () => {
        /* ==== Generated with Cypress Studio ==== */
        cy.get('#data-menu-item').clickEvent();
        cy.get('#docs-menu-item').clickEvent();
        cy.get('#about-menu-item').clickEvent();
        /* ==== End Cypress Studio ==== */
    });
});
