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
        cy.get(
            '.tier-active > .timeline-content > .accordion > :nth-child(1) > .card-header > .card-header-content > .card-header-button > .d-flex > .icon'
        ).click();
        cy.get(
            '.tier-active > .timeline-content > .accordion > :nth-child(1) > .card-header > .card-header-content > .card-header-button > .d-flex > .icon'
        ).click();
        cy.get(
            ':nth-child(2) > .card-header > .card-header-content > .card-header-button > .d-flex > .icon'
        ).click();
        cy.get(
            ':nth-child(3) > .timeline-content > .accordion > .card > .card-header > .card-header-content > .card-header-button > .d-flex'
        ).click();
        cy.get(':nth-child(4) > span').click();
        cy.get('.selector-buttons > :nth-child(2) > span').click();
        cy.end;
    });

    // it('Navbar dropdowns work as expected when logged in', () => {
    //     /* ==== Generated with Cypress Studio ==== */
    //     cy.get('#data-menu-item').clickEvent();
    //     cy.get('#docs-menu-item').clickEvent();
    //     cy.get('#about-menu-item').clickEvent();
    //     /* ==== End Cypress Studio ==== */
    // });
});
