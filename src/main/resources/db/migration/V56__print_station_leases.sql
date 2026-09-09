-- A print station now CLAIMS a job before printing it, for a short lease, so two tablets
-- both flagged as the station cannot each print a copy: the claim is a compare-and-set on
-- the row, and a claim that is never acknowledged (the tablet died mid-print) lapses so the
-- job goes back to the pool. print_stations is the liveness record behind "is anyone
-- collecting?" — the settings page and the "counter printer stopped" warning read it — and
-- it survives a server restart, which the in-memory map it replaces did not.
ALTER TABLE print_jobs ADD COLUMN claimed_by VARCHAR(64);
ALTER TABLE print_jobs ADD COLUMN claimed_at TIMESTAMPTZ;

CREATE TABLE print_stations (
    id            BIGSERIAL     PRIMARY KEY,
    restaurant_id BIGINT        NOT NULL REFERENCES restaurants (id),
    branch_id     BIGINT        NOT NULL REFERENCES branches (id),
    station_id    VARCHAR(64)   NOT NULL,
    last_seen_at  TIMESTAMPTZ   NOT NULL,
    created_at    TIMESTAMPTZ   NOT NULL,
    updated_at    TIMESTAMPTZ   NOT NULL,
    UNIQUE (branch_id, station_id)
);
CREATE INDEX idx_print_stations_branch_seen ON print_stations (branch_id, last_seen_at);
