const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
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

// Database connection (Neon, robust)

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

// Minimal test connection
async function testConnection() {
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT version()');
    console.log('Connected! PostgreSQL version:', res.rows[0].version);
    client.release();
  } catch (err) {
    console.error('Connection error:', err);
    process.exit(1);
  }
}

testConnection();

// Test variant extraction
async function testVariantExtraction() {
    try {
        const testUrl = 'https://www.toquesnuff.com/product/mcchrystals-olde-english/';
        logger.info(`Testing variant extraction on: ${testUrl}`);
        
        const response = await axios.get(testUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        // Log the raw HTML of the variants section for debugging
        const variationsHtml = $('.variations_form').html();
        if (variationsHtml) {
            logger.info('Raw HTML of .variations_form:');
            logger.info(variationsHtml);
        } else {
            logger.info('No .variations_form found. Dumping first 5000 chars of main HTML for inspection:');
            logger.info(response.data.substring(0, 5000));
        }

        const variants = await extractVariants($, testUrl);
        
        logger.info(`Found ${variants.length} variants:`);
        variants.forEach(variant => {
            logger.info(`- ${variant.name} (${variant.weight_grams}g) $${variant.price}`);
        });
    } catch (error) {
        logger.error(`Error testing variant extraction: ${error.message}`);
    }
}

// Limit the number of products to test
const MAX_PRODUCTS_TO_SCRAPE = 50;

// Example: How to use Puppeteer-based extraction in your main scraper
// Call extractVariantsWithPuppeteer(productUrl) for products that need JS rendering

// Example usage for a single product (McChrystals Olde English):
(async () => {
    const testUrl = 'https://www.toquesnuff.com/product/mcchrystals-olde-english/';
    const variants = await extractVariantsWithPuppeteer(testUrl);
    console.log(`Found ${variants.length} variants:`);
    variants.forEach(v => console.log(`- ${v.name} (${v.weight_grams}g) $${v.price}`));
})();

// In your main scraper, you can conditionally call extractVariantsWithPuppeteer or extractVariants based on brand or product type.


// Helper function to determine if a product needs Puppeteer-based extraction
function needsPuppeteerExtraction(productUrl) {
    // Add more patterns as needed
    const patterns = [
        /mcchrystals/i,  // McChrystals products
        /wilsons/i,     // Wilsons products
        // Add other patterns for products that need Puppeteer
    ];
    
    return patterns.some(pattern => productUrl.match(pattern));
}

// Helper function to save product data with retry logic
async function extractVariantsWithPuppeteer(productUrl) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.goto(productUrl, { waitUntil: 'networkidle2' });
    // Wait for the variant rows to be present
    await page.waitForSelector('.product .summary form .quantity', {timeout: 10000});
    // Get variant info
    const variants = await page.evaluate(() => {
        const results = [];
        document.querySelectorAll('.product .summary form .quantity').forEach(qtyDiv => {
            const row = qtyDiv.closest('tr') || qtyDiv.parentElement;
            const rowText = row.innerText.replace(/\s+/g, ' ').trim();
            const labelMatch = rowText.match(/([\w\s]+\d+(?:\.\d+)?g[\w\s]*)/i);
            const label = labelMatch ? labelMatch[1].trim() : rowText;
            const priceMatch = rowText.match(/\$?(\d+(?:\.\d+)?)/);
            const price = priceMatch ? parseFloat(priceMatch[1]) : null;
            if (label && price) {
                const title = label.trim();
                if (title && title.length > 0) {
                    results.push({ title, price });
                } else {
                    console.warn(`Skipping variant with empty title: ${label}`);
                }
            }
        });
        return results;
    });
    await browser.close();
    return variants;
}

// Fallback: Cheerio-based extraction for simple pages
async function extractVariants($, productUrl) {
    try {
        const variants = [];
        $('.variations input[type="number"]').each((_, input) => {
            const $input = $(input);
            const $row = $input.closest('tr').length ? $input.closest('tr') : $input.parent();
            const rowText = $row.text().replace(/\s+/g, ' ').trim();
            const labelMatch = rowText.match(/([\w\s]+\d+(?:\.\d+)?g[\w\s]*)/i);
            const label = labelMatch ? labelMatch[1].trim() : rowText;
            const weightMatch = rowText.match(/(\d+(?:\.\d+)?)\s*g/i);
            const weightGrams = weightMatch ? parseFloat(weightMatch[1]) : null;
            const priceMatch = rowText.match(/\$?(\d+(?:\.\d+)?)/);
            const price = priceMatch ? parseFloat(priceMatch[1]) : null;
            if (label && price) {
                const title = label.trim();
                if (title && title.length > 0) {
                    variants.push({ title, price });
                } else {
                    logger.warn(`Skipping variant with empty title: ${label}`);
                }
            }
        });
        logger.info(`Extracted ${variants.length} variants for product at ${productUrl}`);
        return variants;
    } catch (error) {
        logger.error(`Error extracting weight variants for product at ${productUrl}: ${error.message}`);
        return [];
    }
}

// Helper function to save product data with retry logic
async function bulkInsertVariants(client, productId, productUrl, variants) {
    if (variants.length === 0) return;

    // Build the bulk insert query
    const values = variants.map((variant, i) => `
        ($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})
    `).join(',');

    const query = `
        INSERT INTO variants (product_id, title, price, url) 
        VALUES ${values}
        ON CONFLICT (product_id, title) DO UPDATE SET price = EXCLUDED.price
    `;

    const params = variants.flatMap((variant, i) => [
        productId,
        variant.title,
        variant.price,
        productUrl
    ]);

    await client.query(query, params);
}

async function saveProduct(product, variants = []) {
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds
    
    // If we need to extract variants using Puppeteer
    if (variants.length === 0 && needsPuppeteerExtraction(product.url)) {
        logger.info(`Extracting variants using Puppeteer for: ${product.url}`);
        try {
            const puppeteerVariants = await extractVariantsWithPuppeteer(product.url);
            if (puppeteerVariants.length > 0) {
                variants = puppeteerVariants;
                logger.info(`Found ${variants.length} variants using Puppeteer`);
            }
        } catch (error) {
            logger.error(`Error extracting variants with Puppeteer: ${error.message}`);
        }
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const client = await pool.connect();
            try {
                // First try to find existing product
                const existingProduct = await client.query(
                    'SELECT id FROM products WHERE url = $1',
                    [product.url]
                );

                let productId;
                if (existingProduct.rows.length > 0) {
                    // Update existing product
                    const updateResult = await client.query(
                        'UPDATE products SET name = $1, category = $2, last_scraped = NOW() WHERE id = $3 RETURNING id',
                        [product.name, product.category, existingProduct.rows[0].id]
                    );
                    productId = updateResult.rows[0].id;
                } else {
                    // Insert new product
                    const insertResult = await client.query(
                        'INSERT INTO products (category, name, url, source, sku) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                        [product.category,
                         product.name, product.url, 'toquesnuff', product.sku]
                    );
                    productId = insertResult.rows[0].id;
                }

                // Save variants and their price history in bulk
                if (variants.length > 0) {
                    await bulkInsertVariants(client, productId, product.url, variants);
                    logger.info(`Bulk saved ${variants.length} variants for product ${product.name}`);

                    // Save price history for all variants
                    const priceHistoryValues = variants.map((variant, i) => `
                        ($${i * 2 + 1}, $${i * 2 + 2})
                    `).join(',');

                    const priceHistoryQuery = `
                        INSERT INTO variant_price_history (variant_id, price, source)
                        SELECT v.id, $${i * 2 + 2}, 'toquesnuff'
                        FROM variants v
                        WHERE v.product_id = $1 AND v.title = $${i * 2 + 1}
                    `;

                    const priceHistoryParams = variants.flatMap(variant => [
                        productId,
                        variant.title,
                        variant.price
                    ]);

                    await client.query(priceHistoryQuery, priceHistoryParams);
                    logger.info(`Saved price history for ${variants.length} variants`);
                }
                return productId;
            } finally {
                client.release();
            }
        } catch (error) {
            if (attempt === maxRetries) {
                logger.error(`Failed to save product after ${maxRetries} attempts: ${error.message}`);
                throw error;
            }
            logger.warn(`Attempt ${attempt} failed to save product ${product.name}: ${error.message}. Retrying...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }
    return null;
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

// Helper function for HTTP requests with retry and rate limiting
async function fetchWithRetry(url, options = {}) {
    const maxRetries = 2; // Reduced from 3 to 2
    const retryDelay = 1000; // Reduced from 2000 to 1000ms
    const initialDelay = 500; // Reduced from 1000 to 500ms

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Add random delay between 500-1000ms before each request
            await new Promise(resolve => setTimeout(resolve, initialDelay + Math.random() * 500));
            
            const response = await axios.get(url, {
                ...options,
                timeout: 20000, // Reduced from 30000 to 20000ms
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Cache-Control': 'max-age=0'
                }
            });
            
            return response;
        } catch (error) {
            if (attempt === maxRetries) {
                throw error;
            }
            
            logger.warn(`Attempt ${attempt} failed to fetch ${url}: ${error.message}. Retrying...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }
    throw new Error(`Failed to fetch ${url} after ${maxRetries} attempts`);
}

// Main scraping function
async function scrapeNasalSnuff() {
    try {
        logger.info('Starting nasal snuff scraping process');
        logger.debug('Attempting to fetch homepage');
        
        // Fetch homepage to get menu structure
        const homeResponse = await fetchWithRetry('https://www.toquesnuff.com');
        logger.info('Successfully fetched homepage');
        logger.debug('Homepage content length:', homeResponse.data.length);

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
        logger.debug('Raw subLinks:', subLinks);

        // Filter out non-category links (like "Shop", "About", etc.)
        const categoryLinks = subLinks.filter(link => {
            const isCategory = link.href.includes('/product-category/') && !link.href.includes('/product-category/toque/');
            logger.debug(`Filtering link: ${link.text} - ${link.href} (isCategory: ${isCategory})`);
            return isCategory;
        });
        logger.debug('Filtered categoryLinks:', categoryLinks);

        logger.info(`Found ${subLinks.length} total submenu links`);
        logger.info(`Found ${categoryLinks.length} valid category links`);

        logger.info(`Found ${categoryLinks.length} nasal snuff categories`);
        for (const subLink of categoryLinks) {
            logger.info(`Scraping category: ${subLink.text}`);
            logger.info(`Category URL: ${subLink.href}`);
            logger.debug('Starting category fetch');
            try {
                // Get category page
                logger.info(`Fetching category page: ${subLink.href}`);
                const catResponse = await fetchWithRetry(subLink.href);
                const $cat = cheerio.load(catResponse.data);
                logger.debug('Successfully loaded category page');
                
                // First check if this is a category page with subcategories
                const subCategories = $cat('.products.columns-4 .product-category').map((_, cat) => ({
                    text: $cat(cat).find('.woocommerce-loop-category__title').text().trim(),
                    href: $cat(cat).find('a').attr('href')
                })).get();
                logger.debug('Found subcategories:', subCategories);

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
                                logger.info(`Fetching page ${page} of ${totalPages} in subcategory ${subCat.text}: ${pageUrl}`);
                                try {
                                    const pageResponse = await fetchWithRetry(pageUrl);
                                    const $page = cheerio.load(pageResponse.data);
                                    logger.debug('Successfully loaded page');
                                    
                                    // Check if this is a valid page (not a 404)
                                    const is404 = $page('body').hasClass('page-template-default') || 
                                                 $page('body').hasClass('error404');
                                    if (is404) {
                                        logger.info(`Page ${page} in subcategory ${subCat.text} is a 404, stopping pagination`);
                                        break; // Stop pagination if we hit a 404
                                    }
                                    
                                    // Find products on this page
                                    const products = $page('.products li').map((_, product) => {
                                        const name = $page(product).find('.woocommerce-loop-product__title').text().trim();
                                        const price = $page(product).find('.price').text().trim();
                                        const url = $page(product).find('.woocommerce-LoopProduct-link').attr('href');
                                        const sku = $page(product).find('.sku').text().trim();
                                        logger.debug(`Found product: ${name} - ${url} - ${price} - ${sku}`);
                                        return { name, price, url, sku };
                                    }).get();
                                    logger.debug('Found products:', products);
                                    
                                    allProducts.push(...products);
                                } catch (error) {
                                    if (error.response && error.response.status === 404) {
                                        logger.info(`Page ${page} in subcategory ${subCat.text} not found, stopping pagination`);
                                        break; // Stop pagination if we hit a 404
                                    }
                                    logger.error(`Error fetching page ${page} in subcategory ${subCat.text}: ${error.message}`);
                                    continue; // Continue with next page even if one fails
                                }
                            }
                            
                            // Limit the number of products to test
                            const limitedProducts = allProducts.slice(0, MAX_PRODUCTS_TO_SCRAPE);
                            logger.info(`Found ${allProducts.length} products in subcategory ${subCat.text}, processing ${limitedProducts.length} products`);
                            
                            for (const product of limitedProducts) {
                                try {
                                    logger.info(`Fetching product page for variants: ${product.url}`);
                                    const productPageResponse = await fetchWithRetry(product.url);
                                    const $productPage = cheerio.load(productPageResponse.data);
                                    
                                    try {
                                        // First save the base product
                                        const productId = await saveProduct({
                                            category: subCat.text,
                                            name: product.name,
                                            url: product.url,
                                            price: product.price
                                        });
                                        logger.info(`Saved base product: ${product.name} (ID: ${productId})`);
                                        
                                        // Then fetch the product page to extract variants
                                        logger.info(`Fetching product page for variants: ${product.url}`);
                                        const productPageResponse = await fetchWithRetry(product.url);
                                        const $productPage = cheerio.load(productPageResponse.data);
                                        
                                        // Extract variants
                                        logger.info(`Extracting variants for product: ${product.name}`);
                                        const variants = await extractVariants($productPage, product.url);
                                        logger.info(`Found ${variants.length} variants for product ${product.name}`);
                                        logger.debug('Variants:', variants);
                                        
                                        // Save the variants
                                        logger.info(`Saving ${variants.length} variants for product ${product.name}`);
                                        await saveProduct({
                                            category: subCat.text,
                                            name: product.name,
                                            url: product.url,
                                            price: product.price
                                        }, variants);
                                        logger.info(`Successfully saved variants for product ${product.name}`);
                                        await savePrice(productId, product.price);
                                        logger.info(`Saved price for product: ${product.name} - ${product.price}`);
                                    } catch (error) {
                                        logger.error(`Error processing product ${product.name}: ${error.message}`);
                                    }
                                } catch (error) {
                                    logger.error(`Error fetching product page for variants: ${error.message}`);
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
                        logger.debug(`Found page number: ${text}`);
                        return parseInt(text) || 0;
                    }).get());
                    logger.info(`Found ${totalPages} pages in category ${subLink.text}`);
                    
                    // Scrape each page
                    for (let page = 1; page <= totalPages; page++) {
                        logger.info(`Scraping page ${page} of ${totalPages} in category ${subLink.text}`);
                        const pageUrl = page > 1 ? `${subLink.href}page/${page}/` : subLink.href;
                        logger.info(`Fetching page ${page} of ${totalPages} in category ${subLink.text}: ${pageUrl}`);
                        try {
                            const pageResponse = await fetchWithRetry(pageUrl);
                            const $page = cheerio.load(pageResponse.data);
                            logger.debug('Successfully loaded page');
                            
                            // Check if this is a valid page (not a 404)
                            const is404 = $page('body').hasClass('page-template-default') || 
                                         $page('body').hasClass('error404');
                            if (is404) {
                                logger.info(`Page ${page} in category ${subLink.text} is a 404, stopping pagination`);
                                break; // Stop pagination if we hit a 404
                            }
                            
                            // Find products on this page
                            const products = $page('.products li').map((_, product) => {
                                const name = $page(product).find('.woocommerce-loop-product__title').text().trim();
                                const price = $page(product).find('.price').text().trim();
                                const url = $page(product).find('.woocommerce-LoopProduct-link').attr('href');
                                const sku = $page(product).find('.sku').text().trim();
                                logger.debug(`Found product: ${name} - ${url} - ${price} - ${sku}`);
                                return { name, price, url, sku };
                            }).get();
                            logger.debug('Found products:', products);
                            
                            // Limit the number of products to test
                            const limitedProducts = products.slice(0, MAX_PRODUCTS_TO_SCRAPE);
                            logger.info(`Found ${products.length} products on page ${page}, processing ${limitedProducts.length} products`);
                            
                            // Process each product
                            for (const product of limitedProducts) {
                                try {
                                    logger.info(`Processing product: ${product.name}`);
                                    // First save the product
                                    const productId = await saveProduct({
                                        category: subLink.text,
                                        name: product.name,
                                        url: product.url,
                                        price: product.price,
                                        sku: product.sku
                                    });
                                    logger.info(`Saved product: ${product.name} (ID: ${productId})`);
                                    await savePrice(productId, product.price);
                                    logger.info(`Saved price for product: ${product.name} - ${product.price}`);
                                } catch (error) {
                                    logger.error(`Error processing product ${product.name}: ${error.message}`);
                                }
                            }
                        } catch (error) {
                            if (error.response && error.response.status === 404) {
                                logger.info(`Page ${page} in category ${subLink.text} not found, stopping pagination`);
                                break; // Stop pagination if we hit a 404
                            }
                            logger.error(`Error processing page ${page} in category ${subLink.text}: ${error.message}`);
                            continue; // Continue with next page even if one fails
                        }
                    }
                }
            } catch (error) {
                logger.error(`Error processing category ${subLink.text}: ${error.message}`);
                continue; // Continue with next category even if one fails
            }
        }
    } catch (error) {
        logger.error(`Error in scrapeNasalSnuff: ${error.message}`);
        throw error;
    }
}

// Run scraper periodically
async function startScraper() {
    try {
        logger.info('Starting scraper service');
        const intervalId = setInterval(async () => {
            try {
                logger.info('Starting new scraping interval');
                await scrapeNasalSnuff();
                logger.info('Completed scraping interval successfully');
            } catch (error) {
                logger.error('Error in scraper interval:', error);
            }
        }, config.SCRAPE_INTERVAL * 60 * 60 * 1000);

        // Run immediately on startup
        logger.info('Running initial scrape');
        await scrapeNasalSnuff();
        logger.info('Completed initial scrape');
    } catch (error) {
        logger.error('Error starting scraper:', error);
    }
}

startScraper();
