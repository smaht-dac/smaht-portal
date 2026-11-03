import { cypressVisitHeaders } from '../.';
import { navUserAcctLoginBtnSelector } from '../selectorVars';

export function gotoUrl(url = '/') {
    cy.visit(url, { headers: cypressVisitHeaders });

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

/**
 * Builds a small set of combinations in which every value of every dimension
 * appears at least once, instead of the full cartesian product.
 * Values are shuffled, so different runs cover different cross-combinations.
 * Returns an empty list if any dimension is empty (same as nested forEach loops).
 *
 * @param {Object<string, Array>} dimensions e.g. { grouping: ['a', 'b'], sequencer: ['x', 'y', 'z'] }
 * @returns {Object[]} e.g. [{ grouping: 'b', sequencer: 'y' }, { grouping: 'a', sequencer: 'x' }, { grouping: 'b', sequencer: 'z' }]
 */
export function buildCoveringCombinations(dimensions) {
    const keys = Object.keys(dimensions);
    if (keys.some((key) => dimensions[key].length === 0)) {
        return [];
    }
    const shuffled = Cypress._.mapValues(dimensions, (values) => Cypress._.shuffle(values));
    const count = Cypress._.max(keys.map((key) => dimensions[key].length));
    return Cypress._.range(count).map((i) =>
        Cypress._.fromPairs(keys.map((key) => [key, shuffled[key][i % shuffled[key].length]]))
    );
}

const timingMarks = {};

/**
 * Step-timing instrumentation: prints the time elapsed since the previous mark of the same timer
 * to stdout as "[timing] <test context> | <label>: <ms>ms", so it shows up in CI logs.
 * Use `reset: true` to start a timer without logging.
 *
 * @param {string} timer Independent timer name, e.g. 'donor' or 'matrix'
 * @param {string} label Name of the step that just finished
 */
export function markTiming(timer, label, { reset = false } = {}) {
    cy.then(() => {
        const now = Date.now();
        if (!reset && timingMarks[timer] !== undefined) {
            const context = (Cypress.currentTest.titlePath || []).slice(1, -1).join(' > ');
            cy.task('log', `[timing] ${context} | ${label}: ${now - timingMarks[timer]}ms`, { log: false });
        }
        timingMarks[timer] = now;
    });
}
