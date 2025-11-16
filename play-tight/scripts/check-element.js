#!/usr/bin/env node

/**
 * Check if an element exists on a page and return its properties
 * Usage: node check-element.js <url> <selector>
 * Returns: Compact JSON with element info
 */

const { chromium } = require('playwright');

async function checkElement(url, selector) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait briefly for dynamic content
    await page.waitForTimeout(1000);
    
    const element = await page.$(selector);
    
    if (!element) {
      await browser.close();
      return { found: false, selector };
    }
    
    // Extract only essential information
    const info = await element.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return {
        found: true,
        tagName: el.tagName,
        text: el.textContent?.trim().substring(0, 100) || '',
        visible: rect.width > 0 && rect.height > 0,
        enabled: !el.disabled,
        attributes: {
          id: el.id || null,
          class: el.className || null,
          type: el.type || null,
          href: el.href || null,
          value: el.value || null
        }
      };
    });
    
    await browser.close();
    return info;
    
  } catch (error) {
    await browser.close();
    return {
      found: false,
      error: error.message.substring(0, 100)
    };
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log(JSON.stringify({
      error: 'Usage: node check-element.js <url> <selector>'
    }));
    process.exit(1);
  }
  
  const [url, selector] = args;
  
  checkElement(url, selector)
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => console.log(JSON.stringify({ error: error.message })));
}

module.exports = { checkElement };
