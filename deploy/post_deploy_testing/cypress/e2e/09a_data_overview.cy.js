import { cypressVisitHeaders, ROLE_TYPES } from "../support";
import { dataNavBarItemSelectorStr } from "../support/selectorVars";
import {
    testDonorAssayFilesCoverageToggle,
    testDonorTissueMode,
    testMatrixExportControls,
    testMatrixPopoverValidation,
    testTissueAssayFilesDonorsToggle
} from "../support/utils/dataMatrixUtils";

const EMPTY_DM_PROD_OPTS = {
    donors: [],
    mustLabels: [],
    optionalLabels: [],
    expectedLowerLabels: [],
    expectedFilesCount: 0,
    expectedTissuesCount: null,
    verifyTotalFromApi: true,
};
const BASE_DM_PROD_OPTS = {
    donors: ["SMHT004", "SMHT008", "SMHT009"],
    mustLabels: ["3AD - Skin, Calf", "3S - Heart", "3A - Whole Blood"],
    optionalLabels: [],
    expectedLowerLabels: ["Total Donors", "Total Files"],
    expectedFilesCount: 40,
    expectedTissuesCount: null,
    verifyTotalFromApi: true,
};
const BASE_DM_BENCHMARKING_OPTS = {
    donors: ["ST001", "ST002", "ST003", "ST004"],
    mustLabels: [],
    optionalLabels: ["Skin, Abdomen", "Lung", "Brain", "Liver", "Colon, Asc"],
    expectedLowerLabels: ["Total Cell Lines", "Total Files", "Total Benchmarking Donors", "Total Files"],
    expectedFilesCount: 50,
    expectedTissuesCount: null,
    verifyTotalFromApi: true,
};

/* ----------------------------- ROLE MATRIX -----------------------------
   Toggle each step per role:

   - runRetractedFilesList:     "Retracted Files" + "Renamed Files" sections + detail checks
   - runDataMatrixProduction:   Data Matrix (Production) + popover checks
   - runDataMatrixBenchmarking: Data Matrix (Benchmarking) + popover checks
------------------------------------------------------------------------- */
const ROLE_MATRIX = {
    UNAUTH: {
        label: "Unauthenticated",
        isAuthenticated: false,

        runRetractedFilesList: false,
        runDataMatrixProduction: false,
        runDataMatrixBenchmarking: false,

        expectedRetractedFilesMenuVisible: false,
        expectedRetractedFilesResponseCode: 403,
        expectedRetractedFilesCount: 5,
        expectedRenamedFilesCount: 0,
        expectedDataMatrixMenuVisible: true,
        expectedDataMatrixResponseCode: 403,
        expectedDataMatrixProductionOpts: EMPTY_DM_PROD_OPTS,
        expectedDataMatrixBenchmarkingOpts: BASE_DM_BENCHMARKING_OPTS,
    },

    [ROLE_TYPES.SMAHT_DBGAP]: {
        label: "SMAHT_DBGAP",
        isAuthenticated: true,

        runRetractedFilesList: true,
        runDataMatrixProduction: true,
        runDataMatrixBenchmarking: true,

        expectedRetractedFilesMenuVisible: true,
        expectedRetractedFilesResponseCode: 200,
        expectedRetractedFilesCount: 5,
        expectedRenamedFilesCount: 5,
        expectedDataMatrixMenuVisible: true,
        expectedDataMatrixResponseCode: 200,
        expectedDataMatrixProductionOpts: BASE_DM_PROD_OPTS,
        expectedDataMatrixBenchmarkingOpts: BASE_DM_BENCHMARKING_OPTS,
    },

    [ROLE_TYPES.SMAHT_NON_DBGAP]: {
        label: "SMAHT_NON_DBGAP",
        isAuthenticated: true,

        runRetractedFilesList: true,
        runDataMatrixProduction: true,
        runDataMatrixBenchmarking: true,

        expectedRetractedFilesMenuVisible: true,
        expectedRetractedFilesResponseCode: 200,
        expectedRetractedFilesCount: 0,
        expectedRenamedFilesCount: 5,
        expectedDataMatrixMenuVisible: true,
        expectedDataMatrixResponseCode: 200,
        expectedDataMatrixProductionOpts: BASE_DM_PROD_OPTS,
        expectedDataMatrixBenchmarkingOpts: BASE_DM_BENCHMARKING_OPTS,
    },

    [ROLE_TYPES.PUBLIC_DBGAP]: {
        label: "PUBLIC_DBGAP",
        isAuthenticated: true, // set to false if truly public in your app

        runRetractedFilesList: false,
        runDataMatrixProduction: false,
        runDataMatrixBenchmarking: false,

        expectedRetractedFilesMenuVisible: true,
        expectedRetractedFilesResponseCode: 403,
        expectedRetractedFilesCount: 0,
        expectedRenamedFilesCount: 0,
        expectedDataMatrixMenuVisible: true,
        expectedDataMatrixResponseCode: 403,
        expectedDataMatrixProductionOpts: EMPTY_DM_PROD_OPTS,
        expectedDataMatrixBenchmarkingOpts: BASE_DM_BENCHMARKING_OPTS,
    },

    [ROLE_TYPES.PUBLIC_NON_DBGAP]: {
        label: "PUBLIC_NON_DBGAP",
        isAuthenticated: true, // set to false if not logged in

        runRetractedFilesList: false,
        runDataMatrixProduction: false,
        runDataMatrixBenchmarking: false,

        expectedRetractedFilesMenuVisible: true,
        expectedRetractedFilesResponseCode: 403,
        expectedRetractedFilesCount: 0,
        expectedRenamedFilesCount: 0,
        expectedDataMatrixMenuVisible: true,
        expectedDataMatrixResponseCode: 403,
        expectedDataMatrixProductionOpts: EMPTY_DM_PROD_OPTS,
        expectedDataMatrixBenchmarkingOpts: BASE_DM_BENCHMARKING_OPTS,
    },
};

/* ----------------------------- SESSION HELPERS ----------------------------- */

function goto({ url = "/", headers = cypressVisitHeaders, failOnStatusCode = true }) {
    cy.visit(url, { headers, failOnStatusCode });
}

function loginIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) cy.loginSMaHT(roleKey).end();
}

function logoutIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) cy.logoutSMaHT();
}

/* ----------------------------- STEP HELPERS ----------------------------- */

/**
 * Recursively visits each row in a files table, navigates to the file page,
 * runs optional in-page assertions, then returns. Shared by both Retracted and
 * Renamed sections.
 */
function testVisitRows({ tableSelector, dataField, countCap, rowAlias, assertOnFilePage }) {
    function visit(index) {
        if (index >= countCap) return;

        cy.get(`@${rowAlias}`).eq(index).as("currentRow");

        cy.get("@currentRow")
            .find(`[data-field="${dataField}"] .value`)
            .should("not.be.empty");

        cy.get("@currentRow")
            .find('[data-field="accession"] a')
            .then(($a) => {
                const expectedAccession = $a.text().trim();

                // shadow overlay at table bottom covers rows near the fold;
                // force bypasses Cypress actionability check
                cy.wrap($a).invoke("removeAttr", "target").click({ force: true });

                cy.get(".file-view-header", { timeout: 10000 }).should("be.visible");

                if (assertOnFilePage) assertOnFilePage();

                cy.get(".accession")
                    .should("be.visible")
                    .and("have.text", expectedAccession);
            });

        cy.go("back");

        cy.get(`${tableSelector} .search-result-row[data-row-number]`, { timeout: 10000 })
            .should("have.length.at.least", countCap)
            .as(rowAlias);

        cy.then(() => visit(index + 1));
    }
    visit(0);
}

/** Retracted and Renamed Files sections + row-by-row detail checks */
function stepVisitRetractedFilesList(caps) {

    cy.get(dataNavBarItemSelectorStr)
        .should("have.class", "dropdown-toggle")
        .click()
        .should("have.class", "dropdown-open-for")
        .then(() => {
            cy.get('.big-dropdown-menu.is-open a.big-link[href="/retracted-files"]')
                .click({ force: true })
                .then(($linkElem) => {
                    cy.get("#slow-load-container").should("not.have.class", "visible").end();
                    const linkHref = $linkElem.attr("href");
                    cy.location("pathname").should("equal", linkHref);
                });

            // --- Retracted Files section ---
            cy.contains("div#retracted-files h2.section-title", "List of Retracted Files")
                .should("be.visible");

            if (caps.expectedRetractedFilesCount > 0) {
                cy.get(".retracted-files-table .search-result-row[data-row-number]").as("retractedRows");
                cy.get("@retractedRows").should("have.length.at.least", caps.expectedRetractedFilesCount);

                testVisitRows({
                    tableSelector: ".retracted-files-table",
                    dataField: "retraction_reason",
                    countCap: caps.expectedRetractedFilesCount,
                    rowAlias: "retractedRows",
                    assertOnFilePage: () => {
                        cy.get(".status-group .file-status")
                            .should("be.visible")
                            .and("contain.text", "Retracted");
                        cy.get(".callout.warning .callout-text")
                            .should("contain.text", "was retracted");
                    },
                });
            } else if (caps.expectedRetractedFilesCount === 0) {
                cy.get(".retracted-files-table .search-results-container", { timeout: 10000 })
                    .should("contain.text", "No Results");
            }

            // --- Renamed Files section ---
            cy.contains("div#renamed-files h2.section-title", "List of Renamed Files")
                .should("be.visible");

            if (caps.expectedRenamedFilesCount > 0) {
                cy.get(".renamed-files-table .search-result-row[data-row-number]").as("renamedRows");
                cy.get("@renamedRows").should("have.length.at.least", caps.expectedRenamedFilesCount);

                testVisitRows({
                    tableSelector: ".renamed-files-table",
                    dataField: "renamed_on_tag",
                    countCap: caps.expectedRenamedFilesCount,
                    rowAlias: "renamedRows",
                });
            } else if (caps.expectedRenamedFilesCount === 0) {
                cy.get(".renamed-files-table .search-results-container", { timeout: 10000 })
                    .should("contain.text", "No Results");
            }
        })
        .end();
}

function openDataMatrixPageFromMenu() {
    cy.get(dataNavBarItemSelectorStr)
        .should("have.class", "dropdown-toggle")
        .click()
        .should("have.class", "dropdown-open-for")
        .then(() => {
            cy.get('.big-dropdown-menu.is-open a.big-link[href="/data-matrix"]')
                .click({ force: true })
                .then(($linkElem) => {
                    cy.get("#slow-load-container").should("not.have.class", "visible").end();
                    const linkHref = $linkElem.attr("href");
                    cy.location("pathname").should("equal", linkHref);
                });

            cy.contains("div#page-title-container h1.page-title", "Data Matrix")
                .should("be.visible");

            cy.get(".tabs-loading-overlay", { timeout: 20000 }).should("not.exist");
        })
        .end();
}

function activateProductionDataMatrix(caps) {
    openDataMatrixPageFromMenu();

    cy.get("body").then(($body) => {
        const $titleEl = Cypress.$($body)
            .find(".tab-header .title")
            .filter((_, el) => Cypress.$(el).text().trim() === "Production Data");

        if ($titleEl.length === 0) {
            cy.get("#data-matrix-for_production")
                .parents(".tab-card")
                .should("have.css", "display", "none");
            expect(caps.expectedDataMatrixProductionOpts.expectedFilesCount).to.equal(0);
            cy.log("Production tab hidden (no data).");
            return;
        }

        const $headerBtn = $titleEl.closest(".tab-header");
        cy.wrap($headerBtn)
            .should("be.visible")
            .click();

        cy.get("#data-matrix-for_production")
            .parents(".tab-card")
            .should("have.class", "is-active")
            .and("have.attr", "aria-hidden", "false");
    });
}

function activateBenchmarkingDataMatrix() {
    openDataMatrixPageFromMenu();

    cy.contains(".tab-header .title", "Benchmarking Data")
        .closest(".tab-header")
        .should("be.visible")
        .click();

    cy.get("#data-matrix-for_benchmarking")
        .parents(".tab-card")
        .should("have.class", "is-active")
        .and("have.attr", "aria-hidden", "false");
}

/** Data Matrix (Production) — expand donors and validate popovers */
function stepDataMatrixProductionPopovers(caps) {
    activateProductionDataMatrix(caps);

    cy.get("body").then(($body) => {
        const $titleEl = Cypress.$($body)
            .find(".tab-header .title")
            .filter((_, el) => Cypress.$(el).text().trim() === "Production Data");

        if ($titleEl.length === 0) {
            return;
        }

        testMatrixPopoverValidation(
            "#data-matrix-for_production",
            caps.expectedDataMatrixProductionOpts
        );
    });
}

function stepDataMatrixProductionDonorAssayCoverage(caps) {
    activateProductionDataMatrix(caps);

    cy.get("body").then(($body) => {
        const $titleEl = Cypress.$($body)
            .find(".tab-header .title")
            .filter((_, el) => Cypress.$(el).text().trim() === "Production Data");

        if ($titleEl.length === 0) {
            return;
        }

        testDonorAssayFilesCoverageToggle("#data-matrix-for_production");
    });
}

function stepDataMatrixProductionTissueAssayToggle(caps) {
    activateProductionDataMatrix(caps);

    cy.get("body").then(($body) => {
        const $titleEl = Cypress.$($body)
            .find(".tab-header .title")
            .filter((_, el) => Cypress.$(el).text().trim() === "Production Data");

        if ($titleEl.length === 0) {
            return;
        }

        cy.contains("#data-matrix-for_production .matrix-mode-tab", "Tissue x Assay")
            .click({ force: true })
            .should("have.class", "active");

        testTissueAssayFilesDonorsToggle("#data-matrix-for_production");
    });
}

function stepDataMatrixProductionDonorTissueMode(caps) {
    activateProductionDataMatrix(caps);

    cy.get("body").then(($body) => {
        const $titleEl = Cypress.$($body)
            .find(".tab-header .title")
            .filter((_, el) => Cypress.$(el).text().trim() === "Production Data");

        if ($titleEl.length === 0) {
            return;
        }

        testDonorTissueMode("#data-matrix-for_production");
    });
}

/** Data Matrix (Benchmarking) — expand donors/cell lines and validate popovers */
function stepDataMatrixBenchmarkingPopovers(caps) {
    activateBenchmarkingDataMatrix();

    testMatrixPopoverValidation(
        "#data-matrix-for_benchmarking",
        caps.expectedDataMatrixBenchmarkingOpts
    );
}

/** Data Matrix (Benchmarking) — verify donor x assay Files/Coverage toggle */
function stepDataMatrixBenchmarkingCoverageToggle() {
    activateBenchmarkingDataMatrix();

    testDonorAssayFilesCoverageToggle("#data-matrix-for_benchmarking");
}

/** Data Matrix (Production) — Export dropdown (Screenshot (PNG) / Export JSON) */
function stepDataMatrixProductionExportControls(caps) {
    activateProductionDataMatrix(caps);

    cy.get("body").then(($body) => {
        const $titleEl = Cypress.$($body)
            .find(".tab-header .title")
            .filter((_, el) => Cypress.$(el).text().trim() === "Production Data");

        if ($titleEl.length === 0) {
            return;
        }

        testMatrixExportControls("#data-matrix-for_production");
    });
}

/** Data Matrix (Benchmarking) — Export dropdown (Screenshot (PNG) / Export JSON) */
function stepDataMatrixBenchmarkingExportControls() {
    activateBenchmarkingDataMatrix();

    testMatrixExportControls("#data-matrix-for_benchmarking");
}

function assertCanSeeRetractedFilesMenu(caps) {
    cy.get(dataNavBarItemSelectorStr)
        .should("have.class", "dropdown-toggle")
        .click()
        .should("have.class", "dropdown-open-for")
        .then(() => {
            const menuItem = cy.get('.big-dropdown-menu.is-open a.big-link[href="/retracted-files"]');
            caps.expectedRetractedFilesMenuVisible
                ? menuItem.should("be.visible")
                : menuItem.should("not.exist");
        })
        .end();
}

function assertCannotAccessRetractedFilesPage(caps) {
    goto({ url: "/retracted-files", failOnStatusCode: false });

    cy.contains("h1.page-title", "Forbidden").should("be.visible");

    cy.request({
        url: "/retracted-files",
        failOnStatusCode: false,
        headers: cypressVisitHeaders,
    }).then((resp) => {
        expect(resp.status).to.equal(caps.expectedRetractedFilesResponseCode);
    });
}

function assertCannotAccessDataMatrixPage(caps) {
    goto({ url: "/data-matrix", failOnStatusCode: false });

    cy.contains("h1.page-title", "Forbidden").should("be.visible");

    cy.request({
        url: "/data-matrix",
        failOnStatusCode: false,
        headers: cypressVisitHeaders,
    }).then((resp) => {
        expect(resp.status).to.equal(caps.expectedDataMatrixResponseCode);
    });
}

function stepVerifyDataMatrixHashRouting() {
    goto({ url: "/data-matrix#benchmarking" });

    cy.contains("div#page-title-container h1.page-title", "Data Matrix")
        .should("be.visible");

    cy.get(".tabs-loading-overlay", { timeout: 20000 }).should("not.exist");
    cy.location("hash").should("equal", "#benchmarking");

    cy.contains(".tab-header .title", "Benchmarking Data")
        .closest(".tab-header")
        .should("have.class", "is-active");

    cy.get("#data-matrix-for_benchmarking").should("exist");
    cy.get("#data-matrix-for_production").should("not.exist");
    cy.contains(".matrix-panel-title h2", "Benchmarking Data Matrix")
        .should("be.visible");

    goto({ url: "/data-matrix#production" });

    cy.contains("div#page-title-container h1.page-title", "Data Matrix")
        .should("be.visible");

    cy.get(".tabs-loading-overlay", { timeout: 20000 }).should("not.exist");
    cy.location("hash").should("equal", "#production");

    cy.contains(".tab-header .title", "Production Data")
        .closest(".tab-header")
        .should("have.class", "is-active");

    cy.get("#data-matrix-for_production").should("exist");
    cy.get("#data-matrix-for_benchmarking").should("not.exist");
    cy.contains(".matrix-panel-title h2", "Production Data Matrix")
        .should("be.visible");
}

/* ----------------------------- PARAMETERIZED SUITE ----------------------------- */

const ROLES_TO_TEST = [
    "UNAUTH",
    ROLE_TYPES.SMAHT_DBGAP,
    ROLE_TYPES.SMAHT_NON_DBGAP,
    ROLE_TYPES.PUBLIC_DBGAP,
    ROLE_TYPES.PUBLIC_NON_DBGAP,
];

describe("Data Overview by role", () => {
    ROLES_TO_TEST.forEach((roleKey) => {
        const caps = ROLE_MATRIX[roleKey];
        const label = caps.label || String(roleKey);

        context(`${label} → data overview capabilities`, () => {
            before(() => {
                goto("/");
                loginIfNeeded(roleKey);
            });

            after(() => {
                logoutIfNeeded(roleKey);
            });

            it(`Retracted and Renamed Files lists (enabled: ${caps.runRetractedFilesList})`, () => {
                if (!caps.runRetractedFilesList) {
                    assertCanSeeRetractedFilesMenu(caps);
                    assertCannotAccessRetractedFilesPage(caps);
                    return;
                }
                stepVisitRetractedFilesList(caps);
            });

            context(`Data Matrix — Production (enabled: ${caps.runDataMatrixProduction})`, () => {
                it("hash routing between #benchmarking and #production", () => {
                    if (!caps.runDataMatrixProduction) {
                        assertCannotAccessDataMatrixPage(caps);
                        return;
                    }
                    stepVerifyDataMatrixHashRouting();
                });

                it("Production Data tab — popovers and total reconciliation", () => {
                    if (!caps.runDataMatrixProduction) {
                        assertCannotAccessDataMatrixPage(caps);
                        return;
                    }
                    stepDataMatrixProductionPopovers(caps);
                });

                it("Production Data tab — Donor x Assay Files/Coverage toggle, left-panel count parity, and coverage-popover match", () => {
                    if (!caps.runDataMatrixProduction) {
                        assertCannotAccessDataMatrixPage(caps);
                        return;
                    }
                    stepDataMatrixProductionDonorAssayCoverage(caps);
                });

                it("Production Data tab — Tissue x Assay Files/Donors toggle and summary-band consistency", () => {
                    if (!caps.runDataMatrixProduction) {
                        assertCannotAccessDataMatrixPage(caps);
                        return;
                    }
                    stepDataMatrixProductionTissueAssayToggle(caps);
                });

                it("Production Data tab — Donor x Tissue tab state, persistent left-panel total, assay dropdown filtering, and summary reconciliation", () => {
                    if (!caps.runDataMatrixProduction) {
                        assertCannotAccessDataMatrixPage(caps);
                        return;
                    }
                    stepDataMatrixProductionDonorTissueMode(caps);
                });

                it("Production Data tab — Export dropdown (Screenshot (PNG) / Export JSON)", () => {
                    if (!caps.runDataMatrixProduction) {
                        assertCannotAccessDataMatrixPage(caps);
                        return;
                    }
                    stepDataMatrixProductionExportControls(caps);
                });
            });

            context(`Data Matrix — Benchmarking (enabled: ${caps.runDataMatrixBenchmarking})`, () => {
                it("Benchmarking Data tab — popovers and total reconciliation", () => {
                    if (!caps.runDataMatrixBenchmarking) {
                        assertCannotAccessDataMatrixPage(caps);
                        return;
                    }
                    stepDataMatrixBenchmarkingPopovers(caps);
                });

                it("Benchmarking Data tab — Donor x Assay Files/Coverage toggle, left-panel count parity, and coverage-popover match", () => {
                    if (!caps.runDataMatrixBenchmarking) {
                        assertCannotAccessDataMatrixPage(caps);
                        return;
                    }
                    stepDataMatrixBenchmarkingCoverageToggle();
                });

                it("Benchmarking Data tab — Export dropdown (Screenshot (PNG) / Export JSON)", () => {
                    if (!caps.runDataMatrixBenchmarking) {
                        assertCannotAccessDataMatrixPage(caps);
                        return;
                    }
                    stepDataMatrixBenchmarkingExportControls();
                });
            });
        });
    });
});
