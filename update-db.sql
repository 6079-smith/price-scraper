-- Drop the redundant categories table
DROP TABLE IF EXISTS categories;

-- Create variant_price_history table
CREATE TABLE IF NOT EXISTS variant_price_history (
    id SERIAL PRIMARY KEY,
    variant_id INTEGER REFERENCES variants(id) ON DELETE CASCADE,
    price DECIMAL(10,2) NOT NULL,
    source VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add price column to variants table
ALTER TABLE variants ADD COLUMN IF NOT EXISTS price DECIMAL(10,2);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_variants_product_id ON variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variant_price_history_variant_id ON variant_price_history(variant_id);

-- Add constraint to ensure we have either a SKU or weight_grams
ALTER TABLE variants ADD CONSTRAINT variants_sku_or_weight CHECK (sku IS NOT NULL OR weight_grams IS NOT NULL);
