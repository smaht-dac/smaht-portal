import { cypressVisitHeaders } from '../support';

describe('Benchmarking Page', function () {
    beforeEach(() => {
        cy.visit('/', {
            headers: cypressVisitHeaders,
        });
        cy.loginSMaHT({
            email: 'cypress-main-scientist@cypress.hms.harvard.edu',
            useEnvToken: false,
        });
        cy.visit('/data/benchmarking/COLO829#main', {
            headers: cypressVisitHeaders,
        });
    });

    it('Is the correct page and has correct content', () => {
        // Check title and description
        cy.get('h1.page-title').contains('COLO829');
        cy.get(
            '.static-section-entry>.section-content .benchmarking-layout p.readable'
        ).contains(
            'COLO829 (COLO829T) is a metastatic melanoma cancer cell line, which has a matched normal lymphoblast cell line, COLO892BL, derived from the same individual. For benchmarking analysis, COLO829T cells were mixed with COLO829BL cells at a mixture ratio of 1:50 (COLO829BLT50).'
        );
    });

    it('Has multiple tabs with search tables', () => {
        const benchmarkingNavBaseSelector =
            '.static-section-entry>.section-content .benchmarking-nav>.benchmarking-nav-section ';

        // Ensure side tab shows as active, and tab switching works
        // Note: may have to update selectors if new collapsibles are added
        cy.get(benchmarkingNavBaseSelector + '.sidenav-link.active > a').should(
            'contain',
            'COLO829T'
        );
        cy.get(
            benchmarkingNavBaseSelector + '.collapse > ul > :nth-child(2) > a'
        ).click();
        cy.get(benchmarkingNavBaseSelector + '.sidenav-link.active > a').should(
            'contain',
            'COLO829BL'
        );
        cy.get(
            benchmarkingNavBaseSelector + '.collapse > ul > :nth-child(3) > a'
        ).click();
        cy.get(benchmarkingNavBaseSelector + '.sidenav-link.active > a').should(
            'contain',
            'COLO829BLT50'
        );
        cy.get('#COLO829-Tab-Renderer-tab-\\#main').click();
        cy.get(benchmarkingNavBaseSelector + '.sidenav-link.active > a').should(
            'contain',
            'COLO829T'
        );
    });

    it('Select and multiselect function as expected', () => {
        const benchmarkingTableBaseSelector =
            '.static-section-entry>.section-content .benchmarking-layout>.tab-content>div.active.tab-pane .embedded-search-view-outer-container ';
        const downloadButtonId = '#download_tsv_multiselect';
        const selectAllButtonId = '#select-all-files-button';

        // Download button is disabled to start
        cy.get(benchmarkingTableBaseSelector + downloadButtonId).should(
            'be.disabled'
        );
        // Select all button is enabled to start
        cy.get(benchmarkingTableBaseSelector + selectAllButtonId).should(
            'be.enabled'
        );
        // Should be two search results
        cy.get(benchmarkingTableBaseSelector + '#results-count').contains(2);

        // Click a single option
        cy.get(
            benchmarkingTableBaseSelector +
                '[data-row-number="0"] > .columns > .search-result-column-block > .inner > .mr-2'
        ).check();
        // See that download button is enabled
        cy.get(benchmarkingTableBaseSelector + downloadButtonId)
            .should('be.enabled')
            .contains('Download 1 Selected Files');
        // Check another option
        cy.get(
            benchmarkingTableBaseSelector +
                '[data-row-number="1"] > .columns > .search-result-column-block > .inner > .mr-2'
        ).check();
        // Select all should say "Deselect all" and remain enabled
        cy.get(benchmarkingTableBaseSelector + selectAllButtonId)
            .contains('Deselect All')
            .click();
        // Double check
        cy.get(
            benchmarkingTableBaseSelector +
                'div[data-field="@type"]>.inner>.column-title>span > input'
        ).check();
        cy.get(
            benchmarkingTableBaseSelector +
                'div[data-field="@type"]>.inner>.column-title> span > input'
        ).uncheck();
        cy.get(benchmarkingTableBaseSelector + selectAllButtonId).click();
    });
});
