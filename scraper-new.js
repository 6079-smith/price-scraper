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

// Helper function to save product data with retry logic
async function saveProduct(product) {
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
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
            return;
        } catch (error) {
            if (attempt === maxRetries) {
                logger.error(`Failed to save product after ${maxRetries} attempts: ${error.message}`);
                throw error;
            }
            logger.warn(`Attempt ${attempt} failed to save product ${product.name}: ${error.message}. Retrying...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
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
        if (client) {
            client.release();
        }
    }
}

// Main scraping function
async function scrapeNasalSnuff() {
    let client;
    try {
        client = await pool.connect();
        logger.info('Starting nasal snuff scraping process');
        
        // Helper function for HTTP requests with retry and rate limiting
        async function fetchWithRetry(url, options = {}) {
            const maxRetries = 3;
            const retryDelay = 2000; // 2 seconds between retries
            const requestDelay = 1000; // 1 second between requests
            
            // Wait before making the request
            await new Promise(resolve => setTimeout(resolve, requestDelay));
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    logger.debug(`Attempting to fetch ${url} (attempt ${attempt}/${maxRetries})`);
                    const startTime = Date.now();
                    const response = await axios.get(url, {
                        ...options,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                            ...options.headers
                        },
                        timeout: 30000
                    });
                    const duration = Date.now() - startTime;
                    logger.debug(`Successfully fetched ${url} in ${duration}ms`);
                    return response;
                } catch (error) {
                    if (attempt === maxRetries) {
                        logger.error(`Failed to fetch ${url} after ${maxRetries} attempts: ${error.message}`);
                        throw error;
                    }
                    logger.warn(`Attempt ${attempt} failed to fetch ${url}: ${error.message}. Retrying in ${retryDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        }

        // Fetch homepage to get menu structure
        logger.info('Fetching homepage');
        const homeResponse = await fetchWithRetry('https://www.toquesnuff.com');
        logger.info('Successfully fetched homepage');

        const $ = cheerio.load(homeResponse.data);
        
        // Find nasal snuff menu item and submenu links
        const nasalSnuffItem = $('a').filter((_, el) => {
            const text = $(el).text().trim().toUpperCase();
            logger.debug(`Checking menu item: ${text}`);
            return text.includes('NASAL SNUFF');
        }).parent();
        
        if (!nasalSnuffItem.length) {
            logger.error('Could not find NASAL SNUFF menu item');
            return;
        }

        // Get all submenu links and filter out non-category links
        const subLinks = nasalSnuffItem.find('a').map((_, link) => {
            const text = $(link).text().trim();
            const href = $(link).attr('href');
            logger.debug(`Found submenu link: ${text} - ${href}`);
            return { text, href };
        }).get();

        // Filter out non-category links (like "Shop", "About", etc.)
        const categoryLinks = subLinks.filter(link => {
            const isCategory = link.href.includes('/product-category/') && !link.href.includes('/product-category/toque/');
            logger.debug(`Filtering link: ${link.text} - ${link.href} (isCategory: ${isCategory})`);
            return isCategory;
        });

        logger.info(`Found ${subLinks.length} total submenu links`);
        logger.info(`Found ${categoryLinks.length} valid category links`);

        logger.info(`Found ${categoryLinks.length} nasal snuff categories`);
        for (const subLink of categoryLinks) {
            logger.info(`Scraping category: ${subLink.text}`);
            logger.info(`Category URL: ${subLink.href}`);
            try {
                // Get category page
                logger.info(`Fetching category page: ${subLink.href}`);
                const catResponse = await fetchWithRetry(subLink.href);
                const $cat = cheerio.load(catResponse.data);
                
                // First check if this is a category page with subcategories
                const subCategories = $cat('.products.columns-4 .product-category').map((_, cat) => ({
                    text: $cat(cat).find('.woocommerce-loop-category__title').text().trim(),
                    href: $cat(cat).find('a').attr('href')
                })).get();

                if (subCategories.length > 0) {
                    logger.info(`Found ${subCategories.length} subcategories in category ${subLink.text}`);
                    // Scrape each subcategory
                    for (const subCat of subCategories) {
                        logger.info(`Scraping subcategory: ${subCat.text}`);
                        try {
                            // Get subcategory page
                            logger.info(`Fetching subcategory page: ${subCat.href}`);
                            const subCatResponse = await fetchWithRetry(subCat.href);
                            const $subCat = cheerio.load(subCatResponse.data);

                            // Get total number of pages
                            const totalPages = Math.max(1, ...$subCat('.page-numbers').map((_, page) => {
                                const text = $subCat(page).text().trim();
                                const match = text.match(/\d+/);
                                return match ? parseInt(match[0]) : 1;
                            }).get());

                            logger.info(`Found ${totalPages} pages in subcategory ${subCat.text}`);
                            
                            const allProducts = [];
                            
                            // Scrape all pages
                            for (let page = 1; page <= totalPages; page++) {
                                logger.info(`Scraping page ${page} of ${totalPages} in subcategory ${subCat.text}`);
                                const pageUrl = page > 1 ? `${subCat.href}page/${page}/` : subCat.href;
                                logger.debug(`Fetching page URL: ${pageUrl}`);
                                
                                try {
                                    const pageResponse = await fetchWithRetry(pageUrl);
                                    const $page = cheerio.load(pageResponse.data);
                                    
                                    const pageProducts = $page('.products .product').map((_, prod) => {
                                        const name = $page(prod).find('.woocommerce-loop-product__title').text().trim();
                                        const price = $page(prod).find('.price').text().trim();
                                        const url = $page(prod).find('a').attr('href');
                                        
                                        if (!name) {
                                            logger.error(`Product without name found in subcategory ${subCat.text}: ${$page(prod).html()}`);
                                        }
                                        if (!price) {
                                            logger.error(`Product without price found in subcategory ${subCat.text}: ${name}`);
                                        }
                                        if (!url) {
                                            logger.error(`Product without URL found in subcategory ${subCat.text}: ${name}`);
                                        }

                                        if (name && price && url) {
                                            logger.debug(`Found product: ${name} - ${price} - ${url}`);
                                            return { name, price, url };
                                        }
                                        return null;
                                    }).get().filter(Boolean);

                                    logger.info(`Found ${pageProducts.length} products on page ${page} of ${totalPages} in subcategory ${subCat.text}`);
                                    allProducts.push(...pageProducts);
                                } catch (error) {
                                    logger.error(`Error scraping page ${page} in subcategory ${subCat.text}: ${error.message}`);
                                    continue; // Continue with next page even if one fails
                                }
                            }
                            
                            logger.info(`Found ${allProducts.length} total products in subcategory ${subCat.text}`);
                            for (const product of allProducts) {
                                try {
                                    const productId = await saveProduct({
                                        category: subCat.text,
                                        name: product.name,
                                        url: product.url,
                                        price: product.price
                                    });
                                    logger.info(`Saved product: ${product.name} (ID: ${productId})`);
                                    await savePrice(productId, product.price);
                                    logger.info(`Saved price for product: ${product.name} - ${product.price}`);
                                } catch (error) {
                                    logger.error(`Error saving product ${product.name}: ${error.message}`);
                                }
                            }
                        } catch (error) {
                            logger.error(`Error processing subcategory ${subCat.text}: ${error.message}`);
                            continue; // Continue with next subcategory even if one fails
                        }
                    }
                } else {
                    logger.info(`No subcategories found in category ${subLink.text}, treating as product page`);
                    // Get total number of pages
                    const totalPages = Math.max(1, ...$cat('.page-numbers').map((_, page) => {
                        const text = $cat(page).text().trim();
                        const match = text.match(/\d+/);
                        return match ? parseInt(match[0]) : 1;
                    }).get());

                    logger.info(`Found ${totalPages} pages in category ${subLink.text}`);
                    
                    const allProducts = [];
                    
                    // Scrape all pages
                    for (let page = 1; page <= totalPages; page++) {
                        logger.info(`Scraping page ${page} of ${totalPages} in category ${subLink.text}`);
                        const pageUrl = page > 1 ? `${subLink.href}page/${page}/` : subLink.href;
                        logger.debug(`Fetching page URL: ${pageUrl}`);
                        
                        try {
                            const pageResponse = await fetchWithRetry(pageUrl);
                            const $page = cheerio.load(pageResponse.data);
                            
                            const pageProducts = $page('.products .product').map((_, prod) => {
                                const name = $page(prod).find('.woocommerce-loop-product__title').text().trim();
                                const price = $page(prod).find('.price').text().trim();
                                const url = $page(prod).find('a').attr('href');
                                
                                if (!name) {
                                    logger.error(`Product without name found in category ${subLink.text}: ${$page(prod).html()}`);
                                }
                                if (!price) {
                                    logger.error(`Product without price found in category ${subLink.text}: ${name}`);
                                }
                                if (!url) {
                                    logger.error(`Product without URL found in category ${subLink.text}: ${name}`);
                                }

                                if (name && price && url) {
                                    logger.debug(`Found product: ${name} - ${price} - ${url}`);
                                    return { name, price, url };
                                }
                                return null;
                            }).get().filter(Boolean);

                            logger.info(`Found ${pageProducts.length} products on page ${page} of ${totalPages} in category ${subLink.text}`);
                            allProducts.push(...pageProducts);
                        } catch (error) {
                            logger.error(`Error scraping page ${page} in category ${subLink.text}: ${error.message}`);
                            continue; // Continue with next page even if one fails
                        }
                    }
                    
                    logger.info(`Found ${allProducts.length} total products in category ${subLink.text}`);
                    for (const product of allProducts) {
                        try {
                            const productId = await saveProduct({
                                category: subLink.text,
                                name: product.name,
                                url: product.url,
                                price: product.price
                            });
                            logger.info(`Saved product: ${product.name} (ID: ${productId})`);
                            await savePrice(productId, product.price);
                            logger.info(`Saved price for product: ${product.name} - ${product.price}`);
                        } catch (error) {
                            logger.error(`Error saving product ${product.name}: ${error.message}`);
                        }
                    }
                }
            } catch (error) {
                logger.error(`Error processing category ${subLink.text}: ${error.message}`);
            }
        }
    } catch (error) {
        logger.error(`Error in scrapeNasalSnuff: ${error.message}`);
        throw error;
    } finally {
        if (client) {
            client.release();
        }
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
