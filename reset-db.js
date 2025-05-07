const { Pool } = require('pg');

async function resetDatabase() {
    console.log('Starting database reset...');
    
    const pool = new Pool({
        connectionString: 'postgresql://neondb_owner:npg_G1oIuRX4kgWd@ep-tiny-band-a46tb2ia-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require'
    });

    try {
        // Drop tables in reverse order of dependencies
        console.log('Dropping tables...');
        await pool.query('DROP TABLE IF EXISTS product_prices CASCADE');
        await pool.query('DROP TABLE IF EXISTS competitor_products CASCADE');
        await pool.query('DROP TABLE IF EXISTS product_attributes CASCADE');
        await pool.query('DROP TABLE IF EXISTS products CASCADE');
        await pool.query('DROP TABLE IF EXISTS competitors CASCADE');
        
        // Drop views and functions
        console.log('Dropping views and functions...');
        await pool.query('DROP VIEW IF EXISTS competitor_product_prices');
        await pool.query('DROP FUNCTION IF EXISTS update_updated_at_column');
        await pool.query('DROP TRIGGER IF EXISTS update_competitors_updated_at ON competitors');
        await pool.query('DROP TRIGGER IF EXISTS update_products_updated_at ON products');
        await pool.query('DROP TRIGGER IF EXISTS update_competitor_products_updated_at ON competitor_products');
        
        // Read and execute schema.sql
        console.log('Creating new schema...');
        const schema = await require('fs').promises.readFile('schema.sql', 'utf-8');
        const statements = schema.split(';').filter(s => s.trim());
        
        // Execute main schema statements first
        for (const statement of statements) {
            if (statement.includes('CREATE OR REPLACE FUNCTION')) continue;
            if (statement.includes('CREATE TRIGGER')) continue;
            if (statement.includes('CREATE VIEW')) continue;
            
            if (statement.trim()) {
                try {
                    await pool.query(statement);
                    console.log('Executed:', statement.substring(0, 80) + '...');
                } catch (error) {
                    console.error('Error executing statement:', error.message);
                    console.error('Statement:', statement);
                    throw error;
                }
            }
        }

        // No need for functions or triggers anymore
        console.log('No additional functions or triggers needed');
    } catch (error) {
        console.error('Error resetting database:');
        console.error(error.message);
        console.error('Full error details:', error.stack);
        throw error;
    } finally {
        await pool.end();
        console.log('Connection pool closed.');
    }
}

resetDatabase();
