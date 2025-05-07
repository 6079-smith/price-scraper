module.exports = {
    // Database
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://localhost:5432/price_scraper',
    DATABASE_SSL: process.env.DATABASE_SSL === 'true',
    
    // Scraping
    SCRAPE_INTERVAL: parseInt(process.env.SCRAPE_INTERVAL) || 24, // hours
    REQUEST_TIMEOUT: parseInt(process.env.REQUEST_TIMEOUT) || 30000, // milliseconds
    MAX_RETRIES: parseInt(process.env.MAX_RETRIES) || 3,
    RETRY_DELAY: parseInt(process.env.RETRY_DELAY) || 5000, // milliseconds
    RATE_LIMIT_DELAY: parseInt(process.env.RATE_LIMIT_DELAY) || 1000, // milliseconds

    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    LOG_DIR: process.env.LOG_DIR || './logs',
    MAX_LOG_SIZE: parseInt(process.env.MAX_LOG_SIZE) || 10485760, // 10MB
    MAX_LOG_FILES: parseInt(process.env.MAX_LOG_FILES) || 5,
    
    // Monitoring
    ALERT_THRESHOLD: parseInt(process.env.ALERT_THRESHOLD) || 3,
    ALERT_EMAIL: process.env.ALERT_EMAIL || 'admin@example.com'
};