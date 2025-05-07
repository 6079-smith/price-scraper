const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const config = require('./config');
const { createLogger, format, transports } = require('winston');
const rateLimit = require('express-rate-limit');

const app = express();

// Setup logger
const logger = createLogger({
    level: config.LOG_LEVEL,
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    transports: [
        new transports.File({ filename: path.join(config.LOG_DIR, 'app.log'), maxsize: config.MAX_LOG_SIZE, maxFiles: config.MAX_LOG_FILES }),
        new transports.Console()
    ]
});

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

app.use(limiter);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database connection
const pool = new Pool({
    connectionString: config.DATABASE_URL,
    ssl: {
        rejectUnauthorized: !config.DATABASE_SSL
    }
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/prices', async (req, res) => {
    try {
        const client = await pool.connect();
        try {
            logger.info('Fetching prices from database');
            const result = await client.query(`
                SELECT 
                    p.our_sku,
                    ph.captured_at,
                    ph.our_price,
                    ph.competitor_price
                FROM products p
                JOIN price_history ph ON p.id = ph.product_id
                ORDER BY p.our_sku, ph.captured_at DESC
                LIMIT 100
            `);
            
            logger.info(`Found ${result.rows.length} price records`);
            if (result.rows.length > 0) {
                logger.info('Sample price record:', result.rows[0]);
            }
            
            res.json(result.rows);
        } finally {
            client.release();
        }
    } catch (error) {
        logger.error('Error fetching prices:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/health', async (req, res) => {
    try {
        const client = await pool.connect();
        try {
            await client.query('SELECT 1');
            res.json({ status: 'healthy' });
        } finally {
            client.release();
        }
    } catch (error) {
        logger.error('Health check failed:', error);
        res.status(500).json({ status: 'unhealthy' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error(`Error in ${req.method} ${req.url}:`, err);
    res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`Server started on port ${PORT}`);
});
