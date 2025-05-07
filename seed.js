const { Pool } = require('pg');
const config = require('./config');

// Database connection
const pool = new Pool({
    connectionString: config.DATABASE_URL,
    ssl: {
        rejectUnauthorized: !config.DATABASE_SSL
    }
});

// Sample products to seed
const sampleProducts = [
    {
        our_sku: 'SKU123',
        competitor_url: 'https://example.com/product123'
    },
    {
        our_sku: 'SKU456',
        competitor_url: 'https://example.com/product456'
    },
    {
        our_sku: 'SKU789',
        competitor_url: 'https://example.com/product789'
    }
];

async function seedDatabase() {
    try {
        const client = await pool.connect();
        try {
            // Insert sample products
            for (const product of sampleProducts) {
                await client.query(`
                    INSERT INTO products (our_sku, competitor_url)
                    VALUES ($1, $2)
                    ON CONFLICT (our_sku) DO NOTHING
                `, [product.our_sku, product.competitor_url]);

                // Insert some sample price history
                const productId = await client.query(`
                    SELECT id FROM products WHERE our_sku = $1
                `, [product.our_sku]);

                if (productId.rows.length > 0) {
                    // Add some historical price data
                    const prices = [
                        { our_price: 99.99, competitor_price: 95.99 },
                        { our_price: 98.99, competitor_price: 94.99 },
                        { our_price: 97.99, competitor_price: 93.99 }
                    ];

                    for (const price of prices) {
                        await client.query(`
                            INSERT INTO price_history (product_id, our_price, competitor_price)
                            VALUES ($1, $2, $3)
                        `, [productId.rows[0].id, price.our_price, price.competitor_price]);
                    }
                }
            }

            console.log('Successfully seeded database with sample products and price history');
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error seeding database:', error);
        throw error;
    }
}

seedDatabase()
    .then(() => {
        console.log('Database seeding completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('Database seeding failed:', error);
        process.exit(1);
    });
