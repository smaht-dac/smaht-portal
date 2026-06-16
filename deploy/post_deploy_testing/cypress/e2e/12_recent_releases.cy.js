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
    cy.get(".release-bucket-btn.selected").should("have.length", 1);
    assertLocationState("weekly", /^\d{4}-\d{2}-\d{2}$/);
}

function stepDailyMode(caps) {
    if (!caps.runDailyModeChecks) return;

    cy.contains(".release-view-mode-toggle button", "Daily")
        .click({ force: true });

    cy.get(".recent-releases-matrix-column .recent-releases-title").should(
        "contain",
        "Release Day Details"
    );
    cy.get(".release-calendar-grid .release-day-btn.has-data")
        .should("have.length.at.least", 1);
    cy.get(".release-day-btn.selected")
        .should("have.length", 1)
        .and("have.class", "has-data");
    cy.get(".release-day-btn.selected").invoke("attr", "title").should("match", /^[A-Za-z]+\s+\d{1,2},\s+\d{4}$/);
    assertLocationState("daily", /^\d{4}-\d{2}-\d{2}$/);
}

function stepWeeklyMode(caps) {
    if (!caps.runWeeklyModeChecks) return;

    cy.contains(".release-view-mode-toggle button", "Weekly")
        .click({ force: true });

    cy.get(".recent-releases-matrix-column .recent-releases-title").should(
        "contain",
        "Release Week Details"
    );
    cy.get(".release-bucket-list .release-bucket-btn")
        .should("have.length.at.least", 1);
    cy.get(".release-bucket-list .release-bucket-btn").then(($buttons) => {
        const targetIndex = $buttons.length > 1 ? 1 : 0;
        cy.wrap($buttons.eq(targetIndex)).click({ force: true });
    });
    cy.get(".release-bucket-btn.selected").should("have.length", 1);
    assertLocationState("weekly", /^\d{4}-\d{2}-\d{2}$/);
}

function stepMonthlyMode(caps) {
    if (!caps.runMonthlyModeChecks) return;

    cy.contains(".release-view-mode-toggle button", "Monthly")
        .click({ force: true });

    cy.get(".recent-releases-matrix-column .recent-releases-title").should(
        "contain",
        "Release Month Details"
    );
    cy.get(".release-bucket-list .release-bucket-btn")
        .should("have.length.at.least", 1);
    cy.get(".release-bucket-list .release-bucket-btn").then(($buttons) => {
        const targetIndex = $buttons.length > 1 ? 1 : 0;
        cy.wrap($buttons.eq(targetIndex)).click({ force: true });
    });
    cy.get(".release-bucket-btn.selected").should("have.length", 1);
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
