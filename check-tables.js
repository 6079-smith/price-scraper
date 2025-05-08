const { Pool } = require('pg');
const config = require('./config');

async function checkTables() {
    try {
        const pool = new Pool({
            connectionString: config.DATABASE_URL,
            ssl: {
                rejectUnauthorized: false
            }
        });

        const client = await pool.connect();
        try {
            // Get all tables
            const tables = await client.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name
            `);

            console.log('\nTables in database:');
            tables.rows.forEach(table => console.log(table.table_name));

            // Get columns for each table
            for (const table of tables.rows) {
                const columns = await client.query(`
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_name = $1 
                    ORDER BY ordinal_position
                `, [table.table_name]);

                console.log(`\nColumns in ${table.table_name}:`);
                columns.rows.forEach(col => 
                    console.log(`- ${col.column_name} (${col.data_type})`)
                );
            }

            // Get row counts
            for (const table of tables.rows) {
                const count = await client.query(`
                    SELECT COUNT(*) as count 
                    FROM ${table.table_name}
                `);
                console.log(`\n${table.table_name} has ${count.rows[0].count} rows`);
            }

        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error checking tables:', error);
        throw error;
    }
}

checkTables()
    .then(() => {
        console.log('\nTable check completed successfully');
    })
    .catch(error => {
        console.error('Table check failed:', error);
    });
