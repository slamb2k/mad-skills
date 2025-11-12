# Style Guide Template

Visual reference document for design system. Use this template to create comprehensive style guides.

## Style Guide Structure

### Cover Page
- Project/Product name
- Design system version
- Last updated date
- Team/designer names

### Table of Contents
1. Brand Identity
2. Color Palette
3. Typography
4. Spacing & Layout
5. Components
6. Iconography
7. Imagery
8. Voice & Tone
9. Usage Guidelines

---

## 1. Brand Identity

### Brand Values
- **Value 1:** Brief description
- **Value 2:** Brief description
- **Value 3:** Brief description

### Brand Personality
- **Adjective 1:** How this shows in design
- **Adjective 2:** How this shows in design
- **Adjective 3:** How this shows in design

### Logo Usage
**Primary logo:**
- Full color version
- Minimum size
- Clear space requirements
- Acceptable variations

**Don'ts:**
- Don't stretch or distort
- Don't change colors
- Don't add effects
- Don't place on busy backgrounds

---

## 2. Color Palette

### Primary Colors

**[Primary Color Name] (#HEX)**
- **Usage:** Primary actions, headers, brand elements
- **Shades:** 50, 100, 200, 300, 400, 500 (base), 600, 700, 800, 900
- **Contrast:** #FFFFFF text passes WCAG AA on 600+

**Visual swatch showing:**
```
50  100  200  300  400  500  600  700  800  900
░░░  ░░   ▒▒   ▓▓   ▓▓   ███  ███  ███  ███  ███
```

### Secondary Colors

**[Secondary Color Name] (#HEX)**
- **Usage:** Secondary actions, accents, variety
- **Shades:** [Same structure as primary]

### Neutral Colors

**Grays (#HEX)**
- **Usage:** Text, borders, backgrounds, shadows
- **Shades:** 50 (lightest) to 900 (darkest)

### Semantic Colors

**Success (#HEX)**
- Usage: Success messages, confirmations, positive actions
- Accessibility: Passes WCAG AA

**Warning (#HEX)**
- Usage: Warning messages, caution states
- Accessibility: Passes WCAG AA

**Error (#HEX)**
- Usage: Error messages, destructive actions
- Accessibility: Passes WCAG AA

**Info (#HEX)**
- Usage: Informational messages, help text
- Accessibility: Passes WCAG AA

### Color Combinations

**Approved combinations:**
- Primary 600 on White
- White on Primary 700
- Neutral 900 on Primary 50
- Neutral 700 on Neutral 100

**Avoid:**
- Low contrast combinations
- Primary on Secondary (insufficient contrast)
- Pure black (#000) on anything (too harsh)

---

## 3. Typography

### Font Families

**Heading Font: [Font Name]**
- Source: Google Fonts / Custom / System
- Weights available: 400, 600, 700
- Fallback: -apple-system, BlinkMacSystemFont, sans-serif

**Body Font: [Font Name]**
- Source: Google Fonts / Custom / System
- Weights available: 400, 500, 600
- Fallback: -apple-system, BlinkMacSystemFont, sans-serif

**Monospace Font: [Font Name]**
- Source: System
- Usage: Code, technical content
- Fallback: 'Courier New', monospace

### Type Scale

**Heading 1**
- Size: 3.5rem (56px)
- Weight: 700 (Bold)
- Line height: 1.2
- Letter spacing: -0.02em
- Usage: Page titles, hero headlines

**Heading 2**
- Size: 2.5rem (40px)
- Weight: 700 (Bold)
- Line height: 1.3
- Letter spacing: -0.01em
- Usage: Section headings

**Heading 3**
- Size: 2rem (32px)
- Weight: 600 (Semibold)
- Line height: 1.4
- Letter spacing: 0
- Usage: Subsection headings

**Heading 4**
- Size: 1.5rem (24px)
- Weight: 600 (Semibold)
- Line height: 1.4
- Usage: Card headings, component titles

**Heading 5**
- Size: 1.25rem (20px)
- Weight: 500 (Medium)
- Line height: 1.5
- Usage: Small headings

**Body Large**
- Size: 1.125rem (18px)
- Weight: 400 (Regular)
- Line height: 1.6
- Usage: Emphasis paragraphs, introductions

**Body**
- Size: 1rem (16px)
- Weight: 400 (Regular)
- Line height: 1.6
- Usage: Default body text

**Body Small**
- Size: 0.875rem (14px)
- Weight: 400 (Regular)
- Line height: 1.5
- Usage: Supporting text, captions

**Caption**
- Size: 0.75rem (12px)
- Weight: 400 (Regular)
- Line height: 1.4
- Letter spacing: 0.01em
- Usage: Metadata, labels

### Text Colors

- **Primary text:** Neutral 900 (#18181b)
- **Secondary text:** Neutral 600 (#52525b)
- **Disabled text:** Neutral 400 (#a1a1aa)
- **Link text:** Primary 600 (#0284c7)
- **Link hover:** Primary 700 (#0369a1)

### Formatting Guidelines

**Emphasis:**
- **Bold** for strong emphasis
- *Italic* for subtle emphasis
- Underline for links only

**Paragraphs:**
- Max width: 65-75 characters
- Spacing: 1.5em between paragraphs
- First line: No indent (web convention)

**Lists:**
- Bullet points: Circle bullets
- Numbered lists: Numbers with period
- Spacing: 0.5em between items

---

## 4. Spacing & Layout

### Spacing Scale

Based on 8px base unit:

| Token | Value | Pixels | Usage |
|-------|-------|--------|-------|
| 0 | 0 | 0px | Reset/None |
| 1 | 0.25rem | 4px | Icon spacing |
| 2 | 0.5rem | 8px | Tight spacing |
| 3 | 0.75rem | 12px | Component padding |
| 4 | 1rem | 16px | Default spacing |
| 6 | 1.5rem | 24px | Card padding |
| 8 | 2rem | 32px | Section spacing |
| 12 | 3rem | 48px | Large spacing |
| 16 | 4rem | 64px | Hero spacing |
| 24 | 6rem | 96px | XL spacing |

### Grid System

**Container:**
- Max width: 1280px (desktop)
- Horizontal padding: 24px (mobile), 32px (desktop)
- Centered with auto margins

**Grid:**
- Columns: 12
- Gutter: 24px
- Responsive breakpoints

**Breakpoints:**
- Mobile: 320px - 767px (full width, single column)
- Tablet: 768px - 1023px (80% width, 2-3 columns)
- Desktop: 1024px - 1439px (max 1280px, multi-column)
- Wide: 1440px+ (max 1280px, multi-column)

### Layout Patterns

**Single column (Mobile):**
- Full width sections
- Stacked components
- Minimal horizontal spacing

**Two column (Tablet):**
- 8-4 column split (main-sidebar)
- 6-6 column split (equal)
- Responsive card grids

**Multi-column (Desktop):**
- 3-6-3 (sidebar-main-sidebar)
- 4-4-4 (three equal)
- Flexible grid layouts

---

## 5. Components

### Buttons

**Primary Button**
- Background: Primary 600
- Text: White
- Padding: 12px 24px
- Border radius: 8px
- Font weight: 500

**States:**
- Hover: Primary 700 background
- Active: Primary 800 background
- Focus: 2px outline, Primary 500
- Disabled: Neutral 200 background, Neutral 400 text

**Secondary Button**
- Background: Neutral 200
- Text: Neutral 900
- [Same measurements as primary]

**Ghost Button**
- Background: Transparent
- Text: Primary 600
- [Same measurements as primary]

### Input Fields

**Text Input**
- Height: 44px
- Padding: 12px 16px
- Border: 1px solid Neutral 300
- Border radius: 8px
- Font size: 16px

**States:**
- Focus: Primary 500 border, 2px outline
- Error: Error 500 border, error icon
- Success: Success 500 border, check icon
- Disabled: Neutral 100 background

### Cards

**Standard Card**
- Background: White
- Border: 1px solid Neutral 200
- Border radius: 12px
- Padding: 24px
- Shadow: 0 4px 6px rgba(0,0,0,0.1)

**Interactive Card**
- Hover: Shadow increases, slight lift
- Active: Shadow reduces
- Cursor: Pointer

### Navigation

**Navbar**
- Height: 64px
- Background: White
- Border bottom: 1px solid Neutral 200
- Padding: 0 32px
- Sticky positioning

**Nav Items**
- Font size: 16px
- Font weight: 500
- Spacing: 24px between items
- Active: Primary 600 color, underline

---

## 6. Iconography

### Icon Style
- **Style:** Outline
- **Stroke width:** 2px
- **Corner radius:** 2px
- **Optical balance:** Centered in viewBox

### Icon Sizes
- **Small:** 16px (inline with text)
- **Medium:** 24px (default, most common)
- **Large:** 32px (feature icons)
- **XL:** 48px+ (hero sections)

### Icon Colors
- **Primary:** Neutral 700 (default)
- **Secondary:** Neutral 500
- **Accent:** Primary 600
- **Success:** Success 600
- **Error:** Error 600

### Icon Library
List of commonly used icons:
- Home, Search, Menu, Close
- User, Settings, Notifications
- Arrow (up, down, left, right)
- Check, X, Info, Warning
- Plus, Minus, Edit, Delete
- Calendar, Clock, Location

---

## 7. Imagery

### Photography Style

**Characteristics:**
- Bright, natural lighting
- Authentic, not overly staged
- Diverse subjects
- Clean backgrounds

**Aspect ratios:**
- Hero: 21:9 or 16:9
- Portrait: 3:4
- Square: 1:1
- Thumbnail: 4:3

**Treatments:**
- Border radius: 12px for cards
- Overlay for text: 40% black gradient
- No filters except brand-approved
- Minimum resolution: 2x display size

### Illustrations

**Style:**
- Flat design
- Brand colors only
- Simple geometric shapes
- Consistent stroke width

**Usage:**
- Empty states
- Error messages
- Onboarding
- Feature explanations

---

## 8. Voice & Tone

### Brand Voice

**Characteristics:**
- Professional but approachable
- Clear and concise
- Helpful and encouraging
- Confident without arrogance

**We are:**
- Knowledgeable experts
- Supportive partners
- Clear communicators

**We are not:**
- Overly casual or jokey
- Condescending or robotic
- Vague or uncertain

### Tone Variations

**Marketing:**
- Energetic and inspiring
- Benefit-focused
- Action-oriented

**Product UI:**
- Clear and direct
- Task-focused
- Minimal and efficient

**Support:**
- Patient and helpful
- Solution-oriented
- Empathetic

### Writing Guidelines

**Button labels:**
- Start with verb
- Be specific
- Keep short (1-3 words)
- Examples: "Get Started", "Save Changes", "Download Report"

**Error messages:**
- Explain what went wrong
- Suggest how to fix
- Be empathetic
- Example: "We couldn't process your payment. Please check your card details and try again."

**Empty states:**
- Explain why empty
- Guide next action
- Stay positive
- Example: "No projects yet. Create your first project to get started."

---

## 9. Usage Guidelines

### Do's and Don'ts

**Colors:**
✓ Use colors from defined palette
✓ Maintain contrast ratios
✓ Use semantic colors appropriately
✗ Don't invent new brand colors
✗ Don't use color alone to convey meaning
✗ Don't use low-contrast combinations

**Typography:**
✓ Use defined type scale
✓ Maintain hierarchy
✓ Keep line length readable
✗ Don't use too many font families
✗ Don't skip heading levels
✗ Don't use tiny font sizes (<14px)

**Spacing:**
✓ Use spacing scale values
✓ Be consistent
✓ Align to 8px grid
✗ Don't use arbitrary spacing
✗ Don't cram elements together
✗ Don't create uneven rhythms

**Components:**
✓ Use existing components
✓ Follow state patterns
✓ Maintain consistency
✗ Don't reinvent components
✗ Don't customize without reason
✗ Don't ignore accessibility

### Accessibility Requirements

**Minimum standards:**
- Color contrast: WCAG AA (4.5:1)
- Touch targets: 44x44px
- Focus indicators: Visible
- Alt text: All images
- Keyboard navigation: Full support

### Maintenance

**Versioning:**
- Major: Breaking changes
- Minor: New components
- Patch: Bug fixes, tweaks

**Updates:**
- Review quarterly
- Document all changes
- Communicate to team
- Update all instances

**Feedback:**
- Designers submit proposals
- Team reviews monthly
- Consensus required
- Document rationale

---

## Visual Examples

### Example Page Layouts
[Include mockups showing:]
- Landing page
- Dashboard
- Form page
- Content page
- Mobile views

### Component Gallery
[Include visuals showing:]
- All button variants
- Form components
- Cards
- Navigation
- Modals
- Common patterns

### Color Swatches
[Include actual color samples]

### Typography Specimens
[Show each text style with sample content]

---

## File Formats

**Design files:**
- Figma/Sketch source files
- Component library
- Design tokens (JSON)

**Development:**
- CSS/SCSS variables
- Tailwind config
- Component code examples

**Documentation:**
- PDF version of style guide
- Interactive HTML version
- Markdown documentation

---

## Credits & Contact

**Design team:**
- Lead Designer: [Name]
- UI Designer: [Name]
- UX Researcher: [Name]

**Contact:**
- Questions: design-team@company.com
- Contributions: Submit via [process]
- Feedback: [feedback channel]

**Resources:**
- Design files: [Link]
- Code repository: [Link]
- Documentation: [Link]

**Last updated:** [Date]
**Version:** [Number]
