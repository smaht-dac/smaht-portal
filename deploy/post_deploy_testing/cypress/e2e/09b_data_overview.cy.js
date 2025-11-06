// cypress/e2e/data_overview_qc_metrics_by_role.cy.js
import { cypressVisitHeaders, ROLE_TYPES } from "../support";
import { dataNavBarItemSelectorStr } from "../support/selectorVars";

/**
 * Role capability matrix.
 * - isAuthenticated: we should call cy.loginSMaHT(role) for this role
 * - canViewQCMetrics: this role is allowed to open `/qc-metrics`
 *
 * Adjust this to your portal auth rules.
 */
const ROLE_MATRIX = {
    UNAUTH: {
        label: "Unauthenticated user",
        isAuthenticated: false,
        canViewQCMetrics: false,

        expectedQCMetricsMenuVisible: false,
        expectedQCMetricsResponseCode: 403,
    },
    [ROLE_TYPES.SMAHT_DBGAP]: {
        label: "SMAHT_DBGAP",
        isAuthenticated: true,
        canViewQCMetrics: true,

        expectedQCMetricsMenuVisible: true,
        expectedQCMetricsResponseCode: 200,
    },
    [ROLE_TYPES.SMAHT_NON_DBGAP]: {
        label: "SMAHT_NON_DBGAP",
        isAuthenticated: true,
        canViewQCMetrics: true,

        expectedQCMetricsMenuVisible: true,
        expectedQCMetricsResponseCode: 200,
    },
    [ROLE_TYPES.PUBLIC_DBGAP]: {
        label: "PUBLIC_DBGAP",
        isAuthenticated: true,
        canViewQCMetrics: false,

        expectedQCMetricsMenuVisible: true,
        expectedQCMetricsResponseCode: 403,
    },
    [ROLE_TYPES.PUBLIC_NON_DBGAP]: {
        label: "PUBLIC_NON_DBGAP",
        isAuthenticated: true,
        canViewQCMetrics: false,

        expectedQCMetricsMenuVisible: true,
        expectedQCMetricsResponseCode: 403,
    }
};

// main QC tabs we expect
const TAB_LABELS = [
    "Sample Integrity",
    "Key Metrics",
    "Metrics - All",
    "Metric vs. Metric - All",
    "Metrics by file",
];

/**
 * Navigate to /qc-metrics via Data menu.
 * We do it this way to stay close to the real user flow.
 */
function openQCMetricsFromMenu() {
    // go to home
    cy.visit("/", { headers: cypressVisitHeaders });

    // open data menu
    cy.get(dataNavBarItemSelectorStr)
        .should("have.class", "dropdown-toggle")
        .click()
        .should("have.class", "dropdown-open-for")
        .then(() => {
            cy.get('.big-dropdown-menu.is-open a.big-link[href="/qc-metrics"]')
                .click({ force: true })
                .then(($linkElem) => {
                    // wait for loader
                    cy.get("#slow-load-container").should("not.have.class", "visible");
                    // validate location
                    const linkHref = $linkElem.attr("href");
                    cy.location("pathname").should("equal", linkHref);
                    // validate page title
                    cy.contains(
                        "div#qc_visualizations h2.section-title",
                        "QC Metric Visualizations"
                    ).should("be.visible");
                });
        });
}

/* ----------------------------- SESSION HELPERS ----------------------------- */

function goto({ url = "/", headers = cypressVisitHeaders, failOnStatusCode = true }) {
    cy.visit(url, { headers, failOnStatusCode });
}

/**
 * Login / logout helpers to keep role flow clean.
 */
function loginIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) {
        cy.loginSMaHT(roleKey).end();
    }
}

function logoutIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) {
        cy.logoutSMaHT();
    }
}

/**
 * 1) Verify that all QC tabs exist and can be activated
 */
function testAllTabsPresentAndFunctional(caps) {
    cy.get("#qc-metrics-tabs")
        .should("exist")
        .and("be.visible")
        .find("button")
        .should("have.length", TAB_LABELS.length)
        .each((tab, index) => {
            cy.wrap(tab).should("contain.text", TAB_LABELS[index]);
        });

    // Click each tab and ensure it becomes active
    cy.get("#qc-metrics-tabs").within(() => {
        TAB_LABELS.forEach((label) => {
            cy.contains("button", label)
                .click()
                .should("have.class", "active")
                .and("have.attr", "aria-selected", "true");
        });
    });
}

/**
 * 2) Sample Integrity tab validations
 * - combo shows COLO829 by default
 * - we can change to 3 random options
 * - chart updates (x/y ticks) across selected samples
 */
function testSampleIntegrityTab(caps) {
    cy.get("#qc-metrics-tabs")
        .contains("button", "Sample Integrity")
        .should("be.visible")
        .click()
        .should("have.class", "active")
        .and("have.attr", "aria-selected", "true")
        .get("#qc-metrics-tabs-tabpane-sample-integrity")
        .within(() => {
            // react-select single value should be COLO829 at start
            cy.get('div[class$="singleValue"]').should("contain.text", "COLO829");

            // open dropdown
            cy.get('[role="combobox"]').click();

            // pick first non-COLO829 option
            cy.get('[role="option"]').then(($options) => {
                const otherOption = [...$options].find(
                    (opt) => opt.textContent.trim() !== "COLO829"
                );
                if (otherOption) {
                    cy.wrap(otherOption).click();
                }
            });

            // verify it changed
            cy.get('div[class$="singleValue"]').should(
                "not.contain.text",
                "COLO829"
            );

            // now we will collect a few option texts and iterate
            cy.get('[role="combobox"]').click();
            cy.get('[role="option"]').then(($options) => {
                let optionTexts = [...$options].map((opt) => opt.textContent.trim());
                // only use 3 for speed
                optionTexts = Cypress._.shuffle(optionTexts).slice(0, 3);

                let prevXAxisTick = null;
                let prevYAxisTick = null;

                cy.wrap(optionTexts).each((optionText, index) => {
                    cy.get('[role="combobox"]').click();
                    cy.get('[role="option"]').contains(optionText).click().wait(250);
                    cy.get('div[class$="singleValue"]').should("have.text", optionText);

                    // chart checks
                    cy.contains("h4", "Pairwise sample relatedness")
                        .should("be.visible")
                        .parent()
                        .find("svg.sample-contamination-svg")
                        .should("exist")
                        .and("be.visible")
                        .as("chartSvg");

                    cy.get("@chartSvg")
                        .should("contain.text", "Sample A")
                        .and("contain.text", "Sample B");

                    // y-axis tick
                    cy.get("@chartSvg")
                        .find('g.tick[transform^="translate(0,"] text')
                        .first()
                        .invoke("text")
                        .then((yAxisTick) => {
                            // x-axis tick
                            cy.get("@chartSvg")
                                .find("g.tick")
                                .filter((i, el) => {
                                    const tr = el.getAttribute("transform") || "";
                                    return /,0\)?$/.test(tr);
                                })
                                .first()
                                .find("text")
                                .invoke("text")
                                .then((xAxisTick) => {
                                    if (index > 0) {
                                        // after first selection, we expect ticks to change
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
}

/**
 * 3) Key Metrics tab validations:
 * - iterate through predefined assay + sample source combos
 * - SVGs have data points and x-axis label
 * - for RNA-seq: "Tissue Integrity" table row count must match chart data points
 */
function testKeyMetricsTab(caps) {
    cy.get("#qc-metrics-tabs")
        .contains("button", "Key Metrics")
        .should("be.visible")
        .click()
        .should("have.class", "active")
        .and("have.attr", "aria-selected", "true")
        .get("#qc-metrics-tabs-tabpane-key-metrics")
        .within(() => {
            const assayOptions = ["WGS", "RNA-seq"];
            const sampleSourceOptions = [
                "benchmarking_cell_lines",
                "benchmarking_tissues",
                "production_tissues",
            ];

            cy.contains("div.fw-bold", "Assay")
                .parent()
                .find("select.form-select")
                .as("assaySelect");

            cy.contains("div.fw-bold", "Sample Source")
                .parent()
                .find("select.form-select")
                .as("sourceSelect");

            assayOptions.forEach((assay) => {
                cy.get("@assaySelect").select(assay).find("option:selected").should("have.value", assay);

                sampleSourceOptions.forEach((source) => {
                    cy.get("@sourceSelect").select(source).find("option:selected").should("have.value", source);

                    // boxplot(s) must exist and have data
                    cy.get("svg.boxplot-svg")
                        .should("have.length.gte", 1)
                        .each(($svg) => {
                            cy.wrap($svg).find("circle.data-point").its("length").should("be.gte", 1);
                            cy.wrap($svg)
                                .find("text")
                                .then(($texts) => {
                                    const hasXAxisLabel = [...$texts].some(
                                        (el) => el.textContent.trim() === "Submission Center"
                                    );
                                    expect(hasXAxisLabel, 'SVG has "Submission Center" X axis label').to.be.true;
                                });
                        });

                    // extra checks for RNA-seq
                    if (assay === "RNA-seq") {
                        cy.get("div.qc-key-metrics-header")
                            .should("contain.text", "Tissue Integrity")
                            .should("be.visible");
                        cy.get("table.qc-metrics-data-table").should("be.visible");
                        cy.get("table.qc-metrics-data-table tbody tr").then(($rows) => {
                            const rowCount = $rows.length;
                            cy.get("svg.boxplot-svg").each(($svg) => {
                                cy.wrap($svg)
                                    .find("circle.data-point")
                                    .should("have.length", rowCount);
                            });
                        });
                    }
                });
            });
        });
}

/**
 * 4) Metrics - All tab
 * This one is intentionally heavy: we shuffle assays, metrics, sample sources,
 * grouping and sequencer, and then assert either:
 *  - valid boxplot + data table
 *  - or "No data available..." message
 */
function testMetricsAllTab(caps) {
    cy.get("#qc-metrics-tabs")
        .contains("button", "Metrics - All")
        .should("be.visible")
        .click()
        .should("have.class", "active")
        .and("have.attr", "aria-selected", "true");

    cy.get("#qc-metrics-tabs-tabpane-all-metrics").within(($tabPane) => {
        const getQCMetricsCombobox = () => cy.get("[role='combobox']").first();
        const getGroupingSelect = () =>
            cy.contains("div.fw-bold", "Grouping").next("select.form-select");
        const getAssaySelect = () =>
            cy.contains("div.fw-bold", "Assay").next("select.form-select");
        const getSampleSourceSelect = () =>
            cy.contains("div.fw-bold", "Cell line").next("select.form-select");
        const getSequencerSelect = () =>
            cy.contains("div.fw-bold", "Sequencer").next("select.form-select");

        getGroupingSelect().find("option").then(($gOpts) => {
            const groupingOptions = [...$gOpts].map((opt) => opt.value);

            getSequencerSelect().find("option").then(($seqOpts) => {
                const sequencerOptions = [...$seqOpts].map((opt) => opt.value);

                getAssaySelect().find("option").then(($aOpts) => {
                    const assayOptions = [...$aOpts].map((opt) => opt.value);

                    Cypress._.shuffle(assayOptions).forEach((assay) => {
                        // select assay
                        getAssaySelect().select(assay);

                        // open QC metric list for this assay
                        getQCMetricsCombobox().click();
                        cy.get("[role='option']").then(($qcOpts) => {
                            let qcMetricOptions = [...$qcOpts].map((opt) =>
                                opt.textContent.trim()
                            );
                            // pick 2 for speed
                            qcMetricOptions = Cypress._.shuffle(qcMetricOptions).slice(0, 2);

                            getSampleSourceSelect().find("option").then(($sOpts) => {
                                let sampleSourceOptions = [...$sOpts].map((opt) => opt.value);
                                sampleSourceOptions = Cypress._.shuffle(sampleSourceOptions).slice(
                                    0,
                                    2
                                );

                                qcMetricOptions.forEach((qcMetric) => {
                                    groupingOptions.forEach((grouping) => {
                                        sampleSourceOptions.forEach((sampleSource) => {
                                            sequencerOptions.forEach((sequencer) => {
                                                // set filters
                                                getQCMetricsCombobox().click();
                                                cy.get("[role='option']").contains(qcMetric).click();
                                                getGroupingSelect().select(grouping);
                                                getSampleSourceSelect().select(sampleSource);
                                                getSequencerSelect().select(sequencer);

                                                const qcMetricYTitle = qcMetric
                                                    .replace(/\s*\[.*?\]/, "")
                                                    .trim();

                                                const groupingXTitle = grouping
                                                    .replace(/_/g, " ")
                                                    .replace(/\w\S*/g, (w) => {
                                                        return (
                                                            w.charAt(0).toUpperCase() +
                                                            w.substr(1).toLowerCase()
                                                        );
                                                    });

                                                // check either "no data" or valid chart+table
                                                cy.wrap($tabPane)
                                                    .find(
                                                        '.boxplot-svg, .text-center:contains("No data available for the selected filters.")',
                                                        { timeout: 20000 }
                                                    )
                                                    .should("have.length.gte", 1)
                                                    .then(($elements) => {
                                                        const noDataMsg = $elements.filter(
                                                            '.text-center:contains("No data available for the selected filters.")'
                                                        );

                                                        if (noDataMsg.length > 0) {
                                                            // no data case
                                                            cy.wrap(noDataMsg).should("be.visible");
                                                        } else {
                                                            // chart case
                                                            const $svg = $elements.filter(".boxplot-svg").first();
                                                            cy.wrap($svg).within(() => {
                                                                cy.contains("text", qcMetricYTitle).should(
                                                                    "exist"
                                                                );
                                                                cy.get("text").then(($labels) => {
                                                                    const found = [...$labels].some(
                                                                        (el) =>
                                                                            el.textContent.trim().toLowerCase() ===
                                                                            groupingXTitle.toLowerCase()
                                                                    );
                                                                    expect(
                                                                        found,
                                                                        `Axis label for ${groupingXTitle} found`
                                                                    ).to.be.true;
                                                                });
                                                                cy.get("circle.data-point")
                                                                    .its("length")
                                                                    .should("be.gte", 1);
                                                            });

                                                            // table validations
                                                            cy.wrap($tabPane)
                                                                .find(".qc-metrics-data-table table")
                                                                .within(() => {
                                                                    cy.get("thead th")
                                                                        .eq(2)
                                                                        .should("contain.text", qcMetricYTitle);
                                                                    cy.get("tbody tr").should(
                                                                        "have.length.at.least",
                                                                        1
                                                                    );
                                                                    cy.get("tbody tr").each(($row) => {
                                                                        cy.wrap($row)
                                                                            .find("td")
                                                                            .eq(6)
                                                                            .should("contain.text", assay);
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
}

/**
 * 5) Metric vs. Metric - All tab
 * Similar to above but with two QC metric select boxes (x,y) and scatterplot
 */
function testMetricVsMetricAllTab(caps) {
    cy.get("#qc-metrics-tabs")
        .contains("button", "Metric vs. Metric - All")
        .should("be.visible")
        .click()
        .should("have.class", "active")
        .and("have.attr", "aria-selected", "true");

    cy.get("#qc-metrics-tabs-tabpane-metrics-v-metric").within(($tabPane) => {
        const getQCMetricsXCombobox = () =>
            cy
                .contains("div.fw-bold", "QC metric (x-axis)")
                .next()
                .find("[role='combobox']");
        const getQCMetricsYCombobox = () =>
            cy
                .contains("div.fw-bold", "QC metric (y-axis)")
                .next()
                .find("[role='combobox']");
        const getAssaySelect = () =>
            cy.contains("div.fw-bold", "Assay").next("select.form-select");
        const getSampleSourceSelect = () =>
            cy.contains("div.fw-bold", "Cell line").next("select.form-select");
        const getSequencerSelect = () =>
            cy.contains("div.fw-bold", "Sequencer").next("select.form-select");

        getAssaySelect().find("option").then(($aOpts) => {
            const assayOptions = [...$aOpts].map((opt) => opt.value);

            getSequencerSelect()
                .find("option")
                .then(($seqOpts) => {
                    const sequencerOptions = [...$seqOpts].map((opt) => opt.value);

                    Cypress._.shuffle(assayOptions).forEach((assay) => {
                        getAssaySelect().select(assay);

                        // pull x-metric options
                        getQCMetricsXCombobox().click();
                        cy.get("[role='option']").then(($xOpts) => {
                            let xMetricOptions = [...$xOpts].map((opt) =>
                                opt.textContent.trim()
                            );
                            xMetricOptions = Cypress._.shuffle(xMetricOptions).slice(0, 2);

                            // pull y-metric options
                            getQCMetricsYCombobox().click();
                            cy.get("[role='option']").then(($yOpts) => {
                                let yMetricOptions = [...$yOpts].map((opt) =>
                                    opt.textContent.trim()
                                );
                                yMetricOptions = Cypress._.shuffle(yMetricOptions).slice(0, 2);

                                // sample source
                                getSampleSourceSelect().find("option").then(($sOpts) => {
                                    let sampleSourceOptions = [...$sOpts].map((opt) => opt.value);
                                    sampleSourceOptions = Cypress._.shuffle(
                                        sampleSourceOptions
                                    ).slice(0, 2);

                                    xMetricOptions.forEach((xMetric) => {
                                        yMetricOptions.forEach((yMetric) => {
                                            sampleSourceOptions.forEach((sampleSource) => {
                                                sequencerOptions.forEach((sequencer) => {
                                                    // capture old content
                                                    cy.get(
                                                        '.scatterplot-svg, .text-center:contains("No data available for the selected filters.")'
                                                    ).then(($old) => {
                                                        // set filters
                                                        getQCMetricsXCombobox().click();
                                                        cy.get("[role='option']").contains(xMetric).click();
                                                        getQCMetricsYCombobox().click();
                                                        cy.get("[role='option']").contains(yMetric).click();
                                                        getSampleSourceSelect().select(sampleSource);
                                                        getSequencerSelect().select(sequencer);

                                                        const xMetricTitle = xMetric
                                                            .replace(/\s*\[.*?\]/, "")
                                                            .trim();
                                                        const yMetricTitle = yMetric
                                                            .replace(/\s*\[.*?\]/, "")
                                                            .trim();

                                                        // wait for content
                                                        cy.get(
                                                            '.scatterplot-svg, .text-center:contains("No data available for the selected filters.")',
                                                            { timeout: 20000 }
                                                        )
                                                            .should(($new) => {
                                                                expect(
                                                                    $new.length,
                                                                    "new chart or msg should appear"
                                                                ).to.be.gte(1);
                                                                if ($old.length > 0) {
                                                                    const oldHtml = $old[0].outerHTML;
                                                                    const anyChanged = [...$new].some(
                                                                        (el) => el.outerHTML !== oldHtml
                                                                    );
                                                                    expect(
                                                                        anyChanged,
                                                                        "content changed after filters"
                                                                    ).to.be.true;
                                                                }
                                                            })
                                                            .then(($elements) => {
                                                                const noDataMsg = $elements.filter(
                                                                    '.text-center:contains("No data available for the selected filters.")'
                                                                );

                                                                if (noDataMsg.length > 0) {
                                                                    cy.wrap(noDataMsg).should("be.visible");
                                                                } else {
                                                                    // chart assertions
                                                                    const $svg = $elements
                                                                        .filter(".scatterplot-svg")
                                                                        .first();
                                                                    cy.wrap($svg).within(() => {
                                                                        cy.contains("text", xMetricTitle).should(
                                                                            "exist"
                                                                        );
                                                                        cy.contains("text", yMetricTitle).should(
                                                                            "exist"
                                                                        );
                                                                        cy.get("circle.data-point")
                                                                            .its("length")
                                                                            .should("be.gte", 1);
                                                                    });

                                                                    // table assertions
                                                                    cy.wrap($tabPane)
                                                                        .find(".qc-metrics-data-table table")
                                                                        .within(() => {
                                                                            cy.get("thead th").then(($ths) => {
                                                                                const headers = [...$ths].map((th) =>
                                                                                    th.textContent.trim()
                                                                                );
                                                                                const assayIdx =
                                                                                    headers.indexOf("Assay");
                                                                                expect(
                                                                                    assayIdx,
                                                                                    "Assay column index"
                                                                                ).to.be.gte(0);

                                                                                const xMetricCol = headers.findIndex(
                                                                                    (h) => h.includes(xMetricTitle)
                                                                                );
                                                                                const yMetricCol = headers.findIndex(
                                                                                    (h) => h.includes(yMetricTitle)
                                                                                );
                                                                                expect(
                                                                                    xMetricCol,
                                                                                    "X metric column index"
                                                                                ).to.be.gte(0);
                                                                                expect(
                                                                                    yMetricCol,
                                                                                    "Y metric column index"
                                                                                ).to.be.gte(0);

                                                                                cy.get("tbody tr").should(
                                                                                    "have.length.at.least",
                                                                                    1
                                                                                );
                                                                                cy.get("tbody tr").each(($row) => {
                                                                                    cy.wrap($row)
                                                                                        .find("td")
                                                                                        .eq(assayIdx)
                                                                                        .should("contain.text", assay);
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
}

/**
 * 6) Metrics by file tab
 * - select a file
 * - chips generate charts
 * - remove / add chips and check chart counts
 */
function testMetricsByFileTab(caps) {
    cy.get("#qc-metrics-tabs")
        .contains("button", "Metrics by file")
        .should("be.visible")
        .click()
        .should("have.class", "active")
        .and("have.attr", "aria-selected", "true");

    cy.get("#qc-metrics-tabs-tabpane-metrics-by-file").within(() => {
        // File combobox should be empty at first
        cy.contains("div.fw-bold", "File")
            .parent()
            .find('input[role="combobox"]')
            .should("exist")
            .and("have.value", "");

        // QC metric combobox should show "Select a file..." placeholder
        cy.contains("div.fw-bold", "QC metric")
            .parent()
            .find('div[id^="react-select-"][id$="-placeholder"]')
            .should("contain.text", "Select a file to see available QC metrics");

        // Open file combobox and select first option
        cy.contains("div.fw-bold", "File")
            .parent()
            .find('input[role="combobox"]')
            .click();

        cy.get("[role='option']")
            .should("have.length.gte", 1)
            .first()
            .then(($opt) => {
                const fileName = Cypress.$($opt).text().trim();
                cy.wrap($opt).click();

                cy.contains("div.fw-bold", "File")
                    .parent()
                    .find('[class*="singleValue"], [id$="single-value"]')
                    .should("contain.text", fileName);
            });

        // For each metric chip, check corresponding chart
        cy.contains("div.fw-bold", "QC metric")
            .parent()
            .find('div[role="button"][aria-label^="Remove"]')
            .each(($btn, idx) => {
                const $label = $btn[0].previousElementSibling;
                if ($label) {
                    const chipLabel = $label.textContent.replace(/×$/, "").trim();
                    const yLabel = chipLabel.replace(/\s*\[.*?\]/, "").trim();

                    cy.get(".qc-boxplot-title").eq(idx).should("have.text", chipLabel);

                    cy.get(".boxplot-svg")
                        .eq(idx)
                        .within(() => {
                            cy.contains("text", yLabel).should("exist");
                            cy.contains("text", "Submission Center").should("exist");
                            cy.get("circle.data-point").should("have.length.gte", 1);
                        });
                }
            });

        // Remove first chip (if more than 1)
        cy.contains("div.fw-bold", "QC metric")
            .parent()
            .find('div[role="button"][aria-label^="Remove"]')
            .then(($btns) => {
                const count = $btns.length;
                if (count > 1) {
                    cy.wrap($btns).first().click();
                    cy.contains("div.fw-bold", "QC metric")
                        .parent()
                        .find('div[role="button"][aria-label^="Remove"]')
                        .should("have.length", count - 1);
                    cy.get(".qc-boxplot-title").should("have.length", count - 1);
                    cy.get(".boxplot-svg").should("have.length", count - 1);
                }
            });

        // Add a new metric (if any other option is available)
        cy.contains("div.fw-bold", "QC metric")
            .parent()
            .find('input[role="combobox"]')
            .click();
        cy.get("[role='option']").then(($options) => {
            const chipLabels = [];
            cy.contains("div.fw-bold", "QC metric")
                .parent()
                .find('div[role="button"][aria-label^="Remove"]')
                .each(($btn) => {
                    const $label = $btn[0].previousElementSibling;
                    if ($label)
                        chipLabels.push($label.textContent.replace(/×$/, "").trim());
                });

            const toAdd = [...$options].find(
                (opt) => !chipLabels.includes(opt.textContent.trim())
            );
            if (toAdd) {
                cy.wrap(toAdd).click();
                cy.contains("div.fw-bold", "QC metric")
                    .parent()
                    .find('div[role="button"][aria-label^="Remove"]')
                    .should("have.length.gte", chipLabels.length + 1);
                cy.get(".qc-boxplot-title").should(
                    "have.length.gte",
                    chipLabels.length + 1
                );
                cy.get(".boxplot-svg").should(
                    "have.length.gte",
                    chipLabels.length + 1
                );
            }
        });

        // Finally, remove all chips and ensure charts disappear
        cy.contains("div.fw-bold", "QC metric")
            .parent()
            .within(() => {
                cy.get('div[role="button"][aria-label^="Remove"]').then(($btns) => {
                    const total = $btns.length;

                    for (let idx = 0; idx < total; idx++) {
                        // Re-query inside the loop so we always click the current first chip
                        cy.get('div[role="button"][aria-label^="Remove"]')
                            .first()
                            .scrollIntoView()
                            .click({ force: false });

                        const expected = total - (idx + 1);

                        // Count only VISIBLE titles and svgs to avoid hidden remnants
                        cy.get('.qc-boxplot-title', { timeout: 25000 })
                            .filter(':visible')
                            .should('have.length', expected);
                        cy.get('.boxplot-svg', { timeout: 25000 })
                            .filter(':visible')
                            .should('have.length', expected);
                    }
                });
            });
    });
}

function assertCanSeeQCMetricsMenu(caps) {
    cy.get(dataNavBarItemSelectorStr)
        .should("have.class", "dropdown-toggle")
        .click()
        .should("have.class", "dropdown-open-for")
        .then(() => {
            const menuItem = cy.get('.big-dropdown-menu.is-open a.big-link[href="/qc-metrics"]');
            caps.expectedQCMetricsMenuVisible
                ? menuItem.should("be.visible")
                : menuItem.should("not.exist");
        })
        .end();
}

function assertCannotAccessQCMetricsPage(caps) {
    goto({ url: "/qc-metrics", failOnStatusCode: false });

    cy.contains("h1.page-title", "Forbidden").should("be.visible");

    cy.request({
        url: "/qc-metrics",
        failOnStatusCode: false,
        headers: cypressVisitHeaders,
    }).then((resp) => {
        expect(resp.status).to.equal(caps.expectedQCMetricsResponseCode);
    });
}

/* ------------------------------------------------------------------ */
/* ----------------------- ROLE-BASED SUITE ------------------------- */
/* ------------------------------------------------------------------ */

const ROLES_TO_TEST = [
    "UNAUTH",
    ROLE_TYPES.SMAHT_DBGAP,
    ROLE_TYPES.SMAHT_NON_DBGAP,
    ROLE_TYPES.PUBLIC_DBGAP,
    ROLE_TYPES.PUBLIC_NON_DBGAP,
];

describe("Data Overview - QC Metrics (role-based)", () => {
    ROLES_TO_TEST.forEach((roleKey) => {
        const caps = ROLE_MATRIX[roleKey];
        const label = caps.label || String(roleKey);

        context(`${label} → QC Metrics page`, () => {
            before(() => {
                // home + login
                cy.visit("/", { headers: cypressVisitHeaders });
                loginIfNeeded(roleKey);

                if (caps.canViewQCMetrics) {
                    openQCMetricsFromMenu();
                }
            });

            after(() => {
                logoutIfNeeded(roleKey);
            });

            it(`should open QC Metric Visualizations page (enabled: ${caps.canViewQCMetrics})`, () => {
                if (!caps.canViewQCMetrics) {
                    assertCanSeeQCMetricsMenu(caps);
                    assertCannotAccessQCMetricsPage(caps);

                    cy.log("This role cannot view /qc-metrics, skipping UI checks.");
                    return;
                }
                cy.contains(
                    "div#qc_visualizations h2.section-title",
                    "QC Metric Visualizations"
                ).should("be.visible");
            });

            it("should list and activate all QC tabs", () => {
                if (!caps.canViewQCMetrics) return;
                testAllTabsPresentAndFunctional(caps);
            });

            it("should validate 'Sample Integrity' tab", () => {
                if (!caps.canViewQCMetrics) return;
                testSampleIntegrityTab(caps);
            });

            it("should validate 'Key Metrics' tab", () => {
                if (!caps.canViewQCMetrics) return;
                testKeyMetricsTab(caps);
            });

            it("should validate 'Metrics - All' tab", () => {
                if (!caps.canViewQCMetrics) return;
                testMetricsAllTab(caps);
            });

            it("should validate 'Metric vs. Metric - All' tab", () => {
                if (!caps.canViewQCMetrics) return;
                testMetricVsMetricAllTab(caps);
            });

            it("should validate 'Metrics by file' tab", () => {
                if (!caps.canViewQCMetrics) return;
                testMetricsByFileTab(caps);
            });
        });
    });
});
