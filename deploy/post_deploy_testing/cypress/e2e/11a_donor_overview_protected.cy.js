import { cypressVisitHeaders, ROLE_TYPES, BROWSE_STATUS_PARAMS } from "../support";
import { testMatrixPopoverValidation } from "../support/utils/dataMatrixUtils";

/* ---------------------------------------------------------------------
   ROLE MATRIX
   - Define which roles are authenticated and which can run the protected
     donor end-to-end flow.
   - Adjust to match your authorization model.
------------------------------------------------------------------------ */
const ROLE_MATRIX = {
    UNAUTH: {
        label: "Unauthenticated",
        isAuthenticated: false,
        runProtectedDonorFlow: false,

        expectedProtectedDonorsHavingReleasedFilesCount: 0,
        expectedProtectedDonorsCount: 0,
    },
    [ROLE_TYPES.SMAHT_DBGAP]: {
        label: "SMAHT_DBGAP",
        isAuthenticated: true,
        runProtectedDonorFlow: true,

        expectedProtectedDonorsHavingReleasedFilesCount: 3,
        expectedProtectedDonorsCount: 3,
    },
    [ROLE_TYPES.SMAHT_NON_DBGAP]: {
        label: "SMAHT_NON_DBGAP",
        isAuthenticated: true,
        runProtectedDonorFlow: false,

        expectedProtectedDonorsHavingReleasedFilesCount: 0,
        expectedProtectedDonorsCount: 0,
    },
    [ROLE_TYPES.PUBLIC_DBGAP]: {
        label: "PUBLIC_DBGAP",
        isAuthenticated: true,
        runProtectedDonorFlow: true,

        expectedProtectedDonorsHavingReleasedFilesCount: 0,
        expectedProtectedDonorsCount: 3,
    },
    [ROLE_TYPES.PUBLIC_NON_DBGAP]: {
        label: "PUBLIC_NON_DBGAP",
        isAuthenticated: true,
        runProtectedDonorFlow: false,

        expectedProtectedDonorsHavingReleasedFilesCount: 0,
        expectedProtectedDonorsCount: 0,
    },
};

/* ----------------------------- CONSTANTS ----------------------------- */
const BASE_BROWSE_URL =
    `/browse/?type=File&sample_summary.studies=Production&${BROWSE_STATUS_PARAMS}`;
const BASE_PROTECTED_DONOR_SEARCH_URL = "/search/?type=ProtectedDonor";
const BROWSE_BY_PROTECTED_DONOR_URL = `/browse/?type=ProtectedDonor&study=Production&tags=has_released_files&${BROWSE_STATUS_PARAMS}`;

const getBaseUrl = () => Cypress.env("BASE_BROWSE_URL") ?? BASE_BROWSE_URL;

// Safe query appender that works for both bare and existing query strings
const appendParam = (base, key, value) =>
    `${base}${base.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;

// Stable selector for the "Data Summary" card
const summaryCardSel =
    '.donor-view .data-card:has(.header .header-text:contains("Data Summary"))';

// Prior Diagnosis card selector
const priorDiagnosisSel = ".donor-view .data-card.prior-diagnosis";

// Exposures card selector
const exposuresCardSel = ".donor-view .data-card.exposure";

/* ----------------------------- SESSION HELPERS ----------------------------- */
function goto(url = "/", headers = cypressVisitHeaders) {
    cy.visit(url, { headers });
}
function loginIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) cy.loginSMaHT(roleKey).end();
}
function logoutIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) cy.logoutSMaHT();
}

/* ----------------------------- TEXT/DOM UTILS ----------------------------- */
const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

/** Read a numeric statistic (e.g., Tissues/Assays/Files) reliably */
const getNumericStatByLabel = (label) => {
    const baseSel =
        `${summaryCardSel} .donor-statistic:` +
        `has(.donor-statistic-label:contains("${label}")) .donor-statistic-value`;

    // Ensure the container exists/visible before reading values
    cy.get(`${summaryCardSel} .data-summary`, { timeout: 60000 }).should(
        "be.visible"
    );

    // Wait until the value's text matches a numeric pattern (Cypress will retry)
    return cy.contains(baseSel, /^\s*\d+(\.\d+)?\s*$/, { timeout: 60000 }).then(
        ($el) => {
            const txt = $el.text().trim();
            const cleaned = txt.replace(/[^\d.-]/g, "");
            const num = Number(cleaned);
            expect(Number.isNaN(num), `${label} should be a number (raw="${txt}")`)
                .to.be.false;
            return num;
        }
    );
};

/** Read a labeled value inside the Donor Overview section */
const getOverviewValue = (label) => {
    const sel = `${summaryCardSel} .datum-title span:contains("${label}")`;
    return cy
        .get(sel)
        .should("be.visible")
        .closest(".datum")
        .find(".datum-value")
        .should("be.visible")
        .then(($val) => {
            const text = $val.text().trim();
            return { $el: $val, text };
        });
};

/* ----------------------------- VERIFIERS ----------------------------- */
/** Validate Data Summary / Donor Overview for the protected donor view */
const verifyDonorSummary = (expectedDonorId) => {
    cy.get(summaryCardSel, { timeout: 60000 }).should("be.visible");

    cy.get(`${summaryCardSel} .header .header-text`)
        .should("be.visible")
        .and("have.text", "Data Summary");

    cy.get(`${summaryCardSel} .data-card-section .section-title`)
        .should("be.visible")
        .and("have.text", "Donor Overview");

    // Donor ID
    getOverviewValue("Donor ID").then(({ text }) => {
        expect(text.length, "Donor ID should not be empty").to.be.greaterThan(0);
        if (expectedDonorId) expect(text).to.eq(expectedDonorId);
    });

    // Age
    getOverviewValue("Age").then(({ text }) => {
        expect(text.length, "Age should not be empty").to.be.greaterThan(0);
    });

    // Sex
    getOverviewValue("Sex").then(({ text }) => {
        expect(["Male", "Female"], `Sex should be Male or Female (got "${text}")`)
            .to.include(text);
    });

    // Hardy Scale: integer between 0 and 4 inclusive
    getOverviewValue("Hardy Scale").then(({ text }) => {
        const n = Number(text);
        expect(
            Number.isInteger(n),
            `Hardy Scale should be an integer (got "${text}")`
        ).to.be.true;
        expect(n, "Hardy Scale should be between 0 and 4 (inclusive)").to.be.within(
            0,
            4
        );
    });

    // Tier / Bulk WGS Coverage / DSA: "Coming soon" + .coming-soon class
    ["Tier", "Bulk WGS Coverage", "DSA"].forEach((lbl) => {
        getOverviewValue(lbl).then(({ $el, text }) => {
            expect(text, `${lbl} should be "Coming soon"`).to.eq("Coming soon");
            expect(
                $el.hasClass("coming-soon"),
                `${lbl} should have .coming-soon class`
            ).to.be.true;
        });
    });

    // Statistics
    getNumericStatByLabel("Tissues").then((n) => expect(n).to.be.greaterThan(0));
    getNumericStatByLabel("Assays").then((n) => expect(n).to.be.greaterThan(0));
    getNumericStatByLabel("Files").then((n) => expect(n).to.be.greaterThan(0));
};

/** Validate Prior Diagnosis card (protected donors show meaningful content) */
const verifyPriorDiagnosis = () => {
    cy.get(priorDiagnosisSel, { timeout: 20000 })
        .should("be.visible")
        .within(() => {
            cy.get(".header .header-text")
                .should("be.visible")
                .and("have.text", "Prior Diagnosis");

            // Cancer History: Yes/No/Unknown or another non-empty value
            cy.contains(".section-title", /^Cancer History$/)
                .should("be.visible")
                .siblings(".section-body")
                .find("span")
                .invoke("text")
                .then((txt) => {
                    const val = txt.trim();
                    const allowed = ["Yes", "No", "Unknown"];
                    if (!allowed.includes(val)) {
                        expect(
                            val.length,
                            `Cancer History should be Yes/No/Unknown or a non-empty value (got "${val}")`
                        ).to.be.greaterThan(0);
                    }
                });

            // Family Cancer History: Yes/No/N/A
            cy.contains(".section-title", /^Family Cancer History$/)
                .should("be.visible")
                .siblings(".section-body")
                .find("span")
                .invoke("text")
                .then((txt) => {
                    const val = txt.trim();
                    const allowed = ["Yes", "No", "N/A"];
                    expect(
                        allowed,
                        `Family Cancer History should be Yes, No or N/A (got "${val}")`
                    ).to.include(val);
                });

            // Other Diagnosis: should start with "Protected"
            cy.contains(".section-title", /^Other Diagnosis$/)
                .should("be.visible")
                .siblings(".section-body")
                .find("span")
                .invoke("text")
                .then((txt) => {
                    const val = norm(txt);
                    expect(
                        val.startsWith("Protected"),
                        `Other Diagnosis should start with "Protected" (got "${val}")`
                    ).to.be.true;
                });
        });
};

/** Exposures verification (Tobacco/Alcohol visible; "Other Exposures" protected) */
const triggersFrequency = (text) => {
    const t = norm(text).toUpperCase();
    return t !== "" && t !== "--" && t !== "N/A";
};
const readExposureDatum = (cardSel, label) =>
    cy
        .get(`${cardSel} .datum .datum-title:contains("${label}")`)
        .should("be.visible")
        .closest(".datum")
        .find(".datum-value")
        .should("be.visible")
        .invoke("text")
        .then((t) => norm(t));

const verifyExposureByTitle = (title) => {
    const cardSel = `${exposuresCardSel} .exposure-card:has(.exposure-card-header .title:contains("${title}"))`;
    cy.get(cardSel, { timeout: 20000 }).should("be.visible");

    return Cypress.Promise.all([
        readExposureDatum(cardSel, "Duration"),
        readExposureDatum(cardSel, "Frequency"),
        readExposureDatum(cardSel, "Cessation"),
    ]).then(([duration, frequency, cessation]) => {
        const mustCheck = triggersFrequency(duration) || triggersFrequency(cessation);
        if (mustCheck) {
            const allowed = ["Social", "Light", "Moderate", "Heavy"];
            expect(
                allowed,
                `${title} -> Frequency must be one of ${allowed.join(", ")} (got "${frequency}")`
            ).to.include(frequency);
        }
        return { duration, frequency, cessation };
    });
};

const verifyExposures = () => {
    cy.get(`${exposuresCardSel} .header .header-text`, { timeout: 20000 })
        .should("be.visible")
        .and("have.text", "Exposures");

    // Tobacco & Alcohol cards visible and consistent
    verifyExposureByTitle("Tobacco");
    verifyExposureByTitle("Alcohol");

    // Other Exposures: should start with "Protected"
    cy.get(
        `${exposuresCardSel} .data-card-section .section-title:contains("Other Exposures")`
    )
        .should("be.visible")
        .siblings(".section-body")
        .find("span")
        .invoke("text")
        .then((t) => {
            const val = norm(t);
            expect(
                val.startsWith("Protected"),
                `Other Exposures should start with "Protected" (got "${val}")`
            ).to.be.true;
        });
};

/** Header actions: Donor Metadata link visible; Download Donor Manifest disabled */
const verifyHeaderButtons = () => {
    cy.get(".donor-view .view-header", { timeout: 60000 })
        .should("be.visible")
        .first()
        .then(($hdr) => {
            // Debug log of all visible controls (helpful in CI)
            const texts = $hdr
                .find("a,button")
                .toArray()
                .map((el) => norm(el.innerText));
            cy.log("Header controls (a,button):", texts.join(" | "));

            // Try to find the "Donor Metadata" link using multiple strategies
            const findMetadataLink = () => {
                let $link = $hdr.find("a.btn i.icon-users").closest("a");
                if ($link.length) return $link;

                $link = $hdr.find("a[download]").first();
                if ($link.length) return $link;

                $link = $hdr.find('a[href*="/resource-files/"]').first();
                if ($link.length) return $link;

                $link = $hdr
                    .find("a")
                    .filter((_, el) => /donor metadata/i.test(el.innerText || ""))
                    .first();
                if ($link.length) return $link;

                $link = $hdr
                    .find("button")
                    .filter((_, el) => /donor metadata/i.test(el.innerText || ""))
                    .first();
                if ($link.length) return $link;

                return null;
            };

            const $meta = findMetadataLink();
            cy.wrap($meta)
                .should("be.visible")
                .then(($el) => {
                    const tag = ($el.prop("tagName") || "").toLowerCase();
                    if (tag === "a") {
                        const href = $el.attr("href") || "";
                        expect(
                            href.length,
                            "Donor Metadata href should not be empty"
                        ).to.be.greaterThan(0);
                        // Keep this assertion if your deployment always uses /resource-files/
                        expect(href).to.match(/\/resource-files\//);
                    }
                })
                .invoke("text")
                .then((txt) => {
                    expect(norm(txt)).to.match(/donor metadata/i);
                });

            cy.wrap($meta).find("i.icon-users").should("exist");

            // Disabled "Download Donor Manifest" button check
            const $btn = $hdr
                .find("button.download-button")
                .filter((_, el) => /download donor manifest/i.test(el.innerText || ""))
                .first();

            if (!$btn.length) {
                cy.get(".donor-view").then(($view) => {
                    const $globalBtn = $view
                        .find("button.download-button")
                        .filter((_, el) =>
                            /download donor manifest/i.test(el.innerText || "")
                        )
                        .first();
                    cy.wrap($globalBtn)
                        .should("be.visible")
                        .and("be.disabled")
                        .find("i.icon-user")
                        .should("exist");
                });
            } else {
                cy.wrap($btn)
                    .should("be.visible")
                    .and("be.disabled")
                    .find("i.icon-user")
                    .should("exist");
            }
        });
};

/* ----------------------------- MAIN FLOW (Single it) ----------------------------- */
/**
 * What this flow does:
 * 1) Open Production released browse, collect donor facet values, pick 3 random donors.
 * 2) For each donor: open filtered browse, read total file count, go to protected donor view.
 * 3) Validate header controls, Data Summary / Donor Overview, Prior Diagnosis, Exposures,
 *    and donor-scoped Data Matrix (including popovers and totals).
 */
function stepProtectedDonorFlow(caps) {
    if (caps.expectedProtectedDonorsCount === 0) {
        cy.request({
            url: BASE_PROTECTED_DONOR_SEARCH_URL,
            failOnStatusCode: false,
            headers: cypressVisitHeaders,
        }).then((resp) => {
            expect(resp.status).to.equal(404);
        });
        return;
    }

    if (caps.expectedProtectedDonorsHavingReleasedFilesCount === 0) {
        cy.request({
            url: BROWSE_BY_PROTECTED_DONOR_URL,
            failOnStatusCode: false,
            headers: cypressVisitHeaders,
        }).then((resp) => {
            expect(resp.status).to.equal(404);
        });
    }

    const donorFieldSelector = caps.expectedProtectedDonorsHavingReleasedFilesCount > 0 ? '[data-field="donors.display_title"]' : '[data-field="external_id"]';
    const visitUrl = caps.expectedProtectedDonorsHavingReleasedFilesCount > 0 ? BASE_BROWSE_URL : BASE_PROTECTED_DONOR_SEARCH_URL;

    // 1) Start from Production released browse
    cy.visit(visitUrl, { headers: cypressVisitHeaders });
    cy.get("#slow-load-container").should("not.have.class", "visible");
    cy.get(".facet-charts.loading").should("not.exist");
    cy.get(".facets-header .facets-title").should(
        "have.text",
        "Included Properties"
    );

    // 2) Ensure the donors facet is open
    cy.get(donorFieldSelector)
        .then(($facet) => {
            if ($facet.hasClass('closed')) {
                cy.wrap($facet).find('h5').click({ force: true });
            }
        });

    // 2) Collect donors and pick 3 random unique IDs
    cy.get(`${donorFieldSelector} li.facet-list-element`)
        .should("have.length.at.least", 1)
        .then(($lis) => {
            const donors = [...$lis]
                .map((li) => li.getAttribute("data-key"))
                .filter(Boolean);

            const selected = Cypress._.sampleSize(donors, Math.min(3, donors.length));
            if (!selected.includes("ST001")) selected.push("ST001");

            cy.log(`Selected protected donors: ${selected.join(", ")}`);

            // Build donor search URL with selected display_title filters
            let donorSearchUrl = BASE_PROTECTED_DONOR_SEARCH_URL;
            selected.forEach((donorId) => {
                donorSearchUrl = appendParam(donorSearchUrl, "display_title", donorId);
            });

            // 4) Open donor list and iterate
            cy.visit(donorSearchUrl, { headers: cypressVisitHeaders });
            cy.get("#slow-load-container").should("not.have.class", "visible");
            cy.get(".facet-charts.loading").should("not.exist");
            cy.get(".search-result-row[data-row-number]").as("resultRows");
            cy.get("@resultRows").should("have.length", selected.length);


            // 3) Iterate the protected donor flow
            function testVisit(index) {
                if (index >= selected.length) return;

                // Open donor detail
                cy.get("@resultRows").eq(index).as("currentRow");
                cy.get("@currentRow")
                    .find('[data-field="display_title"] a')
                    .then(($a) => {
                        const donorID = $a.text().trim();

                        cy.wrap($a).invoke("removeAttr", "target").click({ force: true });

                        // Protected donor view
                        cy.location("pathname", { timeout: 15000 }).should(
                            "include",
                            "/protected-donors/"
                        );

                        cy.get(".donor-view .view-header .header-text", { timeout: 15000 })
                            .should("be.visible")
                            .and("contain", donorID);

                        // Header buttons (Donor Metadata + disabled manifest)
                        verifyHeaderButtons();

                        // Data Summary / Donor Overview
                        verifyDonorSummary(donorID);

                        // Prior Diagnosis
                        verifyPriorDiagnosis();

                        // Exposures
                        verifyExposures();

                        // Donor-level Data Matrix
                        getNumericStatByLabel("Files").then((n) => {
                            testMatrixPopoverValidation(
                                "#data-matrix-for_donor",
                                {
                                    donors: [donorID],
                                    mustLabels: [],
                                    optionalLabels: [],
                                    expectedLowerLabels: ["Tissues"],
                                    regularBlockCount: 5, // regularBlockCount
                                    rowSummaryBlockCount: 5, // rowSummaryBlockCount
                                    colSummaryBlockCount: 1, // colSummaryBlockCount
                                    expectedFilesCount: n  // totalCountExpected (null → skip strict total check)
                                }
                            );
                        });
                    }).end();

                // Back to list for next donor
                cy.go("back");
                cy.get(".search-result-row[data-row-number]", { timeout: 10000 })
                    .should("have.length.at.least", selected.length)
                    .as("resultRows");

                cy.then(() => testVisit(index + 1));
            }

            testVisit(0);
        });
}

/* ----------------------------- PARAMETRIC SUITE ----------------------------- */
const ROLES_TO_TEST = [
    "UNAUTH",
    ROLE_TYPES.SMAHT_DBGAP,
    ROLE_TYPES.SMAHT_NON_DBGAP,
    ROLE_TYPES.PUBLIC_DBGAP,
    ROLE_TYPES.PUBLIC_NON_DBGAP,
];

describe("Protected Donor Overview by roles", () => {
    ROLES_TO_TEST.forEach((roleKey) => {
        const caps = ROLE_MATRIX[roleKey];
        const label = caps.label || String(roleKey);

        context(`${label} → protected donor flow`, () => {
            before(() => {
                goto("/");
                loginIfNeeded(roleKey);
            });

            after(() => {
                logoutIfNeeded(roleKey);
            });

            it(`Browse three protected donors and verify the protected donor view end-to-end (enabled: ${caps.runProtectedDonorFlow})`, () => {
                if (!caps.runProtectedDonorFlow) {
                    cy.request({
                        url: BASE_PROTECTED_DONOR_SEARCH_URL,
                        failOnStatusCode: false,
                        headers: cypressVisitHeaders,
                    }).then((resp) => {
                        expect(resp.status).to.equal(404);
                    });

                    cy.log("This role is not allowed to view the protected donor pages.");
                    return;
                }
                stepProtectedDonorFlow(caps);
            });
        });
    });
});
