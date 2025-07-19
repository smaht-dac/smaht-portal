import { after } from "underscore";
import { cypressVisitHeaders } from "../support";

const dataNavBarItemSelectorStr = '#top-nav div.navbar-collapse .navbar-nav a.id-data-menu-item';

describe('Data Overview - QC Metrics', function () {

    const tabLabels = [
        'Sample Integrity',
        'Key Metrics',
        'Metrics - All',
        'Metric vs. Metric - All',
        'Metrics by file'
    ];

    before(function () {
        cy.visit('/', { headers: cypressVisitHeaders });

        cy.loginSMaHT({ 'email': 'cypress-main-scientist@cypress.hms.harvard.edu', 'useEnvToken': false })
            .validateUser('SCM')
            .get(dataNavBarItemSelectorStr)
            .should('have.class', 'dropdown-toggle')
            .click()
            .should('have.class', 'dropdown-open-for').then(() => {

                cy.get('.big-dropdown-menu.is-open a.big-link[href="/qc-metrics"]')
                    .click({ force: true }).then(function ($linkElem) {
                        cy.get('#slow-load-container').should('not.have.class', 'visible').end();
                        const linkHref = $linkElem.attr('href');
                        cy.location('pathname').should('equal', linkHref);
                    });

                // Verify that the page contains the correct header
                cy.contains('div#qc_visualizations h2.section-title', 'QC Metric Visualizations').should('be.visible');
            });
    });

    after(function () {
        cy.logoutSMaHT();
    });

    it('Verify all tabs are present and functional', function () {

        // Verify that the tabs are present
        cy.get('#qc-metrics-tabs')
            .should('exist')
            .and('be.visible')
            .find('button')
            .should('have.length', tabLabels.length)
            .each((tab, index) => {
                cy.wrap(tab).should('contain.text', tabLabels[index]);
            });

        // Click on each tab and verify its functionality
        cy.get('#qc-metrics-tabs').within(() => {
            tabLabels.forEach((label, index) => {
                cy.contains('button', label)
                    .click()
                    .should('have.class', 'active')
                    .and('have.attr', 'aria-selected', 'true');
            });
        });
    });

    it('Verify Sample Integrity tab - check presence of dropdown, chart and table', function () {

        // Verify that the Sample Integrity tab is present and functional
        cy.get('#qc-metrics-tabs')
            .contains('button', 'Sample Integrity')
            .should('be.visible')
            .click()
            .should('have.class', 'active')
            .and('have.attr', 'aria-selected', 'true')
            .get('#qc-metrics-tabs-tabpane-sample-integrity').within(() => {

                // Assert that the combobox displays COLO829 as the selected value
                cy.get('div[class$="singleValue"]')
                    .should('contain.text', 'COLO829');

                // Open the dropdown menu
                cy.get('[role="combobox"]').click();

                // Wait for the options to become visible and select the first option that is not COLO829
                cy.get('[role="option"]').then(($options) => {
                    // Find the first option whose text is not COLO829
                    const otherOption = [...$options].find((opt) => opt.textContent.trim() !== 'COLO829');
                    // Click the found option
                    if (otherOption) {
                        cy.wrap(otherOption).click();
                    }
                });

                // Assert that the selected value has changed and is no longer COLO829
                cy.get('div[class$="singleValue"]')
                    .should('not.contain.text', 'COLO829');

                // Open the dropdown to get all available options' text values
                cy.get('[role="combobox"]').click();
                cy.get('[role="option"]').then(($options) => {
                    let optionTexts = [...$options].map((opt) => opt.textContent.trim());
                    // Use 3 random options for speed
                    optionTexts = Cypress._.shuffle(optionTexts).slice(0, 3);

                    let prevFirstCell = null;
                    let prevXAxisTick = null;
                    let prevYAxisTick = null;

                    cy.wrap(optionTexts).each((optionText, index) => {
                        cy.get('[role="combobox"]').click();
                        cy.get('[role="option"]').contains(optionText).click();
                        cy.get('div[class$="singleValue"]').should('have.text', optionText);

                        // Table existence and row check
                        cy.contains('div.pt-5.h4', 'Somalier results').should('be.visible');
                        cy.get('table.qc-metrics-data-table')
                            .should('exist')
                            .and('be.visible')
                            .find('tbody tr')
                            .its('length')
                            .should('be.gte', 1);

                        // Table content change check
                        cy.get('table.qc-metrics-data-table tbody tr:first td:first')
                            .invoke('text')
                            .then((firstCellText) => {
                                if (index > 0) {
                                    expect(firstCellText).not.to.eq(prevFirstCell);
                                }
                                prevFirstCell = firstCellText;
                            });

                        // Chart and axis label checks
                        cy.contains('h4', 'Pairwise sample relatedness')
                            .should('be.visible')
                            .parent()
                            .find('svg.sample-contamination-svg')
                            .should('exist')
                            .and('be.visible')
                            .as('chartSvg');

                        cy.get('@chartSvg')
                            .should('contain.text', 'Sample A')
                            .and('contain.text', 'Sample B');

                        // Find the first Y axis tick label (left axis: g[transform^="translate(0,"])
                        // --- Y Axis tick (x=0)
                        cy.get('@chartSvg')
                            .find('g.tick[transform^="translate(0,"] text')
                            .first()
                            .invoke('text')
                            .then((yAxisTick) => {
                                // --- X Axis tick (y=0)
                                cy.get('@chartSvg')
                                    .find('g.tick')
                                    .filter((i, el) => {
                                        const tr = el.getAttribute('transform') || '';
                                        return /,0\)?$/.test(tr);
                                    })
                                    .first()
                                    .find('text')
                                    .invoke('text')
                                    .then((xAxisTick) => {
                                        if (index > 0) {
                                            expect(xAxisTick).not.to.eq(prevXAxisTick);
                                            expect(yAxisTick).not.to.eq(prevYAxisTick);
                                        }
                                        prevXAxisTick = xAxisTick;
                                        prevYAxisTick = yAxisTick;
                                    });
                            });
                    });
                });
            });

    });

    it('Verify Key Metrics tab - check all Assay x Sample Source combinations: charts, data points, and Tissue Integrity row match for RNA-seq', function () {
        cy.get('#qc-metrics-tabs')
            .contains('button', 'Key Metrics')
            .should('be.visible')
            .click()
            .should('have.class', 'active')
            .and('have.attr', 'aria-selected', 'true')
            .get('#qc-metrics-tabs-tabpane-key-metrics').within(() => {

                // Required options
                const assayOptions = ['WGS', 'RNA-seq'];
                const sampleSourceOptions = [
                    'benchmarking_cell_lines',
                    'benchmarking_tissues',
                    'production_tissues'
                ];

                // Assay select
                cy.contains('div.fw-bold', 'Assay')
                    .parent()
                    .find('select.form-select')
                    .as('assaySelect');

                // Sample Source select
                cy.contains('div.fw-bold', 'Sample Source')
                    .parent()
                    .find('select.form-select')
                    .as('sourceSelect');

                assayOptions.forEach((assay) => {
                    cy.get('@assaySelect').select(assay)
                        .find('option:selected')
                        .should('have.value', assay);

                    sampleSourceOptions.forEach((source) => {
                        cy.get('@sourceSelect').select(source)
                            .find('option:selected')
                            .should('have.value', source);

                        // Chart validation
                        cy.get('svg.boxplot-svg').should('have.length.gte', 1).each(($svg) => {
                            cy.wrap($svg)
                                .find('circle.data-point')
                                .its('length')
                                .should('be.gte', 1);

                            // X axis label
                            cy.wrap($svg)
                                .find('text')
                                .then(($texts) => {
                                    const hasXAxisLabel = [...$texts].some(
                                        (el) => el.textContent.trim() === 'Submission Center'
                                    );
                                    expect(hasXAxisLabel, 'SVG has "Submission Center" X axis label').to.be.true;
                                });
                        });

                        // If Assay is RNA-seq, check Tissue Integrity table and row count equals chart data points
                        if (assay === 'RNA-seq') {
                            cy.get('div.qc-key-metrics-header')
                                .should('contain.text', 'Tissue Integrity')
                                .should('be.visible');
                            cy.get('table.qc-metrics-data-table').should('be.visible');
                            cy.get('table.qc-metrics-data-table tbody tr')
                                .then(($rows) => {
                                    const rowCount = $rows.length;

                                    cy.get('svg.boxplot-svg').each(($svg) => {
                                        cy.wrap($svg)
                                            .find('circle.data-point')
                                            .should('have.length', rowCount);
                                    });
                                });
                        }
                    });
                });
            });
    });

    it('Verify Metrics - All tab: sample 5 QC metrics and 5 sample sources, all filter combinations, chart, and table content', () => {
        cy.get('#qc-metrics-tabs')
            .contains('button', 'Metrics - All')
            .should('be.visible')
            .click()
            .should('have.class', 'active')
            .and('have.attr', 'aria-selected', 'true');

        cy.get('#qc-metrics-tabs-tabpane-all-metrics').within(($tabPane) => {
            // Helper functions for selects (scoped within tab pane)
            const getQCMetricsCombobox = () => cy.get('[role="combobox"]').first();
            const getGroupingSelect = () => cy.contains('div.fw-bold', 'Grouping').next('select.form-select');
            const getAssaySelect = () => cy.contains('div.fw-bold', 'Assay').next('select.form-select');
            const getSampleSourceSelect = () => cy.contains('div.fw-bold', 'Cell line').next('select.form-select');
            const getSequencerSelect = () => cy.contains('div.fw-bold', 'Sequencer').next('select.form-select');

            // Get Grouping, Assay and Sequencer options once
            getGroupingSelect().find('option').then(($gOpts) => {
                const groupingOptions = [...$gOpts].map((opt) => opt.value);

                getAssaySelect().find('option').then(($aOpts) => {
                    const assayOptions = [...$aOpts].map((opt) => opt.value);

                    getSequencerSelect().find('option').then(($seqOpts) => {
                        const sequencerOptions = [...$seqOpts].map((opt) => opt.value);

                        // Loop all Assay options, and inside each, sample QC metrics and sample sources
                        assayOptions.forEach((assay) => {
                            // Select Assay and ensure it is set
                            getAssaySelect().select(assay);

                            // Now, get the current available QC metric options for this assay
                            getQCMetricsCombobox().click();
                            cy.get('[role="option"]').then(($qcOpts) => {
                                let qcMetricOptions = [...$qcOpts].map((opt) => opt.textContent.trim());
                                // Shuffle and pick 5 random QC metrics (or less if fewer)
                                qcMetricOptions = Cypress._.shuffle(qcMetricOptions).slice(0, 5);

                                // Get available Sample Source options for this assay
                                getSampleSourceSelect().find('option').then(($sOpts) => {
                                    let sampleSourceOptions = [...$sOpts].map((opt) => opt.value);
                                    sampleSourceOptions = Cypress._.shuffle(sampleSourceOptions).slice(0, 5);

                                    qcMetricOptions.forEach((qcMetric) => {
                                        groupingOptions.forEach((grouping) => {
                                            sampleSourceOptions.forEach((sampleSource) => {
                                                sequencerOptions.forEach((sequencer) => {
                                                    // Set QC metric (react-select)
                                                    getQCMetricsCombobox().click();
                                                    cy.get('[role="option"]').contains(qcMetric).click();

                                                    // Set Grouping
                                                    getGroupingSelect().select(grouping);

                                                    // Set Sample Source
                                                    getSampleSourceSelect().select(sampleSource);

                                                    // Set Sequencer
                                                    getSequencerSelect().select(sequencer);

                                                    // Remove [source] from QC metric for axis/table checks
                                                    const qcMetricYTitle = qcMetric.replace(/\s*\[.*?\]/, '').trim();
                                                    // Make x axis title readable
                                                    const groupingXTitle = grouping
                                                        .replace(/_/g, ' ')
                                                        .replace(/\b\w/g, (c) => c.toUpperCase());

                                                    // Check for "No data available" message in scope
                                                    cy.wrap($tabPane).then(($pane) => {
                                                        cy.wrap($pane).find('.boxplot-svg, .text-center:contains("No data available for the selected filters.")', { timeout: 20000 })
                                                            .should('have.length.gte', 1)
                                                            .then(($elements) => {
                                                                const noDataMsg = $elements.filter('.text-center:contains("No data available for the selected filters.")');
                                                                if (noDataMsg.length > 0) {
                                                                    cy.wrap(noDataMsg).should('be.visible');
                                                                } else {
                                                                    const $svg = $elements.filter('.boxplot-svg').first();
                                                                    cy.wrap($svg).within(() => {
                                                                        cy.contains('text', qcMetricYTitle).should('exist');
                                                                        cy.get('text').then(($labels) => {
                                                                            const found = [...$labels].some((el) =>
                                                                                el.textContent.trim().toLowerCase() === groupingXTitle.toLowerCase()
                                                                            );
                                                                            expect(found, `Axis label for ${groupingXTitle} found`).to.be.true;
                                                                        });

                                                                        cy.get('circle.data-point').its('length').should('be.gte', 1);

                                                                        cy.wrap($tabPane).find('.qc-metrics-data-table table').within(() => {
                                                                            cy.get('thead th').eq(2)
                                                                                .should('contain.text', qcMetricYTitle);
                                                                            cy.get('tbody tr').should('have.length.at.least', 1);
                                                                            cy.get('tbody tr').each(($row) => {
                                                                                cy.wrap($row).find('td').eq(6).should('contain.text', assay);
                                                                            });
                                                                        });
                                                                    });
                                                                }
                                                            });
                                                    });

                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });



});
