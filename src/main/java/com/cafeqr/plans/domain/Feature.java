package com.cafeqr.plans.domain;

/**
 * The things a tier can include.
 *
 * <p>Every value here is a real gate — a place that already refuses when the café's tier does
 * not cover it. Adding a value that gates nothing would put a switch on the Plans page that
 * does nothing when flipped, which is worse than no switch at all, so a new feature goes in
 * here at the same time as the check that enforces it.
 *
 * <p>Most of those checks are {@code Entitlements.require} on the server. {@code QR_CUSTOMIZATION}
 * is the exception: the badge style is drawn in the browser from local storage and never reaches
 * an endpoint, so there is no request to refuse and the dashboard enforces it — on this same
 * answer, fetched from {@code /api/dashboard/features}.
 *
 * <p>What each tier includes is data, not code: see {@code plan_features} and
 * {@link com.cafeqr.analytics.Entitlements}. This enum is only the vocabulary.
 */
public enum Feature {

    /** The diagnostic analytics layer: funnel, item conversion, market basket, staff, forecast, churn, benchmarking. */
    PRO_ANALYTICS,

    /** Query any date range. Without it the core dashboard is capped to a recent window. */
    FULL_HISTORY,

    /** Run a loyalty programme: stamps, rewards, member admin. */
    LOYALTY,

    /** More than one branch. */
    MULTI_BRANCH,

    /** Customise the QR badge: centre logo, colour, font. Enforced in the dashboard, not on an endpoint. */
    QR_CUSTOMIZATION
}
