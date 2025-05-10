const { Pool } = require('pg');
const config = require('./config');

async function checkBrands() {
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
            // Check if brands table exists
            const brandsExists = await client.query(`
                SELECT EXISTS (
                    SELECT 1 
                    FROM information_schema.tables 
                    WHERE table_name = 'brands'
                )
            `);
            console.log('Brands table exists:', brandsExists.rows[0].exists);

            if (brandsExists.rows[0].exists) {
                // Check if brands are used in products
                const productsWithBrands = await client.query(`
                    SELECT COUNT(*) 
                    FROM products 
                    WHERE brand_id IS NOT NULL
                `);
                console.log('Products with brands:', productsWithBrands.rows[0].count);

                // Check if brands table has any data
                const brandsCount = await client.query(`
                    SELECT COUNT(*) 
                    FROM brands
                `);
                console.log('Total brands:', brandsCount.rows[0].count);
            }
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error checking brands:', error);
        process.exit(1);
    }
}

checkBrands();
