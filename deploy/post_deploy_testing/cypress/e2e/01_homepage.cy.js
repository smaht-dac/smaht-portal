import { cypressVisitHeaders } from '../support';

describe('Home Page', function () {
    beforeEach(() => {
        cy.visit('/', { headers: cypressVisitHeaders });
        cy.loginSMaHT({
            email: 'cypress-main-scientist@cypress.hms.harvard.edu',
            useEnvToken: false,
        });
    });

    after(function () {
        cy.logoutSMaHT();
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
        cy.get('#timeline .timeline-item').each(($item) => {
            cy.wrap($item)
                .find('.accordion .card-header-button')
                .each(($button) => {
                    cy.wrap($button)
                        .parents('.card')
                        .find('.accordion-collapse')
                        .then(($collapse) => {
                            cy.wrap($button).scrollIntoView();
                            cy.wrap($button).click({ force: true });

                            if (!$collapse.hasClass('show')) {
                                cy.wrap($button)
                                    .parents('.card')
                                    .find('.accordion-collapse')
                                    .should('have.class', 'show');
                            } else {
                                cy.wrap($button)
                                    .parents('.card')
                                    .find('.accordion-collapse')
                                    .should('not.have.class', 'show');
                            }
                        });
                });
        });
    });

    it(`Figure's tier buttons are working correctly.`, () => {
        cy.get('.selector-buttons button').each(($button) => {
            if (!$button.hasClass('active')) {
                cy.wrap($button).click();

                cy.wrap($button)
                    .find('span')
                    .invoke('text')
                    .then((text) => {
                        const className = text.toLowerCase().replace(/\s+/g, '-');

                        cy.get('.card.assays').should('have.class', className);
                    });
            }
        });
    });


    it('Navbar dropdowns work as expected when logged in', () => {
        /* ==== Generated with Cypress Studio ==== */
        cy.get('#data-menu-item').clickEvent();
        cy.get('#docs-menu-item').clickEvent();
        cy.get('#about-menu-item').clickEvent();
        /* ==== End Cypress Studio ==== */
    });
});
