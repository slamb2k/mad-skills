# Accessibility Guidelines

WCAG 2.1 Level AA compliance checklist and best practices for web design.

## Color & Contrast

### Text Contrast Requirements

**Normal text (< 18px or < 14px bold):**
- Minimum contrast ratio: 4.5:1 against background
- Example: #18181b text on #ffffff = 19.56:1 ✓
- Example: #71717a text on #fafafa = 2.8:1 ✗

**Large text (≥ 18px or ≥ 14px bold):**
- Minimum contrast ratio: 3:1 against background
- Recommended: Still aim for 4.5:1 when possible

**UI Components & Graphics:**
- Interactive elements: 3:1 against adjacent colors
- Graphs, charts, icons: 3:1 minimum
- Focus indicators: 3:1 against background

### Tools for Testing

Use these tools to verify contrast:
- WebAIM Contrast Checker
- Chrome DevTools Lighthouse
- Stark plugin (Figma/Sketch)
- Contrast Analyzer (desktop app)

### Common Issues

**Insufficient contrast:**
- Light gray text on white (#aaa on #fff = 2.3:1)
- Placeholder text often fails (many browsers use low contrast)
- Disabled states (okay to have lower contrast, but clearly indicate disabled)

**Good practices:**
- Text on images: Add overlay or shadow for contrast
- Links: Underline or sufficient contrast difference
- Buttons: Ensure text contrasts with background

## Semantic HTML

### Use Appropriate Elements

**Navigation:**
```html
<nav>
  <ul>
    <li><a href="/">Home</a></li>
  </ul>
</nav>
```

**Main content:**
```html
<main>
  <article>
    <h1>Page Title</h1>
    <p>Content...</p>
  </article>
</main>
```

**Complementary content:**
```html
<aside>
  <h2>Related Links</h2>
</aside>
```

**Page sections:**
```html
<section>
  <h2>Section Title</h2>
</section>
```

**Buttons vs Links:**
- `<button>`: Actions (submit, toggle, trigger)
- `<a>`: Navigation to another page/location

### Heading Hierarchy

**Rules:**
- One `<h1>` per page (page title)
- Don't skip levels (h1 → h3 is wrong)
- Headings create document outline

**Good structure:**
```html
<h1>Main Title</h1>
  <h2>Section 1</h2>
    <h3>Subsection 1.1</h3>
    <h3>Subsection 1.2</h3>
  <h2>Section 2</h2>
```

### Lists

**Use lists for:**
- Navigation menus
- Steps/sequences
- Related items
- Features/benefits

**Types:**
- `<ul>`: Unordered (bullets)
- `<ol>`: Ordered (numbers)
- `<dl>`: Definition lists (term/description pairs)

## Keyboard Navigation

### Focus Management

**All interactive elements must be keyboard accessible:**
- Links (`<a>`)
- Buttons (`<button>`)
- Form inputs
- Custom interactive elements (add tabindex="0")

**Focus indicators must be visible:**
```css
button:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 2px;
}
```

**Don't remove default focus without replacement:**
```css
/* BAD */
*:focus { outline: none; }

/* GOOD */
*:focus { outline: 2px solid #0ea5e9; }
```

### Tab Order

**Natural DOM order is best:**
- Don't use `tabindex` values > 0 (breaks natural flow)
- Use `tabindex="-1"` to remove from tab order when appropriate
- Use `tabindex="0"` to add custom elements to tab order

**Skip links for long navigation:**
```html
<a href="#main-content" class="skip-link">
  Skip to main content
</a>
```

```css
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: #000;
  color: #fff;
  padding: 8px;
}

.skip-link:focus {
  top: 0;
}
```

### Keyboard Shortcuts

**Essential interactions:**
- **Tab**: Move forward through interactive elements
- **Shift+Tab**: Move backward
- **Enter**: Activate links/buttons
- **Space**: Activate buttons, checkboxes
- **Escape**: Close modals/dropdowns
- **Arrow keys**: Navigate within components (tabs, menus, sliders)

**Custom interactions:**
Document any custom keyboard shortcuts clearly in UI.

## Screen Readers

### Alternative Text

**Images:**
```html
<!-- Informative image -->
<img src="chart.png" alt="Bar chart showing 60% increase in revenue">

<!-- Decorative image -->
<img src="decorative-border.png" alt="">

<!-- Image as link -->
<a href="/products">
  <img src="logo.png" alt="Acme Products Homepage">
</a>
```

**Icons:**
```html
<!-- Functional icon with text -->
<button>
  <svg aria-hidden="true">...</svg>
  <span>Save</span>
</button>

<!-- Functional icon without visible text -->
<button aria-label="Save document">
  <svg aria-hidden="true">...</svg>
</button>

<!-- Decorative icon -->
<span aria-hidden="true">★</span>
```

### ARIA Labels

**Form inputs:**
```html
<!-- Visible label (preferred) -->
<label for="email">Email Address</label>
<input id="email" type="email">

<!-- ARIA label when visible label not possible -->
<input type="search" aria-label="Search products" placeholder="Search...">
```

**Buttons:**
```html
<!-- Text describes action (no ARIA needed) -->
<button>Submit Application</button>

<!-- Icon-only button needs label -->
<button aria-label="Close dialog">
  <svg>...</svg>
</button>
```

**Navigation landmarks:**
```html
<nav aria-label="Primary navigation">...</nav>
<nav aria-label="Footer navigation">...</nav>
```

### Live Regions

**Dynamic content updates:**
```html
<!-- Polite: announce when user is idle -->
<div aria-live="polite" aria-atomic="true">
  <p>5 new messages</p>
</div>

<!-- Assertive: announce immediately -->
<div role="alert" aria-live="assertive">
  <p>Error: Failed to save changes</p>
</div>

<!-- Status: for status messages -->
<div role="status" aria-live="polite">
  <p>Saving...</p>
</div>
```

**Loading states:**
```html
<button aria-busy="true" aria-label="Loading, please wait">
  <span class="spinner" aria-hidden="true"></span>
  Loading...
</button>
```

## Forms

### Labels & Instructions

**Every input needs a label:**
```html
<!-- Explicit label (preferred) -->
<label for="username">Username</label>
<input id="username" type="text">

<!-- Implicit label -->
<label>
  Username
  <input type="text">
</label>
```

**Required fields:**
```html
<label for="email">
  Email Address
  <span aria-label="required">*</span>
</label>
<input id="email" type="email" required aria-required="true">
```

**Helper text:**
```html
<label for="password">Password</label>
<input id="password" 
       type="password" 
       aria-describedby="password-hint">
<div id="password-hint">
  Must be at least 8 characters
</div>
```

### Error Handling

**Validation errors:**
```html
<label for="email">Email Address</label>
<input id="email" 
       type="email" 
       aria-invalid="true"
       aria-describedby="email-error">
<div id="email-error" role="alert">
  Please enter a valid email address
</div>
```

**Error summary:**
```html
<div role="alert" aria-labelledby="error-heading">
  <h2 id="error-heading">There are 2 errors in this form</h2>
  <ul>
    <li><a href="#email">Email address is required</a></li>
    <li><a href="#password">Password must be at least 8 characters</a></li>
  </ul>
</div>
```

### Fieldsets & Groups

**Related inputs:**
```html
<fieldset>
  <legend>Shipping Address</legend>
  <label for="street">Street</label>
  <input id="street" type="text">
  
  <label for="city">City</label>
  <input id="city" type="text">
</fieldset>
```

**Radio button groups:**
```html
<fieldset>
  <legend>Select your plan</legend>
  <label>
    <input type="radio" name="plan" value="basic">
    Basic
  </label>
  <label>
    <input type="radio" name="plan" value="pro">
    Pro
  </label>
</fieldset>
```

## Interactive Components

### Buttons

**Button requirements:**
- Minimum size: 44x44px (iOS guideline)
- Clear focus indicator
- Disabled state clearly visible
- Loading state announced to screen readers

```html
<!-- Primary action -->
<button type="button">Save Changes</button>

<!-- Disabled -->
<button type="button" disabled aria-disabled="true">
  Save Changes
</button>

<!-- Loading -->
<button type="button" aria-busy="true" aria-label="Saving, please wait">
  <span class="spinner" aria-hidden="true"></span>
  Saving...
</button>
```

### Modals/Dialogs

**Modal requirements:**
- Focus trap (keep focus inside modal)
- Close with Escape key
- Return focus to trigger element on close
- Screen readers announce modal opening

```html
<div role="dialog" 
     aria-modal="true" 
     aria-labelledby="dialog-title">
  <h2 id="dialog-title">Confirm Action</h2>
  <p>Are you sure you want to delete this item?</p>
  <button type="button">Cancel</button>
  <button type="button">Delete</button>
</div>
```

### Dropdowns/Menus

**Menu button pattern:**
```html
<button aria-haspopup="true" 
        aria-expanded="false"
        aria-controls="menu">
  Options
</button>
<ul id="menu" role="menu">
  <li role="menuitem">Edit</li>
  <li role="menuitem">Delete</li>
</ul>
```

### Tabs

**Tab pattern:**
```html
<div role="tablist" aria-label="Project details">
  <button role="tab" 
          aria-selected="true" 
          aria-controls="overview-panel">
    Overview
  </button>
  <button role="tab" 
          aria-selected="false" 
          aria-controls="activity-panel">
    Activity
  </button>
</div>

<div id="overview-panel" role="tabpanel">
  Overview content...
</div>
<div id="activity-panel" role="tabpanel" hidden>
  Activity content...
</div>
```

## Mobile & Touch

### Touch Targets

**Minimum sizes:**
- 44x44px on iOS (Apple guideline)
- 48x48px on Android (Material Design)
- Use larger targets for primary actions

**Spacing:**
- 8px minimum between touch targets
- More spacing for dense interfaces

### Viewport & Zoom

**Allow zoom:**
```html
<!-- Good -->
<meta name="viewport" content="width=device-width, initial-scale=1">

<!-- Bad - don't prevent zoom -->
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
```

**Responsive text:**
- Use relative units (rem, em)
- Don't set maximum font size
- Ensure text reflows at 200% zoom

## Testing Checklist

### Automated Testing

- [ ] Run Lighthouse accessibility audit
- [ ] Check WAVE browser extension
- [ ] Validate HTML (W3C validator)
- [ ] Test color contrast (WebAIM checker)

### Manual Testing

- [ ] Navigate entire site using only keyboard
- [ ] Test with screen reader (NVDA, JAWS, VoiceOver)
- [ ] Zoom to 200% and verify layout
- [ ] Test with browser extensions disabled
- [ ] Test on mobile device
- [ ] Test with reduced motion settings
- [ ] Test in high contrast mode

### Specific Checks

- [ ] All images have alt text
- [ ] Forms have proper labels
- [ ] Focus indicators are visible
- [ ] Color is not only method of conveying info
- [ ] Text has sufficient contrast
- [ ] Headings are properly nested
- [ ] Links have descriptive text
- [ ] Videos have captions
- [ ] Audio has transcripts
- [ ] Tables have proper headers
- [ ] Interactive elements are keyboard accessible
- [ ] Error messages are clear and helpful
- [ ] Loading states are announced
- [ ] Modals trap focus and close with Escape

## Common Mistakes

**Don't:**
- Use `<div>` or `<span>` as buttons (use `<button>`)
- Remove focus indicators without replacements
- Use color alone to convey meaning
- Disable zoom on mobile
- Skip heading levels
- Use placeholder as label
- Make click targets too small
- Forget alt text on images
- Use ambiguous link text ("click here")
- Prevent keyboard access to functionality

**Do:**
- Use semantic HTML elements
- Provide clear focus indicators
- Label all form inputs
- Make touch targets 44x44px minimum
- Test with keyboard and screen reader
- Provide alternatives for non-text content
- Write descriptive link text
- Announce dynamic content changes
- Support keyboard navigation patterns
- Document accessibility features

## Resources

**Testing tools:**
- Chrome DevTools Lighthouse
- WAVE (Web Accessibility Evaluation Tool)
- axe DevTools
- Screen readers: NVDA (Windows), JAWS (Windows), VoiceOver (Mac/iOS)

**Guidelines:**
- WCAG 2.1: https://www.w3.org/WAI/WCAG21/quickref/
- MDN Accessibility: https://developer.mozilla.org/en-US/docs/Web/Accessibility
- WebAIM: https://webaim.org/

**Patterns:**
- ARIA Authoring Practices: https://www.w3.org/WAI/ARIA/apg/
- Inclusive Components: https://inclusive-components.design/
