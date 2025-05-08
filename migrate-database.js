const { Pool } = require('pg');
const config = require('./config');
const fs = require('fs');

async function migrateDatabase() {
    try {
        const pool = new Pool({
            connectionString: config.DATABASE_URL,
            ssl: {
                rejectUnauthorized: false
            }
        });

        const client = await pool.connect();
        try {
            // Read and execute the new schema
            const schema = fs.readFileSync('schema_new.sql', 'utf8');
            await client.query(schema);

            console.log('Database migrated successfully');
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error migrating database:', error);
        throw error;
    }
}

migrateDatabase()
    .then(() => {
        console.log('Migration completed successfully');
    })
    .catch(error => {
        console.error('Migration failed:', error);
    });
