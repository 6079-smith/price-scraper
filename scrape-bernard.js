const puppeteer = require('puppeteer');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
    connectionString: 'postgresql://neondb_owner:npg_G1oIuRX4kgWd@ep-tiny-band-a46tb2ia-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

// Add error handler for connection issues
pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

async function getOrCreateCompetitor(name, url) {
    try {
        const result = await pool.query(
            `INSERT INTO competitors (name, url)
             VALUES ($1, $2)
             ON CONFLICT (url)
             DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [name, url]
        );
        return result.rows[0].id;
    } catch (error) {
        console.error('Error creating competitor:', error.message);
        throw error;
    }
}

async function scrapeBernard() {
    console.log('Starting scraper...');
    
    const browser = await puppeteer.launch({ headless: true });
    console.log('Browser launched successfully');
    
    const page = await browser.newPage();
    console.log('Page created successfully');
    
    try {
        // Database setup
        console.log('Setting up database connection...');
        const COMPETITOR_NAME = 'Toque Snuff';
        const COMPETITOR_URL = 'https://www.toquesnuff.com';
        const COMPETITOR_ID = await getOrCreateCompetitor(COMPETITOR_NAME, COMPETITOR_URL);
        console.log('Competitor created/updated successfully');
        
        // Navigate to page
        console.log('Navigating to Bernard page...');
        await page.goto('https://www.toquesnuff.com/product-category/bernards/', { waitUntil: 'networkidle2', timeout: 30000 });
        console.log('Page loaded successfully');
        
        // Get page HTML for debugging
        const html = await page.content();
        console.log('Page HTML:', html.substring(0, 1000) + '...');
        
        // Process all pages
        console.log('Starting product scraping...');
        const allProducts = [];
        let currentPage = 1;
        let hasNextPage = true;
        let nextPageUrl = 'https://www.toquesnuff.com/product-category/bernards/';

        try {
            while (hasNextPage) {
                console.log(`\nScraping page ${currentPage}:`);
                
                // Wait for products to load
                await page.waitForSelector('.products', { timeout: 10000 });
                
                // Get products and pagination info
                const result = await page.evaluate(() => {
                    console.log('Evaluating products in page...');
                    const items = [];
                    
                    // Try WooCommerce product grid
                    const productGrid = document.querySelector('.products');
                    if (!productGrid) {
                        console.log('No product grid found');
                        return { products: [], hasNextPage: false, nextPageUrl: null };
                    }
                    
                    // Get all product elements
                    const products = productGrid.querySelectorAll('li.product');
                    console.log(`Found ${products.length} products on page`);
                    
                    products.forEach(prod => {
                        try {
                            // Get product name
                            const nameElement = prod.querySelector('h2.woocommerce-loop-product__title');
                            const name = nameElement ? nameElement.textContent.trim() : 'N/A';
                            
                            // Get product price
                            const priceElement = prod.querySelector('.price');
                            const price = priceElement ? priceElement.textContent.trim() : 'N/A';
                            
                            // Get product URL
                            const link = prod.querySelector('a.woocommerce-LoopProduct-link');
                            const url = link ? link.href : 'N/A';
                            
                            // Only add if we have a name
                            if (name !== 'N/A') {
                                items.push({ 
                                    name, 
                                    price,
                                    url
                                });
                                console.log(`Added product: ${name}`);
                            }
                        } catch (error) {
                            console.error('Error processing product:', error.message);
                        }
                    });
                    
                    // Return products and pagination info
                    const pagination = document.querySelector('.woocommerce-pagination');
                    const nextPageLink = pagination ? pagination.querySelector('a.next') : null;
                    
                    return {
                        products: items,
                        hasNextPage: nextPageLink !== null,
                        nextPageUrl: nextPageLink ? nextPageLink.href : null
                    };
                });

                // Add products from this page
                allProducts.push(...result.products);
                
                // Update pagination info
                hasNextPage = result.hasNextPage;
                nextPageUrl = result.nextPageUrl;
                currentPage++;

                // Log progress
                console.log(`Found ${result.products.length} products on this page`);
                console.log(`Total products collected: ${allProducts.length}`);
                console.log(`Has next page: ${hasNextPage}`);

                // If there's a next page, navigate to it
                if (hasNextPage) {
                    await page.goto(nextPageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                }
            }
        } catch (error) {
            console.error('Error during page scraping:', error.message);
            console.error('Error details:', error.stack);
            throw error;
        }

        // Save all products to database
        console.log('\nSaving products to database...');
        for (const product of allProducts) {
            try {
                console.log(`Processing product: ${product.name}`);
                
                // Extract product type from name
                const productType = product.name.includes('50g') ? '50g' : '10g Doser';
                
                // Create or get product
                console.log(`Creating/updating product in database...`);
                const productResult = await pool.query(
                    `INSERT INTO products (name, brand, product_type)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (name, brand, product_type)
                     DO UPDATE SET last_updated = CURRENT_TIMESTAMP
                     RETURNING id`,
                    [product.name, product.brand, productType]
                );
                
                const productId = productResult.rows[0].id;
                console.log(`Product created with ID: ${productId}`);
                
                // Create competitor_product relationship
                console.log(`Creating competitor_product relationship...`);
                const cpResult = await pool.query(
                    `INSERT INTO competitor_products (competitor_id, product_id, url)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (competitor_id, product_id)
                     DO UPDATE SET last_updated = CURRENT_TIMESTAMP
                     RETURNING id`,
                    [COMPETITOR_ID, productId, product.url]
                );
                
                const cpId = cpResult.rows[0].id;
                console.log(`Competitor_product created with ID: ${cpId}`);
                
                // Save price
                console.log(`Saving price...`);
                const price = parseFloat(product.price.replace('$', ''));
                await pool.query(
                    `INSERT INTO product_prices (competitor_product_id, price, price_type, price_source)
                     VALUES ($1, $2, 'regular', 'website')
                     ON CONFLICT (competitor_product_id, captured_at, price_type)
                     DO UPDATE SET price = EXCLUDED.price`,
                    [cpId, price]
                );
                
                console.log(`Successfully saved product: ${product.name}`);
            } catch (error) {
                console.error(`Error saving product ${product.name}:`, error.message);
                console.error('Error details:', error.stack);
            }
        }

        // Update competitor status
        await pool.query(
            `UPDATE competitors 
             SET last_scraped = CURRENT_TIMESTAMP, 
                 scrape_status = 'completed',
                 scrape_error = NULL
             WHERE id = $1`,
            [COMPETITOR_ID]
        );

        console.log('\nScraping completed successfully!');
    } catch (error) {
        console.error('Error in product processing:', error.message);
        console.error('Error details:', error.stack);
        await pool.query(
            `UPDATE competitors 
             SET last_scraped = CURRENT_TIMESTAMP, 
                 scrape_status = 'error',
                 scrape_error = $1
             WHERE id = $2`,
            [error.message, COMPETITOR_ID]
        );
    } finally {
        await browser.close();
        
        console.log('\nScript completed. Closing database connection...');
        await pool.end();
        console.log('Database connection closed.');
    }
}

async function testProductDiscovery() {
    try {
        await scrapeBernard();
    } catch (error) {
        console.error('Error in testProductDiscovery:', error.message);
        console.error('Error details:', error.stack);
    } finally {
        console.log('\nScript completed. Closing database connection...');
        await pool.end();
        console.log('Database connection closed.');
    }
}

testProductDiscovery();
