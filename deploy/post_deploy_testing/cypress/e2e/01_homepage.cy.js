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
        cy.get(
            ':nth-child(1) > .timeline-content > .accordion > :nth-child(1) > .card-header > .d-flex > .border-0 > div > .icon'
        ).click();
        cy.get(
            ':nth-child(1) > .timeline-content > .accordion > :nth-child(1) > .card-header > .d-flex > .border-0 > div > .icon'
        ).click();
        cy.get(
            ':nth-child(1) > .timeline-content > .accordion > :nth-child(1) > .collapse > .card-body'
        ).click();
        cy.get(
            ':nth-child(3) > .card-header > .d-flex > .border-0 > div > .icon'
        ).click();
        cy.get(
            ':nth-child(4) > .card-header > .d-flex > .border-0 > div > .icon'
        ).click();
        cy.get(
            ':nth-child(2) > .timeline-content > .accordion > .card > .card-header > .d-flex > .border-0 > div > .icon'
        ).click();
        cy.get(
            ':nth-child(3) > .timeline-content > .accordion > .card > .card-header > .d-flex > .border-0 > div > .icon'
        ).click();
        /* ==== End Cypress Studio ==== */
        cy.end();
    });

    it('Navbar dropdowns work as expected when logged in', () => {
        /* ==== Generated with Cypress Studio ==== */
        cy.get('#data-menu-item').clickEvent();
        cy.get('#docs-menu-item').clickEvent();
        cy.get('#about-menu-item').clickEvent();
        /* ==== End Cypress Studio ==== */
    });
});
