const { Pool } = require('pg');
const config = require('./config');

// Test database connection at startup
async function testConnection() {
    try {
        console.log('Testing database connection...');
        const client = await pool.connect();
        try {
            await client.query('SELECT 1');
            console.log('Database connection test successful');
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Database connection test failed:', error);
        throw error;
    }
}

// Database connection configuration
const pool = new Pool({
    connectionString: config.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
});

// Add event listeners for connection events
pool.on('connect', () => {
    console.log('Database connection established');
});

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

pool.on('acquire', (client) => {
    console.log('Client acquired');
});

pool.on('remove', (client) => {
    console.log('Client removed');
});

async function connect() {
    try {
        console.log('Attempting to connect to database...');
        console.log('Database URL:', config.DATABASE_URL);
        
        await pool.query('SELECT 1'); // Test connection
        console.log('Connected to Neon database successfully');
        return pool;
    } catch (error) {
        console.error('Error connecting to Neon database:', error.message);
        console.error('Detailed error:', error);
        throw error;
    }
}

async function saveSnuffUrls(urls) {
    try {
        console.log('Starting saveSnuffUrls function');
        
        const client = await pool.connect();
        try {
            console.log('Client connected successfully');
            console.log('Attempting to save URLs to database...');
            console.log('URLs to save:', JSON.stringify(urls, null, 2));

            // First, create the table if it doesn't exist
            await client.query(`
                CREATE TABLE IF NOT EXISTS products (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL UNIQUE,
                    url VARCHAR(1000) NOT NULL,
                    price DECIMAL(10,2) NOT NULL,
                    category VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create prices table if it doesn't exist
            await client.query(`
                CREATE TABLE IF NOT EXISTS prices (
                    id SERIAL PRIMARY KEY,
                    product_id INTEGER REFERENCES products(id),
                    price DECIMAL(10,2) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('Table created or already exists');

            // Prepare the data for insertion
            const insertData = urls.map(url => [
                url.text, // name
                url.href,  // url
                0.00, // price
                '', // category
                url.href  // url
            ]);
            console.log('Prepared insert data:', insertData);

            // Insert the URLs
            const result = await client.query(
                'INSERT INTO nasal_snuff_urls (brand_name, url) VALUES ($1, $2) RETURNING id',
                insertData
            );
            console.log('Insert query executed');

            console.log(`Successfully inserted ${result.rows.length} URLs into the database`);
            console.log('Inserted IDs:', result.rows.map(row => row.id));
            
            // Verify the data was inserted
            const verifyResult = await client.query(
                'SELECT COUNT(*) as count FROM nasal_snuff_urls'
            );
            console.log(`Total URLs in database: ${verifyResult.rows[0].count}`);

            return result.rows.length; // Return number of inserted URLs
        } finally {
            client.release();
            console.log('Client released');
        }
    } catch (error) {
        console.error('Error saving URLs to database:', error.message);
        console.error('Error details:', error);
        throw error;
    }
}

module.exports = {
    saveSnuffUrls
};
