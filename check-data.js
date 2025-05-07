const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
    connectionString: config.DATABASE_URL,
    ssl: {
        rejectUnauthorized: !config.DATABASE_SSL
    }
});

async function checkDatabase() {
    try {
        const client = await pool.connect();
        try {
            // Check if tables exist
            console.log('Checking if tables exist...');
            const tables = await client.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            `);
            console.log('Tables in database:', tables.rows.map(t => t.table_name));

            // Check products table
            console.log('\nChecking products table...');
            const products = await client.query('SELECT * FROM products');
            console.log(`Found ${products.rows.length} products`);
            if (products.rows.length > 0) {
                console.log('Sample product:', products.rows[0]);
            }

            // Check price history
            console.log('\nChecking price history...');
            const priceHistory = await client.query('SELECT * FROM price_history ORDER BY captured_at DESC LIMIT 5');
            console.log(`Found ${priceHistory.rows.length} price history entries`);
            if (priceHistory.rows.length > 0) {
                console.log('Recent price history:', priceHistory.rows);
            }

        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error checking database:', error);
        throw error;
    }
}

checkDatabase()
    .then(() => {
        console.log('Database check completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('Database check failed:', error);
        process.exit(1);
    });
