-- competitors
CREATE TABLE IF NOT EXISTS competitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_scraped TIMESTAMPTZ,
    scrape_status TEXT,
    scrape_error TEXT
);

-- products
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    our_sku TEXT UNIQUE,
    name TEXT NOT NULL,
    brand TEXT,
    product_type TEXT,
    sku TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, brand, product_type)
);

-- product attributes
CREATE TABLE IF NOT EXISTS product_attributes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id),
    attribute_name TEXT NOT NULL,
    attribute_value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, attribute_name)
);

-- competitor_products (junction table)
CREATE TABLE IF NOT EXISTS competitor_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_id UUID REFERENCES competitors(id),
    product_id UUID REFERENCES products(id),
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(competitor_id, product_id)
);

-- product_prices
CREATE TABLE IF NOT EXISTS product_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_product_id UUID REFERENCES competitor_products(id),
    price DECIMAL(10,2) NOT NULL,
    currency CHAR(3) DEFAULT 'USD',
    price_type TEXT CHECK (price_type IN ('regular', 'sale', 'clearance', 'special')),
    price_source TEXT CHECK (price_source IN ('website', 'api', 'manual')),
    captured_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(competitor_product_id, captured_at, price_type)
);

-- indexes for performance
CREATE INDEX IF NOT EXISTS idx_competitor_products_competitor_id ON competitor_products(competitor_id);
CREATE INDEX IF NOT EXISTS idx_competitor_products_product_id ON competitor_products(product_id);
CREATE INDEX IF NOT EXISTS idx_product_prices_competitor_product_id ON product_prices(competitor_product_id);
CREATE INDEX IF NOT EXISTS idx_product_prices_captured_at ON product_prices(captured_at);
CREATE INDEX IF NOT EXISTS idx_product_prices_price_type ON product_prices(price_type);

-- Use DEFAULT CURRENT_TIMESTAMP for all updated_at columns
-- This will automatically update the timestamp on any update
-- No need for triggers or functions

-- competitors
CREATE TABLE IF NOT EXISTS competitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_scraped TIMESTAMPTZ,
    scrape_status TEXT,
    scrape_error TEXT
);

-- products
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    our_sku TEXT UNIQUE,
    name TEXT NOT NULL,
    brand TEXT,
    product_type TEXT,
    sku TEXT UNIQUE,
    url TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, brand, product_type)
);

-- competitor_products (junction table)
CREATE TABLE IF NOT EXISTS competitor_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_id UUID REFERENCES competitors(id),
    product_id UUID REFERENCES products(id),
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(competitor_id, product_id)
);

-- views for common queries
CREATE OR REPLACE VIEW competitor_product_prices AS
SELECT 
    c.name as competitor_name,
    c.url as competitor_url,
    p.name as product_name,
    p.brand as product_brand,
    p.product_type as product_type,
    cp.url as product_url,
    pp.price,
    pp.currency,
    pp.price_type,
    pp.price_source,
    pp.captured_at
FROM competitors c
JOIN competitor_products cp ON c.id = cp.competitor_id
JOIN products p ON cp.product_id = p.id
JOIN product_prices pp ON cp.id = pp.competitor_product_id
ORDER BY c.name, p.name, pp.captured_at DESC;
