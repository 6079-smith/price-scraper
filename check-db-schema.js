const { Pool } = require('pg');
const config = require('./config');

async function checkSchema() {
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
            // Get variants table schema
            const variantsSchema = await client.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'variants'
            `);
            console.log('Variants table schema:', variantsSchema.rows);

            // Get products table schema
            const productsSchema = await client.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'products'
            `);
            console.log('Products table schema:', productsSchema.rows);

            // Get price_history table schema
            const priceHistorySchema = await client.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'price_history'
            `);
            console.log('Price history table schema:', priceHistorySchema.rows);

            // Get variant_price_history table schema
            const variantPriceHistorySchema = await client.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'variant_price_history'
            `);
            console.log('Variant price history table schema:', variantPriceHistorySchema.rows);

        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error checking schema:', error);
        process.exit(1);
    }
}

checkSchema();
