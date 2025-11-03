// cypress/e2e/data_overview_by_role.cy.js
import { cypressVisitHeaders, ROLE_TYPES } from "../support";
import { dataNavBarItemSelectorStr } from "../support/selectorVars";
import { testMatrixPopoverValidation } from "../support/utils/dataMatrixUtils";
import * as _ from "underscore";

const EMPTY_DM_PROD_OPTS = {
    donors: [],
    mustLabels: [],
    optionalLabels: [],
    expectedLowerLabels: [],
    expectedFilesCount: 0,
};
const BASE_DM_PROD_OPTS = {
    donors: ["SMHT004", "SMHT008", "SMHT009"],
    mustLabels: ["Non-exposed Skin", "Heart", "Blood"],
    optionalLabels: [],
    expectedLowerLabels: ["Donors"],
    expectedFilesCount: 40,
};
const BASE_DM_BENCHMARKING_OPTS = {
    donors: ["ST001", "ST002", "ST003", "ST004"],
    mustLabels: [],
    optionalLabels: ["Non-exposed Skin", "Lung", "Brain", "Liver", "Ascending Colon"],
    expectedLowerLabels: ["Cell Lines", "Donors"],
    expectedFilesCount: 50,
};

/* ----------------------------- ROLE MATRIX -----------------------------
   Toggle each step per role. Adjust per your app's access model.

   - runRetractedFilesList:     "Retracted Files" page + detail checks
   - runDataMatrixProduction:   Data Matrix (Production) + popover checks
   - runDataMatrixBenchmarking: Data Matrix (Benchmarking) + popover checks
------------------------------------------------------------------------- */
const ROLE_MATRIX = {
    UNAUTH: {
        label: "Unauthenticated",
        isAuthenticated: false,

        runRetractedFilesList: false,
        runDataMatrixProduction: true,
        runDataMatrixBenchmarking: true,

        expectedRetractedFilesMenuVisible: false,
        expectedRetractedFilesResponseCode: 403,
        expectedRetractedFilesCount: 5,
        expectedDataMatrixMenuVisible: true,
        expectedDataMatrixResponseCode: 200,
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
        expectedDataMatrixMenuVisible: true,
        expectedDataMatrixResponseCode: 200,
        expectedDataMatrixProductionOpts: BASE_DM_PROD_OPTS,
        expectedDataMatrixBenchmarkingOpts: BASE_DM_BENCHMARKING_OPTS,
    },

    [ROLE_TYPES.PUBLIC_DBGAP]: {
        label: "PUBLIC_DBGAP",
        isAuthenticated: true, // set to false if truly public in your app

        runRetractedFilesList: false,
        runDataMatrixProduction: true,
        runDataMatrixBenchmarking: true,

        expectedRetractedFilesMenuVisible: true,
        expectedRetractedFilesResponseCode: 403,
        expectedRetractedFilesCount: 0,
        expectedDataMatrixMenuVisible: true,
        expectedDataMatrixResponseCode: 200,
        expectedDataMatrixProductionOpts: EMPTY_DM_PROD_OPTS,
        expectedDataMatrixBenchmarkingOpts: BASE_DM_BENCHMARKING_OPTS,
    },

    [ROLE_TYPES.PUBLIC_NON_DBGAP]: {
        label: "PUBLIC_NON_DBGAP",
        isAuthenticated: true, // set to false if not logged in

        runRetractedFilesList: false,
        runDataMatrixProduction: true,
        runDataMatrixBenchmarking: true,

        expectedRetractedFilesMenuVisible: true,
        expectedRetractedFilesResponseCode: 403,
        expectedRetractedFilesCount: 0,
        expectedDataMatrixMenuVisible: true,
        expectedDataMatrixResponseCode: 200,
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

/** Retracted Files page + row-by-row detail checks (up to 5 rows) */
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

            cy.contains("div#retracted-files h2.section-title", "List of Retracted Files")
                .should("be.visible");

            function testVisit(index) {
                if (index >= caps.expectedRetractedFilesCount) return;

                cy.get("@resultRows").eq(index).as("currentRow");

                cy.get("@currentRow")
                    .find('[data-field="retraction_reason"] .value')
                    .should("not.be.empty");

                cy.get("@currentRow")
                    .find('[data-field="accession"] a')
                    .then(($a) => {
                        const expectedAccession = $a.text().trim();

                        cy.wrap($a).invoke("removeAttr", "target").click();

                        cy.get(".file-view-header", { timeout: 10000 }).should("be.visible");

                        cy.get(".status-group .file-status")
                            .should("be.visible")
                            .and("contain.text", "Retracted");

                        cy.get(".callout.warning .callout-text")
                            .should("contain.text", "was retracted");

                        cy.get(".accession")
                            .should("be.visible")
                            .and("have.text", expectedAccession);
                    });

                cy.go("back");

                cy.get(".search-result-row[data-row-number]", { timeout: 10000 })
                    .should("have.length.at.least", caps.expectedRetractedFilesCount)
                    .as("resultRows");

                cy.then(() => testVisit(index + 1));
            }

            if (caps.expectedRetractedFilesCount > 0) {
                cy.get(".search-result-row[data-row-number]").as("resultRows");
                cy.get("@resultRows").should("have.length.at.least", caps.expectedRetractedFilesCount);

                testVisit(0);
            } else if (caps.expectedRetractedFilesCount === 0) {
                cy.get(".retracted-files-table .search-results-container", { timeout: 10000 })
                    .should("contain.text", "No Results");
            }
        })
        .end();
}

/** Data Matrix (Production) — expand donors and validate popovers */
function stepDataMatrixProduction(caps) {
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

            cy.get('#data-matrix-for_production').then(($el) => {
                const fileCount = $el.attr('data-files-count');

                if (fileCount === '0') {
                    // When data-files-count is 0, the tab should be hidden (display: none)
                    cy.wrap($el)
                        .parents('.tab-card')
                        .should('have.css', 'display', 'none');

                    expect(caps.expectedDataMatrixProductionOpts.expectedFilesCount).to.equal(0);

                    // Stop the test here since the tab is not visible
                    cy.log('Tab is hidden because data-files-count=0. Test stopped here.');
                    return; // exit early
                }

                // If we reach this point, the tab should be visible
                testMatrixPopoverValidation(
                    "#data-matrix-for_production",
                    caps.expectedDataMatrixProductionOpts
                );
            });    
        })
        .end();
}

/** Data Matrix (Benchmarking) — expand donors/cell lines and validate popovers */
function stepDataMatrixBenchmarking(caps) {
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

            testMatrixPopoverValidation(
                "#data-matrix-for_benchmarking",
                caps.expectedDataMatrixBenchmarkingOpts
            );
        })
        .end();
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

        // override caps for data/staging environment
        const baseUrl = Cypress.config().baseUrl || "";
        if ((baseUrl.includes("data.smaht.org") || baseUrl.includes("staging.smaht.org")) && ['UNAUTH', ROLE_TYPES.PUBLIC_DBGAP, ROLE_TYPES.PUBLIC_NON_DBGAP].includes(roleKey)) {
            caps.runDataMatrixBenchmarking = false;
            caps.runDataMatrixProduction = false;
            caps.expectedDataMatrixResponseCode = 403;
        }

        context(`${label} → data overview capabilities`, () => {
            before(() => {
                goto("/");
                loginIfNeeded(roleKey);
            });

            after(() => {
                logoutIfNeeded(roleKey);
            });

            it(`Retracted Files list (enabled: ${caps.runRetractedFilesList})`, () => {
                if (!caps.runRetractedFilesList) {
                    assertCanSeeRetractedFilesMenu(caps);
                    assertCannotAccessRetractedFilesPage(caps);
                    return;
                }
                stepVisitRetractedFilesList(caps);
            });

            it(`Data Matrix — Production (enabled: ${caps.runDataMatrixProduction})`, () => {
                if (!caps.runDataMatrixProduction) {
                    assertCannotAccessDataMatrixPage(caps);
                    return;
                }
                stepDataMatrixProduction(caps);
            });

            it(`Data Matrix — Benchmarking (enabled: ${caps.runDataMatrixBenchmarking})`, () => {
                if (!caps.runDataMatrixBenchmarking) {
                    assertCannotAccessDataMatrixPage(caps);
                    return;
                }
                stepDataMatrixBenchmarking(caps);
            });
        });
    });
});
