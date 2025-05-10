const axios = require('axios');
const cheerio = require('cheerio');

async function extractVariants($) {
    const variants = [];
    // Find each row with input[type='number'] and extract label and price from siblings
    $('.variations input[type="number"]').each((_, input) => {
        const $input = $(input);
        // Go up to the parent row (could be tr or div)
        const $row = $input.closest('tr').length ? $input.closest('tr') : $input.parent();
        const rowText = $row.text().replace(/\s+/g, ' ').trim();
        const labelMatch = rowText.match(/([\w\s]+\d+(?:\.\d+)?g[\w\s]*)/i);
        const label = labelMatch ? labelMatch[1].trim() : rowText;
        const weightMatch = rowText.match(/(\d+(?:\.\d+)?)\s*g/i);
        const weightGrams = weightMatch ? parseFloat(weightMatch[1]) : null;
        const priceMatch = rowText.match(/\$?(\d+(?:\.\d+)?)/);
        const price = priceMatch ? parseFloat(priceMatch[1]) : null;
        if (label && weightGrams && price) {
            variants.push({ name: label, weight_grams: weightGrams, price });
        }
    });
    return variants;
}

(async function testVariantExtraction() {
    const testUrl = 'https://www.toquesnuff.com/product/mcchrystals-olde-english/';
    console.log(`Testing variant extraction on: ${testUrl}`);
    const response = await axios.get(testUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    });
    const $ = cheerio.load(response.data);
    // Log the relevant HTML for debugging
    const variationsHtml = $('.variations').html();
    if (variationsHtml) {
        console.log('Raw HTML of .variations:');
        console.log(variationsHtml);
    } else {
        console.log('No .variations found. Dumping first 5000 chars of main HTML for inspection:');
        console.log(response.data.substring(0, 5000));
    }
    const variants = await extractVariants($);
    console.log(`Found ${variants.length} variants:`);
    variants.forEach(v => console.log(`- ${v.name} (${v.weight_grams}g) $${v.price}`));
})();
