const axios = require('axios');
const cheerio = require('cheerio');
const { Pool } = require('pg');
const config = require('./config');
const { createLogger, format, transports } = require('winston');
const path = require('path');

// Setup logger
const logger = createLogger({
    level: config.LOG_LEVEL,
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    transports: [
        new transports.File({ filename: path.join(config.LOG_DIR, 'scraper.log'), maxsize: config.MAX_LOG_SIZE, maxFiles: config.MAX_LOG_FILES }),
        new transports.Console()
    ]
});

// Database connection
const pool = new Pool({
    connectionString: config.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Helper function to save product data
async function saveProduct(product) {
    const client = await pool.connect();
    try {
        // First try to find existing category
        const categoryResult = await client.query(
            'SELECT id FROM categories WHERE name = $1',
            [product.category]
        );

        if (categoryResult.rows.length === 0) {
            // Create new category if it doesn't exist
            const newCategory = await client.query(
                'INSERT INTO categories (name) VALUES ($1) RETURNING id',
                [product.category]
            );
            categoryResult.rows = [newCategory.rows[0]];
        }

        // First try to find existing product
        const existingProduct = await client.query(
            'SELECT id FROM products WHERE url = $1',
            [product.url]
        );

        if (existingProduct.rows.length > 0) {
            // Update existing product
            await client.query(
                'UPDATE products SET name = $1, last_scraped = NOW() WHERE id = $2 RETURNING id',
                [product.name, existingProduct.rows[0].id]
            );
            return existingProduct.rows[0].id;
        }

        // Insert new product
        const insertResult = await client.query(
            'INSERT INTO products (category_id, name, url, source, sku) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [categoryResult.rows[0].id,
             product.name, product.url, 'toquesnuff', product.sku]
        );
        return insertResult.rows[0].id;
    } finally {
        client.release();
    }
}

// Helper function to save price
async function savePrice(productId, price) {
    const client = await pool.connect();
    try {
        // Clean up price format
        let cleanedPrice = price;
        if (typeof cleanedPrice === 'string') {
            cleanedPrice = cleanedPrice.replace('From', '').replace('$', '').trim();
            // Handle special cases like "From $2.79" or "From$2.79"
            cleanedPrice = parseFloat(cleanedPrice);
        }
        
        if (isNaN(cleanedPrice)) {
            logger.error(`Invalid price format: ${price}`);
            return;
        }

        await client.query(
            'INSERT INTO price_history (product_id, price, source) VALUES ($1, $2, $3)',
            [productId, cleanedPrice, 'toquesnuff']
        );
    } finally {
        client.release();
    }
}

// Main scraping function
async function scrapeNasalSnuff() {
    try {
        // Get homepage
        const homeResponse = await axios.get('https://www.toquesnuff.com/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const $ = cheerio.load(homeResponse.data);
        
        // Find nasal snuff menu item and submenu links
        const nasalSnuffItem = $('#menu-navigation .menu-item:has(a:contains("NASAL SNUFF"))');
        if (!nasalSnuffItem.length) {
            throw new Error('Could not find nasal snuff menu item');
        }

        const subMenu = nasalSnuffItem.find('.dropdown-menu');
        if (!subMenu.length) {
            throw new Error('Could not find submenu');
        }

        const subMenuLinks = subMenu.find('li a').map((_, el) => ({
            text: $(el).text().trim(),
            href: $(el).attr('href')
        })).get();

        // Scrape each sub-menu
        for (const subLink of subMenuLinks) {
            logger.info(`Scraping category: ${subLink.text}`);
            try {
                // Get category page
                const catResponse = await axios.get(subLink.href, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });

                const $cat = cheerio.load(catResponse.data);
                
                // Extract products
                const products = $cat('.products .product').map((_, prod) => {
                    const name = $cat(prod).find('.woocommerce-loop-product__title').text().trim();
                    const price = $cat(prod).find('.price').text().trim();
                    const url = $cat(prod).find('a').attr('href');
                    if (name && price && url) {
                        return { name, price, url };
                    }
                    return null;
                }).get().filter(Boolean);

                // Save products and prices
                for (const product of products) {
                    const productId = await saveProduct({
                        category: subLink.text,
                        name: product.name,
                        url: product.url,
                        price: parseFloat(product.price.replace(/[^0-9.]/g, '')),
                        sku: null // We don't have SKU for competitor products
                    });

                    if (productId) {
                        await savePrice(productId, product.price);
                    }
                }
            } catch (error) {
                logger.error(`Error scraping ${subLink.text}:`, error);
            }
        }
    } catch (error) {
        logger.error('Error in main scraping:', error);
        throw error;
    }
}

// Run scraper periodically
async function startScraper() {
    try {
        setInterval(async () => {
            try {
                await scrapeNasalSnuff();
            } catch (error) {
                logger.error('Error in scraper interval:', error);
            }
        }, config.SCRAPE_INTERVAL * 60 * 60 * 1000);

        // Run immediately on startup
        await scrapeNasalSnuff();
    } catch (error) {
        logger.error('Error starting scraper:', error);
    }
}

startScraper();
