-- Add source and note columns to affiliate_conversions
-- source: tracks how the conversion was recorded (auto, manual, webhook)
-- note: optional seller note on the conversion

ALTER TABLE affiliate_conversions ADD COLUMN IF NOT EXISTS source text DEFAULT 'auto';
ALTER TABLE affiliate_conversions ADD COLUMN IF NOT EXISTS note text;

-- Update the existing test conversion that was recorded before columns existed
UPDATE affiliate_conversions SET source = 'manual' WHERE source IS NULL;
