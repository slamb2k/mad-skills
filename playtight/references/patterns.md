# Browser Automation Patterns

## Common Extraction Patterns

### GitHub PR Status Check

```bash
node scripts/navigate-and-extract.js "https://github.com/user/repo/pull/123" '{
  "waitFor": ".merge-status-item",
  "counts": {
    "total_checks": ".merge-status-item",
    "passing_checks": ".merge-status-item.text-green"
  },
  "checks": {
    "has_conflicts": "text=conflicts",
    "is_approved": ".review-status.approved"
  },
  "selectors": {
    "title": ".js-issue-title"
  }
}'
```

### Form Field Discovery

```bash
# Step 1: Find form
node scripts/check-element.js "https://example.com" "form#login"

# Step 2: Find inputs
node scripts/check-element.js "https://example.com" "input[name='username']"
node scripts/check-element.js "https://example.com" "input[name='password']"
node scripts/check-element.js "https://example.com" "button[type='submit']"
```

### Content Verification

```bash
# Check if specific text appears
node scripts/get-text.js "https://example.com/docs" ".main-content"

# Verify element visibility
node scripts/check-element.js "https://example.com" "#success-message"
```

### CI/CD Dashboard Status

```bash
node scripts/navigate-and-extract.js "https://ci.example.com/build/123" '{
  "waitFor": ".build-status",
  "selectors": {
    "status": ".build-status",
    "branch": ".branch-name",
    "commit": ".commit-hash"
  },
  "checks": {
    "is_passing": ".status-success",
    "is_running": ".status-running"
  }
}'
```

## Error Handling

All scripts return JSON with error information:

```json
{
  "found": false,
  "error": "timeout navigating to page"
}
```

Check `success`, `found`, or `error` fields in responses.

## Performance Tips

1. **Use waitFor**: Specify element to wait for in navigate-and-extract
2. **Batch extractions**: Use navigate-and-extract for multiple elements
3. **Headless mode**: All scripts run headless by default (fast)
4. **Truncation**: Scripts automatically limit text length
