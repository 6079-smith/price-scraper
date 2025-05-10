const { Pool } = require('pg');
const config = require('./config');

async function updateDatabase() {
    try {
        const pool = new Pool({
            user: 'neondb_owner',
            password: 'npg_G1oIuRX4kgWd',
            host: 'ep-tiny-band-a46tb2ia-pooler.us-east-1.aws.neon.tech',
            database: 'neondb',
            port: 5432,
            ssl: {
                rejectUnauthorized: false
            }
        });

        const client = await pool.connect();
        try {
            // Drop unused Brands table if it exists
            await client.query(`DROP TABLE IF EXISTS brands CASCADE`);
            console.log('Brands table dropped successfully');

            // Create variant_price_history table
            // Create variant_price_history table
            await client.query(`
                CREATE TABLE IF NOT EXISTS variant_price_history (
                    id SERIAL PRIMARY KEY,
                    variant_id UUID REFERENCES variants(id) ON DELETE CASCADE,
                    price DECIMAL(10,2) NOT NULL,
                    source VARCHAR(50) NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Add price column to variants table if it doesn't exist
            await client.query(`
                DO $$ 
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'variants' 
                        AND column_name = 'price'
                    ) THEN
                        ALTER TABLE variants ADD COLUMN price DECIMAL(10,2);
                    END IF;
                END $$
            `);

            // Add indexes for better performance
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_variants_product_id ON variants(product_id);
                CREATE INDEX IF NOT EXISTS idx_variant_price_history_variant_id ON variant_price_history(variant_id)
            `);

            console.log('Database schema updated successfully');
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error updating database:', error);
        process.exit(1);
    }
}

updateDatabase();
