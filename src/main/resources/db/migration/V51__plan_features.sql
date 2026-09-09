-- =====================================================================
-- What each tier includes, as data.
--
-- Feature access was spelled out in Java: Entitlements.requirePro() at every gated endpoint,
-- meaning "PRO or ENTERPRISE" and nothing else. It worked, but it made a pricing decision a
-- deploy — and it could only ever express one shape of answer, so a tier could never include
-- loyalty without also including every Pro analytic.
--
-- This is the same decision written as a grid the platform admin edits: rows are features,
-- columns are tiers. Entitlements reads it instead of hardcoding the comparison.
--
-- Seeded to match exactly what the code does today, so applying this migration changes no
-- café's access. STANDARD gets only QR customisation, which has been open to everyone
-- (canCustomizeQr returned true for all plans, with a comment saying it should gate "when it
-- becomes a paid entitlement"); leaving it on keeps that promise until someone decides
-- otherwise on the Plans page. Everything else is PRO and ENTERPRISE, as requirePro() said.
-- =====================================================================

CREATE TABLE plan_features (
    tier    VARCHAR(20) NOT NULL,
    feature VARCHAR(40) NOT NULL,
    -- Absent rows would be ambiguous — "not decided yet" reads the same as "not included" — so
    -- every tier carries a row for every feature and this column holds the answer.
    enabled BOOLEAN     NOT NULL,
    PRIMARY KEY (tier, feature)
);

INSERT INTO plan_features (tier, feature, enabled) VALUES
    -- STANDARD: the core dashboard, one branch, and the QR badge it could already customise.
    ('STANDARD',   'PRO_ANALYTICS',    FALSE),
    ('STANDARD',   'FULL_HISTORY',     FALSE),
    ('STANDARD',   'LOYALTY',          FALSE),
    ('STANDARD',   'STOCK_INSIGHTS',   FALSE),
    ('STANDARD',   'MULTI_BRANCH',     FALSE),
    ('STANDARD',   'QR_CUSTOMIZATION', TRUE),

    ('PRO',        'PRO_ANALYTICS',    TRUE),
    ('PRO',        'FULL_HISTORY',     TRUE),
    ('PRO',        'LOYALTY',          TRUE),
    ('PRO',        'STOCK_INSIGHTS',   TRUE),
    ('PRO',        'MULTI_BRANCH',     TRUE),
    ('PRO',        'QR_CUSTOMIZATION', TRUE),

    -- ENTERPRISE has always been "Pro or above" to the gate; it stays that way until the grid
    -- is used to make it something else.
    ('ENTERPRISE', 'PRO_ANALYTICS',    TRUE),
    ('ENTERPRISE', 'FULL_HISTORY',     TRUE),
    ('ENTERPRISE', 'LOYALTY',          TRUE),
    ('ENTERPRISE', 'STOCK_INSIGHTS',   TRUE),
    ('ENTERPRISE', 'MULTI_BRANCH',     TRUE),
    ('ENTERPRISE', 'QR_CUSTOMIZATION', TRUE);

COMMENT ON TABLE plan_features IS
    'Which features each tier includes. The authority for feature access: Entitlements reads '
    'this, the Plans page edits it. A tier''s row set is complete — every feature has an answer.';
