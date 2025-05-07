const { Pool } = require('pg');

async function testDbConnection() {
    console.log('Testing database connection...');
    
    const pool = new Pool({
        connectionString: 'postgresql://neondb_owner:npg_G1oIuRX4kgWd@ep-tiny-band-a46tb2ia-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require'
    });

    try {
        // Test connection by querying a simple table
        const result = await pool.query('SELECT 1 + 1 AS result');
        console.log('Database connection successful!');
        console.log('Test query result:', result.rows[0].result);
    } catch (error) {
        console.error('Database connection failed:');
        console.error(error.message);
        console.error('Full error details:', error.stack);
    } finally {
        // Close the connection pool
        await pool.end();
        console.log('Connection pool closed.');
    }
}

testDbConnection();
