const fs = require('fs');
const path = require('path');

// List of files to remove
const filesToRemove = [
    'test-scraper.js',
    'create-tables.js',
    'test-database.js',
    'schema.sql',
    'reset-db.js',
    'scrape-bernard.js',
    'ws/price-scraper.code-workspace'
];

// List of directories to remove if empty
const dirsToRemove = [
    'ws'
];

async function cleanupProject() {
    try {
        // Remove files
        for (const file of filesToRemove) {
            const filePath = path.join(__dirname, file);
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                    console.log(`Removed: ${file}`);
                } catch (error) {
                    console.error(`Error removing ${file}:`, error);
                }
            }
        }

        // Remove empty directories
        for (const dir of dirsToRemove) {
            const dirPath = path.join(__dirname, dir);
            if (fs.existsSync(dirPath)) {
                try {
                    const files = fs.readdirSync(dirPath);
                    if (files.length === 0) {
                        fs.rmdirSync(dirPath);
                        console.log(`Removed empty directory: ${dir}`);
                    }
                } catch (error) {
                    console.error(`Error checking directory ${dir}:`, error);
                }
            }
        }

        console.log('\nCleanup completed successfully!');
    } catch (error) {
        console.error('Error during cleanup:', error);
        throw error;
    }
}

cleanupProject()
    .then(() => {
        console.log('Project cleanup completed');
    })
    .catch(error => {
        console.error('Project cleanup failed:', error);
    });
