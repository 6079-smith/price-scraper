const puppeteer = require('puppeteer');

async function extractVariantsFromPage(page) {
    // Wait for the variant rows to be present
    await page.waitForSelector('.product .summary form .quantity', {timeout: 10000});
    // Get variant info
    return await page.evaluate(() => {
        const variants = [];
        // Each variant row is a .quantity input with label and price text nearby
        document.querySelectorAll('.product .summary form .quantity').forEach(qtyDiv => {
            const row = qtyDiv.closest('tr') || qtyDiv.parentElement;
            const rowText = row.innerText.replace(/\s+/g, ' ').trim();
            // Try to extract label (weight description)
            const labelMatch = rowText.match(/([\w\s]+\d+(?:\.\d+)?g[\w\s]*)/i);
            const label = labelMatch ? labelMatch[1].trim() : rowText;
            // Try to extract weight
            const weightMatch = rowText.match(/(\d+(?:\.\d+)?)\s*g/i);
            const weightGrams = weightMatch ? parseFloat(weightMatch[1]) : null;
            // Try to extract price
            const priceMatch = rowText.match(/\$?(\d+(?:\.\d+)?)/);
            const price = priceMatch ? parseFloat(priceMatch[1]) : null;
            if (label && weightGrams && price) {
                variants.push({ name: label, weight_grams: weightGrams, price });
            }
        });
        return variants;
    });
}

(async () => {
    const url = 'https://www.toquesnuff.com/product/mcchrystals-olde-english/';
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.goto(url, { waitUntil: 'networkidle2' });
    const variants = await extractVariantsFromPage(page);
    console.log(`Found ${variants.length} variants:`);
    variants.forEach(v => console.log(`- ${v.name} (${v.weight_grams}g) $${v.price}`));
    await browser.close();
})();
