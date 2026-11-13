ALTER TABLE visitors ADD COLUMN geo_country TEXT;
ALTER TABLE visitors ADD COLUMN geo_region TEXT;
ALTER TABLE visitors ADD COLUMN geo_city TEXT;
ALTER TABLE visitors ADD COLUMN network_asn INTEGER;
ALTER TABLE visitors ADD COLUMN edge_colo TEXT;

CREATE INDEX IF NOT EXISTS idx_visitors_country ON visitors(geo_country);
CREATE INDEX IF NOT EXISTS idx_visitors_city ON visitors(geo_city);
CREATE INDEX IF NOT EXISTS idx_visitors_first_seen ON visitors(first_seen DESC);
CREATE INDEX IF NOT EXISTS idx_visitors_visits ON visitors(visits DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_events_type_time ON visitor_events(event_type, occurred_at DESC);
