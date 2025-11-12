import { cypressVisitHeaders, ROLE_TYPES, BROWSE_STATUS_PARAMS } from "../support";
import { testMatrixPopoverValidation } from "../support/utils/dataMatrixUtils";

/* ----------------------------- ROLE MATRIX ----------------------------- */
const ROLE_MATRIX = {
    UNAUTH: {
        label: "Unauthenticated",
        isAuthenticated: false,
        runPublicDonorFlow: true,

        expectedDonorsHavingReleasedFilesCount: 0,
        expectedDonorsCount: 3,
    },
    [ROLE_TYPES.SMAHT_DBGAP]: {
        label: "SMAHT_DBGAP",
        isAuthenticated: true,
        runPublicDonorFlow: true,

        expectedDonorsHavingReleasedFilesCount: 3,
        expectedDonorsCount: 3,
    },
    [ROLE_TYPES.SMAHT_NON_DBGAP]: {
        label: "SMAHT_NON_DBGAP",
        isAuthenticated: true,
        runPublicDonorFlow: true,

        expectedDonorsHavingReleasedFilesCount: 3,
        expectedDonorsCount: 3,
    },
    [ROLE_TYPES.PUBLIC_DBGAP]: {
        label: "PUBLIC_DBGAP",
        isAuthenticated: true,
        runPublicDonorFlow: true,

        expectedDonorsHavingReleasedFilesCount: 0,
        expectedDonorsCount: 3,
    },
    [ROLE_TYPES.PUBLIC_NON_DBGAP]: {
        label: "PUBLIC_NON_DBGAP",
        isAuthenticated: true,
        runPublicDonorFlow: true,

        expectedDonorsHavingReleasedFilesCount: 0,
        expectedDonorsCount: 3,
    },
};

/* ----------------------------- CONSTANTS ----------------------------- */
const BASE_BROWSE_URL =
    `/browse/?type=File&sample_summary.studies=Production&${BROWSE_STATUS_PARAMS}`;
const BASE_DONOR_SEARCH_URL = "/search/?type=Donor";
const BROWSE_BY_DONOR_URL = `/browse/?type=Donor&study=Production&tags=has_released_files&${BROWSE_STATUS_PARAMS}`;

// Safe query param append (handles both bare and existing query string)
const appendParam = (base, key, value) =>
    `${base}${base.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;

// Stable selector for the "Data Summary" card
const summaryCardSel =
    '.donor-view .data-card:has(.header .header-text:contains("Data Summary"))';

// Stable selector for the "Prior Diagnosis" card
const priorDiagnosisSel = ".donor-view .data-card.prior-diagnosis";

// Stable selector for the "Exposures" card
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

/* ----------------------------- DOM UTILS ----------------------------- */
// Normalize text: trim and collapse whitespace
const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

/** Wait until the statistic value text resolves to a pure number, then parse */
const getNumericStatByLabel = (label) => {
    const baseSel =
        `${summaryCardSel} .donor-statistic:` +
        `has(.donor-statistic-label:contains("${label}")) .donor-statistic-value`;

    // Ensure the summary container exists/visible before reading values
    cy.get(`${summaryCardSel} .data-summary`, { timeout: 60000 }).should(
        "be.visible"
    );

    // Wait until value's text matches a numeric pattern (Cypress retries internally)
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

/** Read the value element and its text for a given label inside the summary card */
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
const verifyDonorSummary = (expectedDonorId) => {
    // Ensure the specific card is present and visible
    cy.get(summaryCardSel, { timeout: 60000 }).should("be.visible");

    // Section header checks
    cy.get(`${summaryCardSel} .header .header-text`)
        .should("be.visible")
        .and("have.text", "Data Summary");

    cy.get(`${summaryCardSel} .data-card-section .section-title`)
        .should("be.visible")
        .and("have.text", "Donor Overview");

    // Donor ID must exactly match expectedDonorId
    getOverviewValue("Donor ID").then(({ text }) => {
        expect(text.length, "Donor ID should not be empty").to.be.greaterThan(0);
        if (expectedDonorId) expect(text).to.eq(expectedDonorId);
    });

    // Age: just ensure non-empty
    getOverviewValue("Age").then(({ text }) => {
        expect(text.length, "Age should not be empty").to.be.greaterThan(0);
    });

    // Sex: must be Male or Female
    getOverviewValue("Sex").then(({ text }) => {
        expect(["Male", "Female"], `Sex should be Male or Female (got "${text}")`)
            .to.include(text);
    });

    // Hardy Scale: integer between 0 and 4 inclusive (COLO829 and DONOR_LB are N/A)
    getOverviewValue("Hardy Scale").then(({ text }) => {
        if (expectedDonorId !== "COLO829" && expectedDonorId !== "DONOR_LB") {
            const n = Number(text);
            expect(
                Number.isInteger(n),
                `Hardy Scale should be an integer (got "${text}")`
            ).to.be.true;
            expect(n, "Hardy Scale should be between 0 and 4 (inclusive)").to.be.within(
                0,
                4
            );
        } else {
            expect(text).to.eq("N/A");
        }
    });

    // Tier: Protected (+ has .coming-soon class)
    getOverviewValue("Tier").then(({ $el, text }) => {
        expect(text, 'Tier should be "Protected"').to.eq("Protected");
        expect(
            $el.hasClass("coming-soon"),
            "Tier value should have .coming-soon class"
        ).to.be.true;
    });

    // Bulk WGS Coverage: Protected (+ class)
    getOverviewValue("Bulk WGS Coverage").then(({ $el, text }) => {
        expect(text, 'Bulk WGS Coverage should be "Protected"').to.eq("Protected");
        expect(
            $el.hasClass("coming-soon"),
            "Bulk WGS Coverage should have .coming-soon class"
        ).to.be.true;
    });

    // DSA: Protected (+ class)
    getOverviewValue("DSA").then(({ $el, text }) => {
        expect(text, 'DSA should be "Protected"').to.eq("Protected");
        expect(
            $el.hasClass("coming-soon"),
            "DSA should have .coming-soon class"
        ).to.be.true;
    });

    // Donor statistics
    getNumericStatByLabel("Tissues").then((n) => expect(n).to.be.greaterThan(0));
    getNumericStatByLabel("Assays").then((n) => expect(n).to.be.greaterThan(0));
    getNumericStatByLabel("Files").then((n) => expect(n).to.be.greaterThan(0));
};

// Verify "Prior Diagnosis" card content for PUBLIC donor: sections should be protected/absent
const verifyPriorDiagnosis = () => {
    cy.get(priorDiagnosisSel, { timeout: 20000 })
        .should("be.visible")
        .within(() => {
            cy.get(".header .header-text")
                .should("be.visible")
                .and("have.text", "Prior Diagnosis");

            // Public donors: these sections do NOT exist
            cy.contains(".section-title", /^Cancer History$/).should("not.exist");
            cy.contains(".section-title", /^Family Cancer History$/).should(
                "not.exist"
            );

            // Protected Data callout exists
            cy.contains('.body .protected-data h4', /^Protected Data$/).should(
                "be.visible"
            );
        });
};

// Verify "Exposures" card for PUBLIC donor: detailed sub-cards should be protected/absent
const verifyExposures = () => {
    cy.get(`${exposuresCardSel} .header .header-text`, { timeout: 20000 })
        .should("be.visible")
        .and("have.text", "Environmental / Lifestyle Exposure");

    // Public donors: detailed cards (e.g., Tobacco / Alcohol) should NOT be present
    const verifyExposureByTitle = (title) => {
        const cardSel = `${exposuresCardSel} .exposure-card:has(.exposure-card-header .title:contains("${title}"))`;
        cy.get(cardSel, { timeout: 20000 }).should("not.exist");
    };
    verifyExposureByTitle("Tobacco");
    verifyExposureByTitle("Alcohol");

    // Protected Data callout exists
    cy.contains('.body .protected-data h4', /^Protected Data$/).should(
        "be.visible"
    );
};

// Verify header controls (public: no direct donor metadata download; donor manifest disabled)
const verifyHeaderButtons = () => {
    cy.get(".donor-view .view-header", { timeout: 60000 })
        .should("be.visible")
        .first()
        .then(($hdr) => {
            // Log all (for debugging)
            const texts = $hdr
                .find("a,button")
                .toArray()
                .map((el) => norm(el.innerText));
            cy.log("Header controls (a,button):", texts.join(" | "));

            // Try to find a “donor metadata” like link by multiple strategies.
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
            if ($meta) {
                // For PUBLIC donor view, metadata link should not be interactable/visible.
                cy.wrap($meta).should("not.exist");
            }

            // "Download Donor Manifest" should be disabled (public donor)
            const $btn = $hdr
                .find("button.download-button")
                .filter((_, el) => /download donor manifest/i.test(el.innerText || ""))
                .first();

            if (!$btn.length) {
                // Fallback: search under donor-view
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

/* ----------------------------- MAIN FLOW ----------------------------- */
function stepPublicDonorFlow(caps) {
    if (caps.expectedDonorsCount === 0) {
        cy.request({
            url: BASE_DONOR_SEARCH_URL,
            failOnStatusCode: false,
            headers: cypressVisitHeaders,
        }).then((resp) => {
            expect(resp.status).to.equal(404);
        });
        return;
    }
    
    if (caps.expectedDonorsHavingReleasedFilesCount === 0) {
        cy.request({
            url: BROWSE_BY_DONOR_URL,
            failOnStatusCode: false,
            headers: cypressVisitHeaders,
        }).then((resp) => {
            expect(resp.status).to.equal(404);
        });
    }

    const donorFieldSelector = caps.expectedDonorsHavingReleasedFilesCount > 0 ? '[data-field="donors.display_title"]' : '[data-field="external_id"]';
    const visitUrl = caps.expectedDonorsHavingReleasedFilesCount > 0 ? BASE_BROWSE_URL : BASE_DONOR_SEARCH_URL;

    // 1) Start from Production released files, ensure facets ready
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

    // 3) Collect donors from facet and pick 3 random (plus COLO829 and ST001 explicitly)
    cy.get(`${donorFieldSelector} li.facet-list-element`)
        .should("have.length.at.least", 1)
        .then(($lis) => {
            const donors = [...$lis]
                .map((li) => li.getAttribute("data-key"))
                .filter(Boolean);

            const selected = Cypress._.sampleSize(donors, Math.min(3, donors.length));
            // explicitly ensure COLO829 and ST001 is included (may not appear in base list)
            if (!selected.includes("COLO829")) selected.push("COLO829");
            if (!selected.includes("ST001")) selected.push("ST001");

            cy.log(`Selected donors: ${selected.join(", ")}`);

            // Build donor search URL with selected display_title filters
            let donorSearchUrl = BASE_DONOR_SEARCH_URL;
            selected.forEach((donorId) => {
                donorSearchUrl = appendParam(donorSearchUrl, "display_title", donorId);
            });

            // 4) Open donor list and iterate
            cy.visit(donorSearchUrl, { headers: cypressVisitHeaders });
            cy.get("#slow-load-container").should("not.have.class", "visible");
            cy.get(".facet-charts.loading").should("not.exist");
            cy.get(".search-result-row[data-row-number]").as("resultRows");
            cy.get("@resultRows").should("have.length", selected.length);

            function testVisit(index) {
                if (index >= selected.length) return;

                // Open donor detail
                cy.get("@resultRows").eq(index).as("currentRow");
                cy.get("@currentRow")
                    .find('[data-field="display_title"] a')
                    .then(($a) => {
                        const donorID = $a.text().trim();

                        cy.wrap($a).invoke("removeAttr", "target").click({ force: true });

                        cy.location("pathname", { timeout: 15000 }).should(
                            "include",
                            "/donors/"
                        );
                        cy.get(".donor-view .view-header .header-text", { timeout: 15000 })
                            .should("be.visible")
                            .and("contain", donorID);

                        // Header controls reflect public visibility
                        verifyHeaderButtons();

                        // “Data Summary / Donor Overview” shows only public-safe info
                        verifyDonorSummary(donorID);

                        // Prior Diagnosis: protected sections absent
                        verifyPriorDiagnosis();

                        // Exposures: protected sections absent
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
                                    regularBlockCount: 5, // rowRegularBlockCount
                                    rowSummaryBlockCount: 5, // rowSummaryBlockCount
                                    colSummaryBlockCount: 1, // colSummaryBlockCount
                                    expectedFilesCount: donorID != "COLO829" ? n : null // totalCountExpected (null → skip strict total check)
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

/* ----------------------------- PARAMETERIZED SUITE ----------------------------- */
const ROLES_TO_TEST = [
    "UNAUTH",
    ROLE_TYPES.SMAHT_DBGAP,
    ROLE_TYPES.SMAHT_NON_DBGAP,
    ROLE_TYPES.PUBLIC_DBGAP,
    ROLE_TYPES.PUBLIC_NON_DBGAP,
];

describe("Public Donor Overview (by role)", () => {
    ROLES_TO_TEST.forEach((roleKey) => {
        const caps = ROLE_MATRIX[roleKey];
        const label = caps.label || String(roleKey);

        context(`${label} → public donor flow`, () => {
            before(() => {
                goto("/");
                loginIfNeeded(roleKey);
            });

            after(() => {
                logoutIfNeeded(roleKey);
            });

            it(`Browse 3 public donors (plus COLO829 and STO001) from Production → open donor details → verify public-only fields and protected sections (enabled: ${caps.runPublicDonorFlow})`, () => {
                if (!caps.runPublicDonorFlow) return;
                stepPublicDonorFlow(caps);
            });
        });
    });
});
