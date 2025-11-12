#!/usr/bin/env node

/**
 * Take a screenshot of a page or specific element
 * Usage: node take-screenshot.js <url> <output-path> [selector]
 * If selector is provided, captures only that element
 * Returns: Compact JSON with screenshot info
 */

const { chromium } = require('playwright');
const path = require('path');

async function takeScreenshot(url, outputPath, selector = null) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);
    
    const absolutePath = path.resolve(outputPath);
    
    if (selector) {
      const element = await page.$(selector);
      if (!element) {
        await browser.close();
        return { success: false, error: `Element not found: ${selector}` };
      }
      await element.screenshot({ path: absolutePath });
    } else {
      await page.screenshot({ path: absolutePath, fullPage: true });
    }
    
    await browser.close();
    
    return {
      success: true,
      path: absolutePath,
      url,
      selector: selector || 'full-page'
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
      error: 'Usage: node take-screenshot.js <url> <output-path> [selector]'
    }));
    process.exit(1);
  }
  
  const [url, outputPath, selector] = args;
  
  takeScreenshot(url, outputPath, selector)
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => console.log(JSON.stringify({ error: error.message })));
}

module.exports = { takeScreenshot };
