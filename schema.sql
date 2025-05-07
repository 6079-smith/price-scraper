CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  our_sku TEXT UNIQUE NOT NULL,
  competitor_url TEXT NOT NULL,
  last_scraped TIMESTAMPTZ
);

CREATE TABLE price_history (
  product_id UUID REFERENCES products(id),
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  our_price NUMERIC,
  competitor_price NUMERIC,
  PRIMARY KEY (product_id, captured_at)
);
