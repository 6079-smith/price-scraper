const { Pool } = require('pg');
const config = require('./config');

async function updateProductsSchema() {
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
            // Check if category_id column exists
            const categoryExists = await client.query(`
                SELECT EXISTS (
                    SELECT 1 
                    FROM information_schema.columns 
                    WHERE table_name = 'products' 
                    AND column_name = 'category_id'
                )
            `);

            if (categoryExists.rows[0].exists) {
                try {
                    // Add category column if it doesn't exist
                    await client.query(`
                        ALTER TABLE products 
                        ADD COLUMN IF NOT EXISTS category VARCHAR(255)
                    `);

                    // Try to update existing records with category names
                    await client.query(`
                        UPDATE products p
                        SET category = c.name
                        FROM categories c
                        WHERE p.category_id = c.id
                    `);
                } catch (error) {
                    console.log('Warning: Could not update categories from categories table:', error);
                }

                // Drop the category_id column and foreign key
                await client.query(`
                    ALTER TABLE products 
                    DROP CONSTRAINT IF EXISTS products_category_id_fkey,
                    DROP COLUMN category_id
                `);
            } else {
                // If category_id column doesn't exist, just add the category column
                await client.query(`
                    ALTER TABLE products 
                    ADD COLUMN IF NOT EXISTS category VARCHAR(255)
                `);
            }
            console.log('Products table schema updated successfully');
        } catch (error) {
            console.error('Error updating products schema:', error);
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error updating products schema:', error);
        process.exit(1);
    }
}

updateProductsSchema();
