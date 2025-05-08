const path = require('path');
const fs = require('fs');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Default configuration
const defaultConfig = {
    // Database
    DATABASE_URL: 'postgresql://neondb_owner:npg_G1oIuRX4kgWd@ep-tiny-band-a46tb2ia-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require',
    DATABASE_SSL: true,

    // Scraping
    SCRAPE_INTERVAL: 24, // hours
    REQUEST_TIMEOUT: 30000, // milliseconds
    MAX_RETRIES: 3,
    RETRY_DELAY: 5000, // milliseconds
    RATE_LIMIT_DELAY: 1000, // milliseconds between requests

    // Logging
    LOG_LEVEL: 'info',
    LOG_DIR: path.join(__dirname, 'logs'),
    MAX_LOG_SIZE: 10485760, // 10MB
    MAX_LOG_FILES: 5,

    // Monitoring
    ALERT_THRESHOLD: 3, // Number of consecutive failures before alert
    ALERT_EMAIL: process.env.ALERT_EMAIL || 'admin@example.com'
};

// Load environment variables and merge with defaults
const config = {
    ...defaultConfig,
    ...process.env
};

// Create log directory if it doesn't exist
if (!fs.existsSync(config.LOG_DIR)) {
    fs.mkdirSync(config.LOG_DIR, { recursive: true });
}

module.exports = config;
