const { Pool } = require('pg');
const axios = require('axios');
const cheerio = require('cheerio');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const nodemailer = require('nodemailer');
const { createLogger, format, transports } = require('winston');

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

// Email transport for alerts
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    }
});

// Retry helper function
const retry = async (fn, retries = config.MAX_RETRIES) => {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, config.RETRY_DELAY));
            }
        }
    }
    throw lastError;
};

// Rate limiter
const rateLimiter = {
    lastRequest: null,
    async wait() {
        const now = Date.now();
        if (this.lastRequest) {
            const diff = now - this.lastRequest;
            if (diff < config.RATE_LIMIT_DELAY) {
                await new Promise(resolve => setTimeout(resolve, config.RATE_LIMIT_DELAY - diff));
            }
        }
        this.lastRequest = now;
    }
};

// Database connection configuration
const pool = new Pool({
    user: 'neondb_owner',
    host: 'ep-tiny-band-a46tb2ia-pooler.us-east-1.aws.neon.tech',
    database: 'neondb',
    password: 'npg_aEHrD8MNql4I',
    port: 5432,
    ssl: {
        rejectUnauthorized: false
    }
});

// Function to get products that need to be scraped
async function getProductsToScrape() {
    try {
        const client = await pool.connect();
        try {
            const result = await client.query(`
                SELECT id, our_sku, competitor_url 
                FROM products 
                WHERE last_scraped IS NULL 
                   OR last_scraped < NOW() - INTERVAL '${config.SCRAPE_INTERVAL} hours'
            `);
            return result.rows;
        } finally {
            client.release();
        }
    } catch (error) {
        logger.error('Error getting products from database', error);
        throw error;
    }
}

// Function to scrape price from a URL
async function scrapePrice(url) {
    try {
        await rateLimiter.wait();
        
        return await retry(async () => {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Connection': 'keep-alive'
                },
                timeout: config.REQUEST_TIMEOUT
            });

            const $ = cheerio.load(response.data);
            
            // This is a placeholder - you'll need to customize based on your competitor's website
            // Example selectors for common e-commerce sites:
            // Toquesnuff-specific selectors
            const priceSelectors = [
                '.product-price', // Toquesnuff price class
                '.price', // Fallback
                'span[itemprop="price"]' // Schema.org price
            ];

            for (const selector of priceSelectors) {
                const priceElement = $(selector);
                if (priceElement.length > 0) {
                    let priceText = priceElement.text().trim();
                    // Clean up the price text
                    priceText = priceText.replace(/[^0-9.]/g, '');
                    const price = parseFloat(priceText);
                    if (!isNaN(price)) {
                        return price;
                    }
                }
            }

            logger.warn(`Could not find valid price on page: ${url}`);
            return null;
        });
    } catch (error) {
        logger.error(`Error scraping ${url}:`, error);
        throw error;
    }
}

// Function to update price history
async function updatePriceHistory(productId, competitorPrice) {
    try {
        const client = await pool.connect();
        try {
            // Insert into price_history
            await client.query(`
                INSERT INTO price_history (product_id, price, source)
                VALUES ($1, $2, 'toquesnuff')
            `, [productId, competitorPrice]);

            // Update last_scraped timestamp
            await client.query(`
                UPDATE products 
                SET last_scraped = NOW()
                WHERE id = $1
            `, [productId]);
        } finally {
            client.release();
        }
    } catch (error) {
        logger.error('Error updating price history in database', error);
        throw error;
    }
}

// Function to send alerts via email
async function sendAlert(message) {
    try {
        const mailOptions = {
            from: process.env.SMTP_USER,
            to: config.ALERT_EMAIL,
            subject: 'Price Scraper Alert',
            text: message
        };

        await transporter.sendMail(mailOptions);
        logger.info('Alert email sent successfully');
    } catch (error) {
        logger.error('Failed to send alert email:', error);
    }
}

// Main scraper function
async function runScraper() {
    try {
        logger.info('Starting scraper run');
        
        const products = await getProductsToScrape();
        logger.info(`Found ${products.length} products to scrape`);

        let consecutiveFailures = 0;

        for (const product of products) {
            try {
                const competitorPrice = await scrapePrice(product.competitor_url);
                if (competitorPrice !== null) {
                    await updatePriceHistory(product.id, null, competitorPrice);
                    logger.info(`Successfully updated price for SKU: ${product.our_sku}`);
                    consecutiveFailures = 0; // Reset failure counter on success
                } else {
                    logger.warn(`Failed to get price for SKU: ${product.our_sku}`);
                    consecutiveFailures++;
                }
            } catch (error) {
                logger.error(`Error processing product ${product.our_sku}:`, error);
                consecutiveFailures++;
            }

            // Check if we need to send an alert
            if (consecutiveFailures >= config.ALERT_THRESHOLD) {
                await sendAlert('Scraper is experiencing multiple consecutive failures');
            }
        }
    } catch (error) {
        logger.error('Error in main scraper run:', error);
        consecutiveFailures++;
        if (consecutiveFailures >= config.ALERT_THRESHOLD) {
            await sendAlert('Scraper failed to run completely');
        }
    } finally {
        logger.info('Scraper run completed');
    }
}

// Run the scraper with a configurable interval
async function startScraper() {
    setInterval(async () => {
        try {
            await runScraper();
        } catch (error) {
            logger.error('Error in scraper interval:', error);
        }
    }, config.SCRAPE_INTERVAL * 60 * 60 * 1000);

    // Run immediately on startup
    runScraper();
}

// Start the scraper
startScraper();
