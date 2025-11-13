#!/usr/bin/env node

/**
 * Extract text content from a specific element or entire page
 * Usage: node get-text.js <url> [selector]
 * If selector is omitted, extracts visible text from body
 * Returns: Compact JSON with extracted text
 */

const { chromium } = require('playwright');

async function getText(url, selector = null) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);
    
    let text;
    let found = true;
    
    if (selector) {
      const element = await page.$(selector);
      if (!element) {
        await browser.close();
        return { found: false, selector };
      }
      text = await element.textContent();
    } else {
      // Extract visible text from body, excluding script/style tags
      text = await page.evaluate(() => {
        const body = document.body;
        const walker = document.createTreeWalker(
          body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              
              const tag = parent.tagName.toLowerCase();
              if (['script', 'style', 'noscript'].includes(tag)) {
                return NodeFilter.FILTER_REJECT;
              }
              
              const style = window.getComputedStyle(parent);
              if (style.display === 'none' || style.visibility === 'hidden') {
                return NodeFilter.FILTER_REJECT;
              }
              
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );
        
        let text = '';
        let node;
        while (node = walker.nextNode()) {
          text += node.textContent + ' ';
        }
        return text;
      });
    }
    
    await browser.close();
    
    // Clean and truncate text
    const cleaned = text.trim().replace(/\s+/g, ' ');
    
    return {
      found,
      text: cleaned.substring(0, 2000), // Limit to 2000 chars
      length: cleaned.length,
      truncated: cleaned.length > 2000
    };
    
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
  
  if (args.length < 1) {
    console.log(JSON.stringify({
      error: 'Usage: node get-text.js <url> [selector]'
    }));
    process.exit(1);
  }
  
  const [url, selector] = args;
  
  getText(url, selector)
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => console.log(JSON.stringify({ error: error.message })));
}

module.exports = { getText };
