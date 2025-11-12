#!/usr/bin/env node

/**
 * Navigate to a page and extract structured data
 * Usage: node navigate-and-extract.js <url> <extraction-config-json>
 * Config format: {"selectors": {"name": "selector", ...}, "waitFor": "selector"}
 * Returns: Compact JSON with extracted data
 */

const { chromium } = require('playwright');

async function navigateAndExtract(url, config) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for specific element if specified
    if (config.waitFor) {
      await page.waitForSelector(config.waitFor, { timeout: 10000 }).catch(() => {});
    } else {
      await page.waitForTimeout(1000);
    }
    
    const results = {};
    
    // Extract data for each selector
    for (const [name, selector] of Object.entries(config.selectors || {})) {
      try {
        const element = await page.$(selector);
        if (element) {
          const text = await element.textContent();
          results[name] = text.trim().substring(0, 200);
        } else {
          results[name] = null;
        }
      } catch (e) {
        results[name] = null;
      }
    }
    
    // Count elements if requested
    if (config.counts) {
      for (const [name, selector] of Object.entries(config.counts)) {
        try {
          const count = await page.$$(selector).then(els => els.length);
          results[name] = count;
        } catch (e) {
          results[name] = 0;
        }
      }
    }
    
    // Check for element visibility if requested
    if (config.checks) {
      for (const [name, selector] of Object.entries(config.checks)) {
        try {
          const element = await page.$(selector);
          results[name] = element !== null && await element.isVisible();
        } catch (e) {
          results[name] = false;
        }
      }
    }
    
    await browser.close();
    
    return {
      success: true,
      url,
      data: results
    };
    
  } catch (error) {
    await browser.close();
    return {
      success: false,
      error: error.message.substring(0, 100)
    };
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log(JSON.stringify({
      error: 'Usage: node navigate-and-extract.js <url> <config-json>'
    }));
    process.exit(1);
  }
  
  const [url, configJson] = args;
  let config;
  
  try {
    config = JSON.parse(configJson);
  } catch (e) {
    console.log(JSON.stringify({
      error: 'Invalid JSON config: ' + e.message
    }));
    process.exit(1);
  }
  
  navigateAndExtract(url, config)
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => console.log(JSON.stringify({ error: error.message })));
}

module.exports = { navigateAndExtract };
