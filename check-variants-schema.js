const { Pool } = require('pg');
const config = require('./config');

async function checkVariantsSchema() {
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
                SELECT column_name, data_type, is_nullable 
                FROM information_schema.columns 
                WHERE table_name = 'variants'
                ORDER BY ordinal_position
            `);
            console.log('Variants table schema:');
            variantsSchema.rows.forEach(row => {
                console.log(`- ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
            });

            // Check for any constraints
            const constraints = await client.query(`
                SELECT conname, consrc 
                FROM pg_constraint 
                WHERE conrelid = 'variants'::regclass
            `);
            console.log('\nVariants table constraints:');
            constraints.rows.forEach(constraint => {
                console.log(`- ${constraint.conname}: ${constraint.consrc}`);
            });

        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error checking schema:', error);
        process.exit(1);
    }
}

checkVariantsSchema();
