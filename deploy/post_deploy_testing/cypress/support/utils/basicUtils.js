import { cypressVisitHeaders } from '../.';
import { navUserAcctLoginBtnSelector } from '../selectorVars';

export function gotoHome() {
    cy.visit('/', { headers: cypressVisitHeaders });

    // if navUserAcctLoginBtnSelector is visible then it should not have disabled attribute
    cy.get('body').then(($body) => {
        if ($body.find(navUserAcctLoginBtnSelector).length > 0) {
            cy.get(navUserAcctLoginBtnSelector).should('not.have.attr', 'disabled');
        }
    });

    cy.get('#slow-load-container')
        .should('not.have.class', 'visible')
        .end();
}