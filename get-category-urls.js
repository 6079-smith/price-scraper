const axios = require('axios');
const cheerio = require('cheerio');
const { Pool } = require('pg');
const config = require('./config');

// Database connection
const pool = new Pool({
    user: 'neondb_owner',
    host: 'ep-tiny-band-a46tb2ia-pooler.us-east-1.aws.neon.tech',
    database: 'neondb',
    password: 'npg_G1oIuRX4kgWd',
    port: 5432,
    ssl: {
        rejectUnauthorized: false
    }
});

async function getAndStoreCategoryUrls() {
    try {
        const response = await axios.get('https://toquesnuff.com/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        
        // Find the 'Nasal Snuff' menu item
        const nasalSnuffMenu = $('.menu-item-has-children:contains("Nasal Snuff")');
        
        if (nasalSnuffMenu.length === 0) {
            console.error('Could not find Nasal Snuff menu item');
            return;
        }

        // Extract submenu items
        const submenuItems = nasalSnuffMenu.find('.sub-menu .menu-item a');
        
        console.log(`Found ${submenuItems.length} submenu items`);

        const client = await pool.connect();
        try {
            // Start a transaction
            await client.query('BEGIN');

            // First insert categories
            for (const item of submenuItems) {
                const $item = $(item);
                const categoryName = $item.text().trim();
                const categoryUrl = $item.attr('href');

                // Insert category if it doesn't exist
                const categoryResult = await client.query(`
                    INSERT INTO categories (name)
                    VALUES ($1)
                    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
                    RETURNING id
                `, [categoryName]);

                const categoryId = categoryResult.rows[0].id;
                console.log(`Added/updated category: ${categoryName} (ID: ${categoryId})`);

                // Now get products from this category
                const products = await getProductsFromCategory(categoryUrl);
                for (const product of products) {
                    await client.query(`
                        INSERT INTO products (name, url, source, category_id, competitor_url)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (url) DO UPDATE SET 
                            name = EXCLUDED.name,
                            category_id = EXCLUDED.category_id,
                            competitor_url = EXCLUDED.competitor_url
                    `, [
                        product.name,
                        product.url,
                        'toquesnuff',
                        categoryId,
                        product.url
                    ]);
                    console.log(`Added product: ${product.name}`);
                }
            }

            // Commit the transaction
            await client.query('COMMIT');
            console.log('Successfully added all categories and products');
        } catch (error) {
            // Rollback on error
            await client.query('ROLLBACK');
            console.error('Error processing categories:', error);
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error getting category URLs:', error);
        throw error;
    }
}

async function getProductsFromCategory(categoryUrl) {
    try {
        const response = await axios.get(categoryUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const products = [];

        // Look for product items (this may need adjustment based on Toquesnuff's HTML structure)
        const productItems = $('.product-item, .product-grid-item');
        
        productItems.each((index, element) => {
            const $product = $(element);
            const name = $product.find('.product-title, .product-name').text().trim();
            const url = $product.find('a').attr('href');
            
            if (name && url) {
                products.push({
                    name: name,
                    url: url
                });
            }
        });

        console.log(`Found ${products.length} products in category: ${categoryUrl}`);
        return products;
    } catch (error) {
        console.error(`Error getting products from category ${categoryUrl}:`, error);
        throw error;
    }
}

// Run the script
getAndStoreCategoryUrls().catch(console.error);
