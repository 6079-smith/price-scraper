-- Drop existing tables if they exist
DROP TABLE IF EXISTS price_history CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS competitor_products CASCADE;
DROP TABLE IF EXISTS competitors CASCADE;
DROP TABLE IF EXISTS product_prices CASCADE;
DROP TABLE IF EXISTS test_table CASCADE;

-- Categories table
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products table
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES categories(id),
    name TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL, -- e.g., 'toquesnuff', 'your_store'
    sku TEXT UNIQUE, -- Your SKU, nullable for competitor products
    competitor_url TEXT, -- URL of competitor's product page
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_scraped TIMESTAMPTZ
);

-- Price history table
CREATE TABLE price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id),
    price NUMERIC NOT NULL,
    currency TEXT DEFAULT 'USD',
    source TEXT NOT NULL, -- e.g., 'toquesnuff', 'your_store'
    captured_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX idx_products_url ON products(url);
CREATE INDEX idx_products_last_scraped ON products(last_scraped);
CREATE INDEX idx_price_history_product_id ON price_history(product_id);
CREATE INDEX idx_price_history_captured_at ON price_history(captured_at);
