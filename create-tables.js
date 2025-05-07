const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
    connectionString: config.DATABASE_URL,
    ssl: {
        rejectUnauthorized: !config.DATABASE_SSL
    }
});

async function createTables() {
    try {
        const client = await pool.connect();
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS products (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    our_sku TEXT UNIQUE NOT NULL,
                    competitor_url TEXT NOT NULL,
                    last_scraped TIMESTAMPTZ
                );

                CREATE TABLE IF NOT EXISTS price_history (
                    product_id UUID REFERENCES products(id),
                    captured_at TIMESTAMPTZ DEFAULT NOW(),
                    our_price NUMERIC,
                    competitor_price NUMERIC,
                    PRIMARY KEY (product_id, captured_at)
                );
            `);
            console.log('Tables created successfully');
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error creating tables:', error);
        throw error;
    }
}

createTables()
    .then(() => {
        console.log('Database tables created');
        process.exit(0);
    })
    .catch(error => {
        console.error('Failed to create tables:', error);
        process.exit(1);
    });
