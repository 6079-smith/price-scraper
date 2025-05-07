const puppeteer = require('puppeteer');
const { Pool } = require('pg');

// Neon database configuration
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

const TEST_URL = 'https://www.toquesnuff.com/';

async function testProductDiscovery() {
    let browser;
    try {
        console.log('Starting test product discovery...');

        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.goto(TEST_URL, { waitUntil: 'networkidle2', timeout: 30000 });

        // Find all menu items in Node.js, then find the one with "Nasal Snuff"
        const menuItems = await page.$$('.main-nav .menu-item > a');
        let nasalSnuffElement = null;

        for (const item of menuItems) {
            const text = await page.evaluate(el => el.textContent.trim().toLowerCase(), item);
            if (text === 'nasal snuff') {
                nasalSnuffElement = item;
                break;
            }
        }

        if (!nasalSnuffElement) {
            throw new Error('Could not find "Nasal Snuff" menu item');
        }

        // First check if menu is already visible
        const initialMenuInfo = await page.evaluate(() => {
            // Find the main menu item
            const menuItems = document.querySelectorAll('.main-nav .menu-item');
            const nasalSnuffItem = Array.from(menuItems).find(item => {
                const link = item.querySelector('a');
                return link && link.textContent.trim().toLowerCase() === 'nasal snuff';
            });
            
            if (!nasalSnuffItem) return null;
            
            const nasalSnuffLink = nasalSnuffItem.querySelector('a');
            
            // Check for dropdown menu structure
            const dropdownMenu = nasalSnuffItem.querySelector('.dropdown-menu');
            const subMenu = dropdownMenu || nasalSnuffItem.querySelector('.sub-menu');
            
            // If no direct sub-menu found, check if it's a mega menu
            if (!subMenu) {
                const megaMenu = document.querySelector('.mega-menu');
                if (megaMenu) {
                    const megaMenuItems = Array.from(megaMenu.querySelectorAll('li'));
                    const subMenuItems = megaMenuItems.filter(item => {
                        const link = item.querySelector('a');
                        return link && link.textContent.trim().toLowerCase() !== 'nasal snuff';
                    });
                    
                    if (subMenuItems.length > 0) {
                        return {
                            menuText: nasalSnuffLink.textContent.trim(),
                            hasSubMenu: true,
                            subMenuCount: subMenuItems.length,
                            subLinks: subMenuItems.map(item => ({
                                text: item.querySelector('a').textContent.trim(),
                                href: item.querySelector('a').href
                            })),
                            subMenuHtml: megaMenu.outerHTML
                        };
                    }
                }
            }
            
            const subLinks = subMenu ? Array.from(subMenu.querySelectorAll('li a')).map(link => ({
                text: link.textContent.trim(),
                href: link.href
            })) : [];
            
            return {
                menuText: nasalSnuffLink.textContent.trim(),
                hasSubMenu: subMenu !== null,
                subMenuCount: subLinks.length,
                subLinks: subLinks,
                subMenuHtml: subMenu ? subMenu.outerHTML : null
            };
        });

        console.log('Initial menu check:');
        console.log('Menu item text:', initialMenuInfo?.menuText);
        console.log('Has sub-menu:', initialMenuInfo?.hasSubMenu);
        if (initialMenuInfo?.hasSubMenu && initialMenuInfo.subMenuCount > 0) {
            console.log('Found sub-menu items:', initialMenuInfo.subMenuCount);
            initialMenuInfo.subLinks.forEach(item => {
                console.log(`- ${item.text}: ${item.href}`);
            });
            return; // No need to try hover/click if we found items
        }

        // Debug: Show full menu HTML structure
        const fullMenuHtml = await page.evaluate(() => {
            const menu = document.querySelector('.main-nav');
            return menu ? menu.outerHTML : null;
        });
        console.log('Full menu HTML:', fullMenuHtml?.substring(0, 1000) + '...');

        // Debug: Show all menu items and their structure
        const menuStructure = await page.evaluate(() => {
            const menuItems = document.querySelectorAll('.main-nav .menu-item');
            return Array.from(menuItems).map(item => ({
                text: item.textContent.trim(),
                hasSubMenu: item.querySelector('.sub-menu') !== null
            }));
        });
        console.log('Menu structure:', JSON.stringify(menuStructure, null, 2));

        // Take a screenshot for debugging
        await page.screenshot({ path: 'initial_state.png' });

        // Try hover
        console.log('\nTrying hover...');
        try {
            // Use page.mouse to handle hover
            const box = await nasalSnuffElement.boundingBox();
            if (box) {
                await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Take screenshot after hover
                await page.screenshot({ path: 'after_hover.png' });

                // Try different approaches to get the menu item
                const hoverMenuInfo = await page.evaluate(() => {
                    // Try 1: Using the menu item directly
                    const nasalSnuffItem = Array.from(document.querySelectorAll('.main-nav .menu-item')).find(item => {
                        const link = item.querySelector('a');
                        return link && link.textContent.trim().toLowerCase() === 'nasal snuff';
                    });
                    
                    if (nasalSnuffItem) {
                        // Check for dropdown menu structure
                        const dropdownMenu = nasalSnuffItem.querySelector('.dropdown-menu');
                        const subMenu = dropdownMenu || nasalSnuffItem.querySelector('.sub-menu');
                        
                        if (subMenu) {
                            // Try to trigger the hover event
                            nasalSnuffItem.classList.add('hover');
                            nasalSnuffItem.classList.add('focus');
                            nasalSnuffItem.classList.add('active');
                            
                            // Also try triggering on the link
                            const link = nasalSnuffItem.querySelector('a');
                            if (link) {
                                link.classList.add('hover');
                                link.classList.add('focus');
                                link.classList.add('active');
                            }
                            
                            // Wait for any animations
                            setTimeout(() => {
                                // Trigger reflow
                                nasalSnuffItem.offsetHeight;
                            }, 100);
                        }
                        
                        // If no direct sub-menu found, check if it's a mega menu
                        if (!subMenu) {
                            const megaMenu = document.querySelector('.mega-menu');
                            if (megaMenu) {
                                const megaMenuItems = Array.from(megaMenu.querySelectorAll('li'));
                                const subMenuItems = megaMenuItems.filter(item => {
                                    const link = item.querySelector('a');
                                    return link && link.textContent.trim().toLowerCase() !== 'nasal snuff';
                                });
                                
                                if (subMenuItems.length > 0) {
                                    return {
                                        menuText: nasalSnuffItem.querySelector('a').textContent.trim(),
                                        hasSubMenu: true,
                                        subMenuCount: subMenuItems.length,
                                        subLinks: subMenuItems.map(item => ({
                                            text: item.querySelector('a').textContent.trim(),
                                            href: item.querySelector('a').href
                                        })),
                                        subMenuHtml: megaMenu.outerHTML
                                    };
                                }
                            }
                        }
                        
                        const subLinks = subMenu ? Array.from(subMenu.querySelectorAll('li a')).map(link => ({
                            text: link.textContent.trim(),
                            href: link.href
                        })) : [];
                        
                        return {
                            menuText: nasalSnuffItem.querySelector('a').textContent.trim(),
                            hasSubMenu: subMenu !== null,
                            subMenuCount: subLinks.length,
                            subLinks: subLinks,
                            subMenuHtml: subMenu ? subMenu.outerHTML : null
                        };
                    }
                    
                    // Try 2: Using the link directly
                    const nasalSnuffLink = Array.from(document.querySelectorAll('.main-nav .menu-item > a')).find(link => {
                        return link.textContent.trim().toLowerCase() === 'nasal snuff';
                    });
                    
                    if (nasalSnuffLink) {
                        const parent = nasalSnuffLink.closest('.menu-item');
                        const subMenu = parent.querySelector('.sub-menu');
                        
                        if (subMenu) {
                            // Try to trigger the hover event
                            parent.classList.add('hover');
                            parent.classList.add('focus');
                            parent.classList.add('active');
                            
                            // Wait for any animations
                            setTimeout(() => {
                                // Trigger reflow
                                parent.offsetHeight;
                            }, 100);
                        }
                        
                        const subLinks = subMenu ? Array.from(subMenu.querySelectorAll('li a')).map(link => ({
                            text: link.textContent.trim(),
                            href: link.href
                        })) : [];
                        
                        return {
                            menuText: nasalSnuffLink.textContent.trim(),
                            hasSubMenu: subMenu !== null,
                            subMenuCount: subLinks.length,
                            subLinks: subLinks,
                            subMenuHtml: subMenu ? subMenu.outerHTML : null
                        };
                    }
                    
                    return null;
                });

                if (hoverMenuInfo?.hasSubMenu && hoverMenuInfo.subMenuCount > 0) {
                    console.log('Found sub-menu items after hover:', hoverMenuInfo.subMenuCount);
                    hoverMenuInfo.subLinks.forEach(item => {
                        console.log(`- ${item.text}: ${item.href}`);
                    });
                    return;
                } else {
                    console.log('Hover debug info:', JSON.stringify(hoverMenuInfo, null, 2));
                }
            }
        } catch (error) {
            console.error('Error during hover:', error.message);
        }

        try {
            // Use page.click with a more reliable selector
            await page.click('.main-nav .menu-item > a');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Take screenshot after click
            await page.screenshot({ path: 'after_click.png' });

            const clickMenuInfo = await page.evaluate(() => {
                const menuItems = document.querySelectorAll('.main-nav .menu-item > a');
                let nasalSnuffLink = null;
                
                menuItems.forEach(item => {
                    if (item.textContent.trim().toLowerCase() === 'nasal snuff') {
                        nasalSnuffLink = item;
                    }
                });
                
                if (!nasalSnuffLink) return null;
                
                const parent = nasalSnuffLink.closest('.menu-item');
                const subMenu = parent.querySelector('.sub-menu');
                
                // Debug: Show sub-menu structure
                const subMenuInfo = {
                    hasSubMenu: subMenu !== null,
                    subMenuCount: subMenu ? subMenu.querySelectorAll('li a').length : 0,
                    subMenuHtml: subMenu ? subMenu.outerHTML : null
                };
                
                const subLinks = subMenu ? Array.from(subMenu.querySelectorAll('li a')).map(link => ({
                    text: link.textContent.trim(),
                    href: link.href
                })) : [];
                
                return {
                    menuText: nasalSnuffLink.textContent.trim(),
                    hasSubMenu: subMenu !== null,
                    subMenuCount: subLinks.length,
                    subLinks: subLinks,
                    debugInfo: subMenuInfo
                };
            });

            if (clickMenuInfo?.hasSubMenu && clickMenuInfo.subMenuCount > 0) {
                console.log('Found sub-menu items after click:', clickMenuInfo.subMenuCount);
                
                // Save menu items to competitors table
                try {
                    for (const item of clickMenuInfo.subLinks) {
                        console.log(`- ${item.text}: ${item.href}`);
                        
                        // Save competitor URL to database
                        await pool.query(`
                            INSERT INTO competitors (url, name, last_scraped, scrape_status) 
                            VALUES ($1, $2, CURRENT_TIMESTAMP, 'in_progress')
                            ON CONFLICT (url) 
                            DO UPDATE SET 
                                name = EXCLUDED.name,
                                last_scraped = CURRENT_TIMESTAMP,
                                scrape_status = 'in_progress'
                        `, [item.href, item.text]);

                        // Visit each sub-menu URL and scrape products
                        const catPage = await browser.newPage();
                        try {
                            await catPage.goto(item.href, { waitUntil: 'networkidle2', timeout: 30000 });

                            // Scrape product names and prices (WooCommerce structure)
                            try {
                                const products = await catPage.evaluate(() => {
                                    const items = [];
                                    document.querySelectorAll('.products .product').forEach(prod => {
                                        const name = prod.querySelector('.woocommerce-loop-product__title')?.textContent.trim();
                                        const price = prod.querySelector('.price')?.textContent.trim();
                                        const sku = prod.querySelector('.sku')?.textContent.trim();
                                        const brand = prod.querySelector('.brand')?.textContent.trim();
                                        items.push({ name, price, sku, brand });
                                    });
                                    return items;
                                });

                                console.log(`  Products in ${item.text}:`);
                                products.forEach(prod => {
                                    console.log(`    - ${prod.name}: ${prod.price}`);
                                });

                                // Save products to database
                                if (products.length > 0) {
                                    // Get competitor ID
                                    const competitor = await pool.query('SELECT id FROM competitors WHERE url = $1', [item.href]);
                                    if (competitor.rows.length > 0) {
                                        const competitorId = competitor.rows[0].id;
                                        
                                        for (const product of products) {
                                            // First insert or get product
                                            const productResult = await pool.query(`
                                                INSERT INTO products (name, brand, sku) 
                                                VALUES ($1, $2, $3)
                                                ON CONFLICT (sku) 
                                                DO UPDATE SET 
                                                    name = EXCLUDED.name,
                                                    brand = EXCLUDED.brand
                                                RETURNING id
                                            `, [product.name, product.brand, product.sku]);
                                            
                                            const productId = productResult.rows[0].id;

                                            // Create or get competitor_product relationship
                                            const cpResult = await pool.query(`
                                                INSERT INTO competitor_products (competitor_id, product_id, url) 
                                                VALUES ($1, $2, $3)
                                                ON CONFLICT (competitor_id, product_id) 
                                                DO UPDATE SET 
                                                    url = EXCLUDED.url
                                                RETURNING id
                                            `, [competitorId, productId, item.href]);
                                            
                                            const competitorProductId = cpResult.rows[0].id;

                                            // Insert price
                                            await pool.query(`
                                                INSERT INTO product_prices (competitor_product_id, price, currency, price_type, price_source, captured_at)
                                                VALUES ($1, $2, 'USD', 'regular', 'website', CURRENT_TIMESTAMP)
                                            `, [competitorProductId, product.price]);
                                        }
                                    }
                                }
                            } catch (error) {
                                console.error(`Error scraping products from ${item.text}:`, error.message);
                                // Update competitor status with error
                                await pool.query(`
                                    UPDATE competitors 
                                    SET scrape_status = 'error', 
                                        scrape_error = $1
                                    WHERE url = $2
                                `, [error.message, item.href]);
                            }
                        } catch (error) {
                            console.error(`Error visiting ${item.text}:`, error.message);
                            // Update competitor status with error
                            await pool.query(`
                                UPDATE competitors 
                                SET scrape_status = 'error', 
                                    scrape_error = $1
                                WHERE url = $2
                            `, [error.message, item.href]);
                        } finally {
                            // Update competitor status to completed if no error
                            if (!error) {
                                await pool.query(`
                                    UPDATE competitors 
                                    SET scrape_status = 'completed', 
                                        scrape_error = NULL
                                    WHERE url = $1
                                `, [item.href]);
                            }
                            await catPage.close();
                        }
                    }
                } catch (error) {
                    console.error('Error saving to database:', error.message);
            }
            } else {
                console.log('Click debug info:', JSON.stringify(clickMenuInfo?.debugInfo, null, 2));
            }
        } catch (error) {
            console.error('Error during click:', error.message);
        }
    } catch (error) {
        console.error('Error in testProductDiscovery:', error.message);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

try {
    testProductDiscovery();
} catch (error) {
    console.error('Error running test:', error.message);
    console.error('Full error:', error);
}