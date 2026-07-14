import { cypressVisitHeaders, ROLE_TYPES } from "../support";

const ROLE_MATRIX = {
    UNAUTH: {
        label: "Unauthenticated",
        isAuthenticated: false,

        canViewRecentReleases: false,
        runInitialLoadChecks: false,
        runDailyModeChecks: false,
        runWeeklyModeChecks: false,
        runMonthlyModeChecks: false,
    },

    [ROLE_TYPES.SMAHT_DBGAP]: {
        label: "SMAHT_DBGAP",
        isAuthenticated: true,

        canViewRecentReleases: true,
        runInitialLoadChecks: true,
        runDailyModeChecks: true,
        runWeeklyModeChecks: true,
        runMonthlyModeChecks: true,
    },

    [ROLE_TYPES.SMAHT_NON_DBGAP]: {
        label: "SMAHT_NON_DBGAP",
        isAuthenticated: true,

        canViewRecentReleases: true,
        runInitialLoadChecks: true,
        runDailyModeChecks: true,
        runWeeklyModeChecks: true,
        runMonthlyModeChecks: true,
    },

    [ROLE_TYPES.PUBLIC_DBGAP]: {
        label: "PUBLIC_DBGAP",
        isAuthenticated: true,

        canViewRecentReleases: false,
        runInitialLoadChecks: false,
        runDailyModeChecks: false,
        runWeeklyModeChecks: false,
        runMonthlyModeChecks: false,
    },

    [ROLE_TYPES.PUBLIC_NON_DBGAP]: {
        label: "PUBLIC_NON_DBGAP",
        isAuthenticated: true,

        canViewRecentReleases: false,
        runInitialLoadChecks: false,
        runDailyModeChecks: false,
        runWeeklyModeChecks: false,
        runMonthlyModeChecks: false,
    },
};

const ROLES_TO_TEST = [
    "UNAUTH",
    ROLE_TYPES.SMAHT_DBGAP,
    ROLE_TYPES.SMAHT_NON_DBGAP,
    ROLE_TYPES.PUBLIC_DBGAP,
    ROLE_TYPES.PUBLIC_NON_DBGAP,
];

function loginIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) {
        cy.loginSMaHT(roleKey).end();
    }
}

function visitRecentReleases(roleKey) {
    cy.visit("/", { headers: cypressVisitHeaders });
    loginIfNeeded(roleKey);
    cy.visit("/recent-releases", {
        headers: cypressVisitHeaders,
        failOnStatusCode: false,
    });
}

function assertLocationState(expectedView, datePattern) {
    cy.location("search").should((search) => {
        const params = new URLSearchParams(search);
        expect(params.get("view"), "view query param").to.equal(expectedView);
        expect(params.get("date"), "date query param").to.match(datePattern);
    });
}

function parseRecentReleasesCount(text = "") {
    const cleaned = String(text).trim().replace(/^(?:Results?\s*)?/i, "");
    const match = cleaned.match(/^(\d+(?:\.\d+)?)([KM]?)$/i);
    if (!match) {
        return Number.parseInt(cleaned.replace(/[^\d]/g, ""), 10) || 0;
    }

    const value = Number.parseFloat(match[1]) || 0;
    const suffix = match[2].toUpperCase();
    if (suffix === "K") return Math.round(value * 1000);
    if (suffix === "M") return Math.round(value * 1000000);
    return Math.round(value);
}

function logViewMode(viewMode, message) {
    cy.log(`[Recent Releases][${viewMode}] ${message}`);
}

function assertSelectedCountMatchesResultsCount(expectedText) {
    const expectedCount = parseRecentReleasesCount(expectedText);
    expect(expectedCount, "expected selected bucket count").to.be.greaterThan(0);

    cy.get(".recent-releases-table-scroll").should("be.visible");
    cy.get(".recent-releases-table-scroll .icon-spinner").should("not.exist");
    cy.get(".recent-releases-table-scroll #results-count")
        .should("be.visible")
        .should(($resultsCount) => {
            const resultsCount = parseRecentReleasesCount(
                $resultsCount.text()
            );
            expect(resultsCount, "results table count").to.equal(
                expectedCount
            );
        });
}

function assertReleaseDateFacetIsHidden() {
    cy.get(".facets-container").should("be.visible");
    cy.get(".facets-container .facet[data-field=\"file_status_tracking.release_dates.initial_release_date\"]")
        .should("not.exist");
    cy.get(".facets-container .facet[data-field=\"file_status_tracking.release_dates.initial_release\"]")
        .should("not.exist");
    cy.get(".facets-container .facet-title")
        .should("not.contain.text", "Release Date");
}

function assertMonthNavButtonsAreFunctional() {
    const parseMonthHeading = (headingText) => new Date(`${headingText.trim()} 1`);

    cy.get(".recent-releases-months .release-month-section h4")
        .first()
        .invoke("text")
        .then((initialMonthLabel) => {
            const initialMonthDate = parseMonthHeading(initialMonthLabel);
            cy.log(`[Recent Releases][Weekly] month nav starts at ${initialMonthLabel}`);

            cy.log("[Recent Releases][Weekly] Older");
            cy.contains(".release-month-nav button", "Older")
                .click({ force: true });

            cy.get(".release-month-nav button").first().should(($btn) => {
                expect($btn.text().trim()).to.match(/^(Older|Loading)$/);
            });

            cy.get(".recent-releases-months .release-month-section h4")
                .first()
                .should(($heading) => {
                    expect(
                        $heading.text().trim(),
                        "month heading after Older"
                    ).to.not.equal(initialMonthLabel);
                })
                .invoke("text")
                .then((olderMonthLabel) => {
                    const trimmedOlderMonthLabel = olderMonthLabel.trim();
                    const olderMonthDate = parseMonthHeading(trimmedOlderMonthLabel);
                    cy.log(`[Recent Releases][Weekly] moved to ${trimmedOlderMonthLabel}`);
                    expect(
                        olderMonthDate.getTime(),
                        "month heading after Older should move backward"
                    ).to.be.lessThan(initialMonthDate.getTime());

                    cy.contains(".release-month-nav button", "Older")
                        .should("be.visible")
                        .then(($btn) => {
                            cy.log(`[Recent Releases][Weekly] Older button: ${$btn.text().trim()}`);
                        });

                    cy.log("[Recent Releases][Weekly] Newer");
                    cy.contains(".release-month-nav button", "Newer")
                        .click({ force: true });

                    cy.get(".recent-releases-months .release-month-section h4")
                        .first()
                        .invoke("text")
                        .then((newerMonthLabel) => {
                            const trimmedNewerMonthLabel = newerMonthLabel.trim();
                            const newerMonthDate = parseMonthHeading(trimmedNewerMonthLabel);
                            expect(
                                newerMonthDate.getTime(),
                                "month heading after Newer should move forward"
                            ).to.be.greaterThan(olderMonthDate.getTime());
                            cy.log(`[Recent Releases][Weekly] advanced to ${trimmedNewerMonthLabel}`);
                        });
                });
        });
}

function assertMonthCountBadgeSwitchesToMonthlyView(viewLabel) {
    cy.get(".recent-releases-months .release-month-section")
        .filter((_, el) => Cypress.$(el).find(".count-badge-link").length > 0)
        .first()
        .as("firstMonthSection");

    cy.get("@firstMonthSection")
        .find("h4")
        .invoke("text")
        .then((monthLabel) => {
            const trimmedMonthLabel = monthLabel.trim();
            cy.log(
                `[Recent Releases][${viewLabel}] month badge -> Monthly: ${trimmedMonthLabel}`
            );

            cy.get("@firstMonthSection")
                .find(".count-badge-link")
                .should("be.visible")
                .click({ force: true });

            cy.get(".recent-releases-matrix-column .recent-releases-title")
                .should("contain", "Release Month Details");
            cy.contains(".release-view-mode-toggle button", "Monthly")
                .should("have.class", "active");
            cy.get(".release-bucket-btn.selected .bucket-label")
                .should("have.length", 1)
                .and("have.text", trimmedMonthLabel);
            cy.get(".release-bucket-btn.selected .bucket-count")
                .should("have.length", 1)
                .invoke("text")
                .then((text) => {
                    cy.log(
                        `[Recent Releases][Monthly] month results: ${String(text).trim()}`
                    );
                    assertSelectedCountMatchesResultsCount(text);
                });
            assertLocationState("monthly", /^\d{4}-\d{2}$/);
        });
}

function assertMonthlyBucketClickStaysMonthly() {
    cy.get(".release-bucket-list .release-bucket-btn")
        .should("have.length.at.least", 1)
        .then(($buttons) => {
            const targetIndex = $buttons.length > 1 ? 1 : 0;
            const targetButton = $buttons.eq(targetIndex);
            const targetLabel = Cypress.$(targetButton)
                .find(".bucket-label")
                .text()
                .trim();

            cy.log(
                `[Recent Releases][Monthly] bucket ${targetIndex + 1}/${$buttons.length}: ${targetLabel}`
            );

            cy.wrap(targetButton).click({ force: true });

            cy.get(".recent-releases-matrix-column .recent-releases-title")
                .should("contain", "Release Month Details");
            cy.contains(".release-view-mode-toggle button", "Monthly")
                .should("have.class", "active");
            cy.get(".release-bucket-btn.selected .bucket-label")
                .should("have.text", targetLabel);
            cy.get(".release-bucket-btn.selected .bucket-count")
                .should("have.length", 1)
                .invoke("text")
                .then((text) => {
                    cy.log(
                        `[Recent Releases][Monthly] bucket results: ${String(text).trim()}`
                    );
                    assertSelectedCountMatchesResultsCount(text);
                });
            assertLocationState("monthly", /^\d{4}-\d{2}$/);
        });
}

function stepInitialLoad(caps) {
    if (!caps.runInitialLoadChecks) return;

    cy.get(".recent-releases-timeline-column").should("be.visible");
    cy.get(".recent-releases-matrix-column").should("be.visible");
    cy.get(".recent-releases-title").first().should(
        "contain",
        "Recently Released Files"
    );
    cy.get(".recent-releases-subtitle")
        .first()
        .should("contain", "Select a time range below to view files");
    cy.get(".release-view-mode-toggle button").should("have.length", 3);
    cy.contains(".release-view-mode-toggle button", "Daily").should("be.visible");
    cy.contains(".release-view-mode-toggle button", "Weekly").should("be.visible");
    cy.contains(".release-view-mode-toggle button", "Monthly").should("be.visible");
    cy.get(".release-month-nav").should("exist");
    cy.contains(".release-month-nav button", "Older").should("be.visible");
    cy.contains(".release-month-nav button", "Newer").should("be.visible");
    cy.get(".recent-releases-months .release-month-section")
        .should("have.length.at.least", 1);
    cy.get(".recent-releases-months .release-month-section")
        .first()
        .find(".count-badge, .count-badge-link")
        .invoke("text")
        .then((text) => {
            expect(text.trim(), "month count badge").to.match(/^\d+\s+Files?$/);
        });
    cy.get(".recent-releases-matrix-column .recent-releases-title").should(
        "contain",
        "Release Week Details"
    );
    assertReleaseDateFacetIsHidden();
    cy.get(".release-bucket-btn.selected .bucket-count")
        .should("have.length", 1)
        .invoke("text")
        .then((text) => {
            assertSelectedCountMatchesResultsCount(text);
        });
    assertLocationState("weekly", /^\d{4}-\d{2}-\d{2}$/);
}

function stepDailyMode(caps) {
    if (!caps.runDailyModeChecks) return;

    logViewMode("Daily", "switch to Daily");
    cy.contains(".release-view-mode-toggle button", "Daily")
        .click({ force: true });

    logViewMode("Daily", "check day view and results");
    cy.get(".recent-releases-matrix-column .recent-releases-title").should(
        "contain",
        "Release Day Details"
    );
    assertReleaseDateFacetIsHidden();
    cy.get(".release-calendar-grid .release-day-btn.has-data")
        .should("have.length.at.least", 1);
    cy.get(".release-day-btn.selected")
        .should("have.length", 1)
        .and("have.class", "has-data");
    cy.get(".release-day-btn.selected .day-count")
        .should("have.length", 1)
        .invoke("text")
        .then((text) => {
            assertSelectedCountMatchesResultsCount(text);
        });
    cy.get(".release-day-btn.selected")
        .invoke("attr", "title")
        .should("match", /^[A-Za-z]+\s+\d{1,2},\s+\d{4}$/);

    assertLocationState("daily", /^\d{4}-\d{2}-\d{2}$/);
    logViewMode(
        "Daily",
        "month badge -> Monthly"
    );
    assertMonthCountBadgeSwitchesToMonthlyView("Daily");
}

function stepWeeklyMode(caps) {
    if (!caps.runWeeklyModeChecks) return;

    logViewMode("Weekly", "switch to Weekly");
    cy.contains(".release-view-mode-toggle button", "Weekly")
        .click({ force: true });

    logViewMode("Weekly", "check week bucket and results");
    cy.get(".recent-releases-matrix-column .recent-releases-title").should(
        "contain",
        "Release Week Details"
    );
    assertReleaseDateFacetIsHidden();
    cy.get(".release-bucket-list .release-bucket-btn")
        .should("have.length.at.least", 1);
    cy.get(".release-bucket-list .release-bucket-btn").then(($buttons) => {
        const targetIndex = $buttons.length > 1 ? 1 : 0;
        cy.log(
            `Selecting weekly bucket ${targetIndex + 1} of ${$buttons.length}`
        );
        cy.wrap($buttons.eq(targetIndex)).click({ force: true });
    });
    cy.get(".release-bucket-btn.selected .bucket-count")
        .should("have.length", 1)
        .invoke("text")
        .then((text) => {
            cy.log(`[Recent Releases][Weekly] bucket results: ${String(text).trim()}`);
            assertSelectedCountMatchesResultsCount(text);
            assertLocationState("weekly", /^\d{4}-\d{2}-\d{2}$/);
            assertMonthNavButtonsAreFunctional();
            logViewMode(
                "Weekly",
                "month badge -> Monthly"
            );
            assertMonthCountBadgeSwitchesToMonthlyView("Weekly");
        });
}

function stepMonthlyMode(caps) {
    if (!caps.runMonthlyModeChecks) return;

    logViewMode("Monthly", "switch to Monthly");
    cy.contains(".release-view-mode-toggle button", "Monthly")
        .click({ force: true });

    logViewMode("Monthly", "check month bucket and results");
    cy.get(".recent-releases-matrix-column .recent-releases-title").should(
        "contain",
        "Release Month Details"
    );
    assertReleaseDateFacetIsHidden();
    logViewMode("Monthly", "bucket click stays Monthly");
    assertMonthlyBucketClickStaysMonthly();

    assertLocationState("monthly", /^\d{4}-\d{2}$/);
}

describe("Recent Releases by role", () => {
    ROLES_TO_TEST.forEach((roleKey) => {
        const caps = ROLE_MATRIX[roleKey];
        const label = caps.label || String(roleKey);

        describe(label, () => {
            beforeEach(() => {
                visitRecentReleases(roleKey);
            });

            if (!caps.canViewRecentReleases) {
                it("should show a Forbidden page when Recent Releases is blocked", () => {
                    cy.contains("h1.page-title", "Forbidden").should("be.visible");
                    cy.request({
                        url: "/recent-releases",
                        failOnStatusCode: false,
                        headers: cypressVisitHeaders,
                    }).then((resp) => {
                        expect(resp.status).to.equal(403);
                    });
                });
            } else {
                it("should open Recent Releases and verify the timeline controls", () => {
                    logViewMode("All", "default view is Weekly");
                    cy.location("pathname").should("eq", "/recent-releases");
                    cy.title().should("contain", "Recent Releases");
                    cy.get(".recent-releases-page").should("be.visible");
                    cy.get(".recent-releases-results-mode-toggle").should("have.class", "d-none");
                    stepInitialLoad(caps);
                    stepDailyMode(caps);
                    stepWeeklyMode(caps);
                    stepMonthlyMode(caps);
                });
            }
        });
    });
});
