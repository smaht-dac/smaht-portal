import { cypressVisitHeaders, ROLE_TYPES } from "../support";
import { dataNavBarItemSelectorStr } from "../support/selectorVars";

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

        cy.loginSMaHT(ROLE_TYPES.SMAHT_DBGAP)
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
                        // Verify that the page contains the correct header
                        cy.contains('div#qc_visualizations h2.section-title', 'QC Metric Visualizations').should('be.visible');
                    })
                    .end();
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
                        // Y Axis tick (x=0)
                        cy.get('@chartSvg')
                            .find('g.tick[transform^="translate(0,"] text')
                            .first()
                            .invoke('text')
                            .then((yAxisTick) => {
                                // X Axis tick (y=0)
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

    it('Verify Metrics - All tab: sample 2 QC metrics and 2 sample sources, all filter combinations, chart, and table content', () => {
        cy.get('#qc-metrics-tabs')
            .contains('button', 'Metrics - All')
            .should('be.visible')
            .click()
            .should('have.class', 'active')
            .and('have.attr', 'aria-selected', 'true');

        cy.get('#qc-metrics-tabs-tabpane-all-metrics').within(($tabPane) => {
            // Helper functions scoped within tab pane
            const getQCMetricsCombobox = () => cy.get('[role="combobox"]').first();
            const getGroupingSelect = () => cy.contains('div.fw-bold', 'Grouping').next('select.form-select');
            const getAssaySelect = () => cy.contains('div.fw-bold', 'Assay').next('select.form-select');
            const getSampleSourceSelect = () => cy.contains('div.fw-bold', 'Cell line').next('select.form-select');
            const getSequencerSelect = () => cy.contains('div.fw-bold', 'Sequencer').next('select.form-select');

            // Get Grouping and Sequencer options (these are static)
            getGroupingSelect().find('option').then(($gOpts) => {
                const groupingOptions = [...$gOpts].map((opt) => opt.value);

                getSequencerSelect().find('option').then(($seqOpts) => {
                    const sequencerOptions = [...$seqOpts].map((opt) => opt.value);

                    // For each Assay, fetch its corresponding QC metrics and sample sources dynamically
                    getAssaySelect().find('option').then(($aOpts) => {
                        const assayOptions = [...$aOpts].map((opt) => opt.value);

                        Cypress._.shuffle(assayOptions).forEach((assay) => {
                            // Select Assay and ensure change
                            getAssaySelect().select(assay);

                            // After Assay change, get QC metric options for this Assay
                            getQCMetricsCombobox().click();
                            cy.get('[role="option"]').then(($qcOpts) => {
                                let qcMetricOptions = [...$qcOpts].map((opt) => opt.textContent.trim());
                                qcMetricOptions = Cypress._.shuffle(qcMetricOptions).slice(0, 2);

                                // Sample source options can also depend on Assay, so always re-read them
                                getSampleSourceSelect().find('option').then(($sOpts) => {
                                    let sampleSourceOptions = [...$sOpts].map((opt) => opt.value);
                                    sampleSourceOptions = Cypress._.shuffle(sampleSourceOptions).slice(0, 2);

                                    // Iterate through random metrics, groupings, sample sources, and sequencers
                                    qcMetricOptions.forEach((qcMetric) => {
                                        groupingOptions.forEach((grouping) => {
                                            sampleSourceOptions.forEach((sampleSource) => {
                                                sequencerOptions.forEach((sequencer) => {
                                                    // Set all filter selects
                                                    getQCMetricsCombobox().click();
                                                    cy.get('[role="option"]').contains(qcMetric).click();
                                                    getGroupingSelect().select(grouping);
                                                    getSampleSourceSelect().select(sampleSource);
                                                    getSequencerSelect().select(sequencer);

                                                    // Remove [source] from QC metric for axis/table checks
                                                    const qcMetricYTitle = qcMetric.replace(/\s*\[.*?\]/, '').trim();

                                                    // x axis: lower-case except first letter, e.g. "Sample source"
                                                    const groupingXTitle = grouping
                                                        .replace(/_/g, ' ')
                                                        .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.substr(1).toLowerCase());

                                                    // Assertion block: check for either 'no data' or valid chart/table
                                                    cy.wrap($tabPane).find('.boxplot-svg, .text-center:contains("No data available for the selected filters.")', { timeout: 20000 })
                                                        .should('have.length.gte', 1)
                                                        .then(($elements) => {
                                                            const noDataMsg = $elements.filter('.text-center:contains("No data available for the selected filters.")');
                                                            if (noDataMsg.length > 0) {
                                                                cy.wrap(noDataMsg).should('be.visible');
                                                            } else {
                                                                const $svg = $elements.filter('.boxplot-svg').first();
                                                                cy.wrap($svg).within(() => {
                                                                    cy.contains('text', qcMetricYTitle).should('exist');
                                                                    // Use lowercasing for axis match (handle 'Sample source'/'Sample Source')
                                                                    cy.get('text').then(($labels) => {
                                                                        const found = [...$labels].some((el) =>
                                                                            el.textContent.trim().toLowerCase() === groupingXTitle.toLowerCase()
                                                                        );
                                                                        expect(found, `Axis label for ${groupingXTitle} found`).to.be.true;
                                                                    });
                                                                    cy.get('circle.data-point').its('length').should('be.gte', 1);
                                                                });

                                                                // Table assertions (within tab pane scope, not within svg)
                                                                cy.wrap($tabPane).find('.qc-metrics-data-table table').within(() => {
                                                                    cy.get('thead th').eq(2)
                                                                        .should('contain.text', qcMetricYTitle);
                                                                    cy.get('tbody tr').should('have.length.at.least', 1);
                                                                    cy.get('tbody tr').each(($row) => {
                                                                        cy.wrap($row).find('td').eq(6).should('contain.text', assay);
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

    it('Verify Metric vs. Metric - All tab: sample 2x2 QC metrics and 2 sample sources, chart, and table content', () => {
        cy.get('#qc-metrics-tabs')
            .contains('button', 'Metric vs. Metric - All')
            .should('be.visible')
            .click()
            .should('have.class', 'active')
            .and('have.attr', 'aria-selected', 'true');

        cy.get('#qc-metrics-tabs-tabpane-metrics-v-metric').within(($tabPane) => {
            // Helper functions
            const getQCMetricsXCombobox = () => cy.contains('div.fw-bold', 'QC metric (x-axis)').next().find('[role="combobox"]');
            const getQCMetricsYCombobox = () => cy.contains('div.fw-bold', 'QC metric (y-axis)').next().find('[role="combobox"]');
            const getAssaySelect = () => cy.contains('div.fw-bold', 'Assay').next('select.form-select');
            const getSampleSourceSelect = () => cy.contains('div.fw-bold', 'Cell line').next('select.form-select');
            const getSequencerSelect = () => cy.contains('div.fw-bold', 'Sequencer').next('select.form-select');

            getAssaySelect().find('option').then(($aOpts) => {
                const assayOptions = [...$aOpts].map((opt) => opt.value);

                getSequencerSelect().find('option').then(($seqOpts) => {
                    const sequencerOptions = [...$seqOpts].map((opt) => opt.value);

                    Cypress._.shuffle(assayOptions).forEach((assay) => {
                        // Select assay and wait for options to update
                        getAssaySelect().select(assay);

                        getQCMetricsXCombobox().click();
                        cy.get('[role="option"]').then(($xOpts) => {
                            let xMetricOptions = [...$xOpts].map((opt) => opt.textContent.trim());
                            xMetricOptions = Cypress._.shuffle(xMetricOptions).slice(0, 2);

                            getQCMetricsYCombobox().click();
                            cy.get('[role="option"]').then(($yOpts) => {
                                let yMetricOptions = [...$yOpts].map((opt) => opt.textContent.trim());
                                yMetricOptions = Cypress._.shuffle(yMetricOptions).slice(0, 2);

                                getSampleSourceSelect().find('option').then(($sOpts) => {
                                    let sampleSourceOptions = [...$sOpts].map((opt) => opt.value);
                                    sampleSourceOptions = Cypress._.shuffle(sampleSourceOptions).slice(0, 2);

                                    xMetricOptions.forEach((xMetric) => {
                                        yMetricOptions.forEach((yMetric) => {
                                            sampleSourceOptions.forEach((sampleSource) => {
                                                sequencerOptions.forEach((sequencer) => {
                                                    // Set all filter selects and wait for content change
                                                    cy.get('.scatterplot-svg, .text-center:contains("No data available for the selected filters.")')
                                                        .then(($old) => {
                                                            // Select all filters in order
                                                            getQCMetricsXCombobox().click();
                                                            cy.get('[role="option"]').contains(xMetric).click();
                                                            getQCMetricsYCombobox().click();
                                                            cy.get('[role="option"]').contains(yMetric).click();
                                                            getSampleSourceSelect().select(sampleSource);
                                                            getSequencerSelect().select(sequencer);

                                                            // Remove [source] and trim for axis/table checks
                                                            const xMetricTitle = xMetric.replace(/\s*\[.*?\]/, '').trim();
                                                            const yMetricTitle = yMetric.replace(/\s*\[.*?\]/, '').trim();

                                                            // Wait until chart/table content changes
                                                            cy.get('.scatterplot-svg, .text-center:contains("No data available for the selected filters.")', { timeout: 20000 })
                                                                .should(($new) => {
                                                                    expect($new.length, 'new chart or msg should appear').to.be.gte(1);
                                                                    if ($old.length > 0) {
                                                                        const oldHtml = $old[0].outerHTML;
                                                                        const anyChanged = [...$new].some((el) => el.outerHTML !== oldHtml);
                                                                        expect(anyChanged, 'content changed after filters').to.be.true;
                                                                    }
                                                                })
                                                                .then(($elements) => {
                                                                    const noDataMsg = $elements.filter('.text-center:contains("No data available for the selected filters.")');

                                                                    if (noDataMsg.length > 0) {
                                                                        // If no data, just check that the message is visible
                                                                        cy.wrap(noDataMsg).should('be.visible');
                                                                    } else {
                                                                        // Chart assertions
                                                                        const $svg = $elements.filter('.scatterplot-svg').first();
                                                                        cy.wrap($svg).within(() => {
                                                                            cy.contains('text', xMetricTitle).should('exist');
                                                                            cy.contains('text', yMetricTitle).should('exist');
                                                                            cy.get('circle.data-point').its('length').should('be.gte', 1);
                                                                        });

                                                                        // Table assertions (dynamic column indexes)
                                                                        cy.wrap($tabPane).find('.qc-metrics-data-table table').within(() => {
                                                                            cy.get('thead th').then(($ths) => {
                                                                                const headers = [...$ths].map((th) => th.textContent.trim());
                                                                                const assayIdx = headers.indexOf('Assay');
                                                                                expect(assayIdx, 'Assay column index').to.be.gte(0);

                                                                                const xMetricCol = headers.findIndex((h) => h.includes(xMetricTitle));
                                                                                const yMetricCol = headers.findIndex((h) => h.includes(yMetricTitle));
                                                                                expect(xMetricCol, 'X metric column index').to.be.gte(0);
                                                                                expect(yMetricCol, 'Y metric column index').to.be.gte(0);

                                                                                cy.get('tbody tr').should('have.length.at.least', 1);

                                                                                // Check all rows for correct assay value
                                                                                cy.get('tbody tr').each(($row) => {
                                                                                    cy.wrap($row).find('td').eq(assayIdx).should('contain.text', assay);
                                                                                });

                                                                                // Optionally, check metric columns are not empty
                                                                                // cy.get('tbody tr').each(($row) => {
                                                                                //     cy.wrap($row).find('td').eq(xMetricCol).should('not.be.empty');
                                                                                //     cy.wrap($row).find('td').eq(yMetricCol).should('not.be.empty');
                                                                                // });
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

    it('Verify Metric by file tab: file selection, dynamic QC metric chips, chart titles and axes', function () {
        // Go to the Metrics by file tab and activate it
        cy.get('#qc-metrics-tabs')
            .contains('button', 'Metrics by file')
            .should('be.visible')
            .click()
            .should('have.class', 'active')
            .and('have.attr', 'aria-selected', 'true');

        // Work within the "Metrics by file" tab panel
        cy.get('#qc-metrics-tabs-tabpane-metrics-by-file').within(function () {

            // 1. Assert file filter is initially empty
            cy.contains('div.fw-bold', 'File')
                .parent()
                .find('input[role="combobox"]')
                .should('exist')
                .and('have.value', '');

            // 2. QC metric combobox should display correct placeholder when no file is selected
            cy.contains('div.fw-bold', 'QC metric')
                .parent()
                .find('div[id^="react-select-"][id$="-placeholder"]')
                .should('contain.text', 'Select a file to see available QC metrics');

            // 3. Open file combobox and select the first file option
            cy.contains('div.fw-bold', 'File')
                .parent()
                .find('input[role="combobox"]')
                .click();

            cy.get('[role="option"]').should('have.length.gte', 1);

            cy.get('[role="option"]').first().then(function ($opt) {
                const fileName = Cypress.$($opt).text().trim();
                cy.wrap($opt).click();

                // Verify selected file appears in singleValue container
                cy.contains('div.fw-bold', 'File')
                    .parent()
                    .find('[class*="singleValue"], [id$="single-value"]')
                    .should('contain.text', fileName);
            });

            // 4. Assert QC metric chips (label + remove button) and chart titles match
            cy.contains('div.fw-bold', 'QC metric')
                .parent()
                .find('div[role="button"][aria-label^="Remove"]')
                .each(function ($btn, idx) {
                    // Each chip: the previous sibling holds the label (use previousElementSibling for label)
                    const $label = $btn[0].previousElementSibling;
                    if ($label) {
                        const chipLabel = $label.textContent.replace(/×$/, '').trim();
                        const yLabel = chipLabel.replace(/\s*\[.*?\]/, '').trim();

                        // Assert chart title matches chip label exactly
                        cy.get('.qc-boxplot-title').eq(idx).should('have.text', chipLabel);

                        // Assert chart axis labels and at least one data point
                        cy.get('.boxplot-svg').eq(idx).within(function () {
                            cy.contains('text', yLabel).should('exist');
                            cy.contains('text', 'Submission Center').should('exist');
                            cy.get('circle.data-point').should('have.length.gte', 1);
                        });
                    }
                });

            // 5. Remove the first QC metric chip and assert that charts and titles decrease
            cy.contains('div.fw-bold', 'QC metric')
                .parent()
                .find('div[role="button"][aria-label^="Remove"]')
                .then(function ($btns) {
                    const count = $btns.length;
                    if (count > 1) {
                        cy.wrap($btns).first().click();
                        cy.contains('div.fw-bold', 'QC metric')
                            .parent()
                            .find('div[role="button"][aria-label^="Remove"]').should('have.length', count - 1);
                        cy.get('.qc-boxplot-title').should('have.length', count - 1);
                        cy.get('.boxplot-svg').should('have.length', count - 1);
                    }
                });

            // 6. If available, add a new QC metric chip via combobox and assert all counts increase
            cy.contains('div.fw-bold', 'QC metric')
                .parent()
                .find('input[role="combobox"]')
                .click();
            cy.get('[role="option"]').then(function ($options) {
                // Collect current chip labels
                const chipLabels = [];
                cy.contains('div.fw-bold', 'QC metric')
                    .parent()
                    .find('div[role="button"][aria-label^="Remove"]').each(function ($btn) {
                        const $label = $btn[0].previousElementSibling;
                        if ($label) chipLabels.push($label.textContent.replace(/×$/, '').trim());
                    });
                // Find an option that is not currently selected as a chip
                const toAdd = [...$options].find(function (opt) {
                    return !chipLabels.includes(opt.textContent.trim());
                });
                if (toAdd) {
                    cy.wrap(toAdd).click();
                    cy.contains('div.fw-bold', 'QC metric')
                        .parent()
                        .find('div[role="button"][aria-label^="Remove"]').should('have.length.gte', chipLabels.length + 1);
                    cy.get('.qc-boxplot-title').should('have.length.gte', chipLabels.length + 1);
                    cy.get('.boxplot-svg').should('have.length.gte', chipLabels.length + 1);
                }
            });

            // 7. Remove all chips one by one, and assert that charts and titles disappear in sync
            cy.contains('div.fw-bold', 'QC metric')
                .parent()
                .find('div[role="button"][aria-label^="Remove"]').then(function ($btns) {
                    for (let i = $btns.length; i > 0; i--) {
                        cy.contains('div.fw-bold', 'QC metric')
                            .parent()
                            .find('div[role="button"][aria-label^="Remove"]')
                            .first()
                            .click();
                        cy.get('.qc-boxplot-title').should('have.length', i - 1);
                        cy.get('.boxplot-svg').should('have.length', i - 1);
                    }
                });
        });
    });


});
