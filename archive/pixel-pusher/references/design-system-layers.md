# Design System Layers

Comprehensive guide to all layers of a professional design system. Use this as a reference when extracting design patterns from references or creating new design systems.

## Visual Foundation

### Colors

**Extract and document:**

- **Primary colors**: Main brand colors (usually 1-2 colors with 50-900 shades)
- **Secondary colors**: Supporting colors for variety
- **Neutral colors**: Grays for text, borders, backgrounds (50-900 shades)
- **Semantic colors**: Success (green), Error (red), Warning (yellow), Info (blue)
- **Surface colors**: Page background, card background, overlays
- **Text colors**: Primary text, secondary text, disabled text, link colors

**Usage context for each color:**
- When to use primary vs secondary
- Text color on different backgrounds
- Hover/active state colors
- Focus ring colors

**Accessibility requirements:**
- Text on background must meet WCAG AA (4.5:1 for body, 3:1 for large text)
- Interactive elements need sufficient contrast
- Focus indicators must be clearly visible

**Color psychology considerations:**
- What emotions do these colors evoke?
- Industry appropriateness
- Cultural considerations

### Typography

**Font families:**
- Heading font (display/decorative)
- Body font (readable, clear)
- Monospace font (for code)
- Fallback fonts for each

**Type scale (size, weight, line-height, letter-spacing):**
- H1 - Page titles (3-4rem, bold, tight line-height)
- H2 - Section headings (2-2.5rem, bold/semibold)
- H3 - Subsection headings (1.5-2rem, semibold)
- H4 - Component headings (1.25-1.5rem, medium/semibold)
- H5 - Small headings (1.125-1.25rem, medium)
- Body Large - Emphasis text (1.125rem, regular)
- Body - Default text (1rem, regular, 1.6 line-height)
- Body Small - Supporting text (0.875rem, regular)
- Caption - Metadata/labels (0.75rem, regular, tight)

**Hierarchy rules:**
- When to use each heading level
- Maximum heading levels per page
- Spacing between headings

**Responsive typography:**
- How sizes scale across breakpoints
- Fluid typography formulas if applicable

### Spacing System

**Base unit**: 4px or 8px (most common)

**Scale**: 0, 0.25rem, 0.5rem, 0.75rem, 1rem, 1.25rem, 1.5rem, 2rem, 2.5rem, 3rem, 4rem, 5rem, 6rem, 8rem

**Application:**
- Component internal padding
- Margins between elements
- Grid/layout gutters
- Section spacing

**Rhythm principles:**
- Consistent vertical rhythm
- Proportional relationships
- Optical adjustments when needed

### Shadows & Elevation

**Elevation scale (0-5):**
- **0**: Flat (no shadow)
- **1**: Subtle lift (sm shadow) - hoverable cards
- **2**: Raised (md shadow) - default cards
- **3**: Floating (lg shadow) - dropdown menus
- **4**: Overlay (xl shadow) - modals
- **5**: Maximum (2xl shadow) - important overlays

**Shadow specifications:**
- Y-offset, blur, spread, color with alpha
- Multiple shadows for depth
- Colored shadows for brand personality

**When to use each level:**
- Default state vs hover state
- Static vs interactive elements
- Context-appropriate elevation

## Layout & Structure

### Grid System

**Container:**
- Max-width per breakpoint
- Horizontal padding/margins
- Centering behavior

**Grid specifications:**
- Number of columns (typically 12)
- Gutter width
- Responsive behavior
- Subgrids for nested layouts

**Breakpoints:**
- Mobile: 320px-767px
- Tablet: 768px-1023px
- Desktop: 1024px-1439px
- Wide: 1440px+

### Layout Patterns

**Common patterns to document:**
- Single column (mobile-first)
- Two column (sidebar + main)
- Three column (sidebar + main + aside)
- Grid layouts (cards, galleries)
- Asymmetric layouts

**Content flow:**
- Reading order
- Visual hierarchy
- Whitespace usage

## Component Architecture

### Button Components

**Variants:**
- **Primary**: Main actions (solid background, primary color)
- **Secondary**: Alternative actions (outlined or muted background)
- **Ghost/Text**: Subtle actions (transparent, colored text)
- **Destructive**: Dangerous actions (red, warning indicators)

**Sizes:**
- Small: Tight spaces, secondary actions
- Medium: Default size
- Large: Hero sections, primary CTAs

**States:**
- Default: Base appearance
- Hover: Cursor feedback (darker/lighter, shadow)
- Active: Click feedback (even darker, inset shadow)
- Focus: Keyboard navigation (outline/ring)
- Disabled: Not interactive (reduced opacity, no hover)
- Loading: Spinner + disabled state

**Anatomy:**
- Padding (horizontal and vertical)
- Border radius
- Font size and weight
- Icon spacing if applicable
- Minimum touch target (44x44px mobile)

### Input Components

**Text input variants:**
- Default
- With icon (leading/trailing)
- With helper text
- With error message

**States:**
- Empty
- Filled
- Focus
- Error
- Disabled
- Read-only

**Validation:**
- Error styling (red border, error icon)
- Success styling (green border, check icon)
- Inline validation timing

### Card Components

**Anatomy:**
- Padding
- Border/shadow
- Border radius
- Background color

**Variants:**
- Basic (content only)
- With image (header image)
- With actions (buttons/links)
- Interactive (clickable)

**States:**
- Default
- Hover (if interactive)
- Active/Selected

### Navigation Components

**Navbar:**
- Logo placement and sizing
- Navigation items layout
- Mobile hamburger menu
- Sticky/fixed behavior

**Tabs:**
- Active/inactive states
- Underline/background indicator
- Spacing between tabs

**Breadcrumbs:**
- Separator style
- Link vs text
- Truncation on mobile

### Form Components

**Checkbox:**
- Checked/unchecked/indeterminate
- Size and spacing
- Label alignment

**Radio buttons:**
- Similar to checkbox
- Group spacing

**Select dropdown:**
- Trigger appearance
- Dropdown menu styling
- Selected state
- Multi-select behavior

**Toggle switch:**
- On/off states
- Size variants
- Label placement

## Motion & Interaction

### Animation Principles

**Duration scale:**
- Fast (150ms): Small changes, micro-interactions
- Normal (250ms): Default transitions
- Slow (350ms): Complex animations, page transitions

**Easing functions:**
- **Ease-out**: Accelerate then decelerate (default)
- **Ease-in**: Start slow, accelerate
- **Ease-in-out**: Smooth start and end
- **Linear**: Constant speed (loading indicators)

**Animation types:**
- **Fade**: Opacity changes
- **Slide**: Position changes
- **Scale**: Size changes
- **Rotate**: Transform rotations
- **Combined**: Multiple properties

### Interaction Patterns

**Hover feedback:**
- Color change
- Shadow elevation
- Scale (subtle, 102-105%)
- Underline for links

**Click/tap feedback:**
- Slight scale down (98%)
- Darker color
- Ripple effect (Material Design)

**Loading states:**
- Skeleton screens (preserve layout)
- Spinners (for small areas)
- Progress bars (known duration)

**Transition patterns:**
- Page transitions (fade/slide)
- Modal appearances (scale + fade)
- Drawer slides (slide from edge)
- Toast notifications (slide from top/bottom)

## Accessibility Standards

### WCAG 2.1 Level AA Requirements

**Color contrast:**
- Body text (16px-): 4.5:1 minimum
- Large text (18px+ regular, 14px+ bold): 3:1 minimum
- UI components: 3:1 minimum

**Focus indicators:**
- Visible outline or ring
- Minimum 2px width
- High contrast with background
- Not relying on color alone

**Keyboard navigation:**
- All interactive elements keyboard accessible
- Logical tab order
- Skip links for long navigation
- Escape key closes modals/dropdowns

**Screen reader support:**
- Semantic HTML elements
- ARIA labels for icons
- ARIA live regions for dynamic content
- Alt text for images

**Touch targets:**
- Minimum 44x44px (iOS guideline)
- Sufficient spacing between targets
- Larger on mobile devices

### Best Practices

**Forms:**
- Labels associated with inputs
- Error messages clearly identified
- Required field indicators

**Images:**
- Descriptive alt text
- Decorative images have empty alt
- Complex images have extended descriptions

**Tables:**
- Table headers (th) properly used
- Caption or aria-label for context
- Sortable columns clearly indicated

## Content & Voice

### Writing Guidelines

**Voice characteristics:**
- Tone: Professional, friendly, helpful, etc.
- Personality: Formal vs casual
- Brand values reflected

**Microcopy patterns:**
- Button labels: Verb-first, action-oriented ("Get Started", "Save Changes")
- Error messages: Clear, helpful, actionable
- Success messages: Positive, confirmatory
- Empty states: Encouraging, guiding

**Content hierarchy:**
- Headlines: Clear, benefit-driven
- Body: Scannable, concise
- CTAs: Compelling, specific

## Iconography

### Icon System

**Style:**
- Outline vs filled vs duotone
- Stroke width consistency
- Corner radius treatment
- Optical balance

**Sizing:**
- Small: 16px (inline with text)
- Medium: 24px (default)
- Large: 32px+ (feature icons)

**Usage:**
- When to use icons vs text
- Icon + text label vs icon alone
- Decorative vs functional icons

**Accessibility:**
- Functional icons need labels
- ARIA attributes for screen readers
- Don't rely on icons alone for critical info

## Imagery

### Image Guidelines

**Aspect ratios:**
- Hero images: 16:9 or 21:9
- Portraits: 3:4 or 2:3
- Squares: 1:1

**Treatments:**
- Border radius application
- Overlays for text legibility
- Filters (grayscale, blur, etc.)

**Quality standards:**
- Resolution requirements
- Compression guidelines
- Format recommendations (WebP, AVIF)

**Placeholder handling:**
- Skeleton screens
- Blur-up technique
- Dominant color backgrounds

## Implementation Notes

### CSS Variables

Generate CSS custom properties from design tokens:

```css
:root {
  --color-primary-500: #0ea5e9;
  --spacing-4: 1rem;
  --shadow-md: 0 4px 6px rgba(0,0,0,0.1);
  --radius-md: 0.5rem;
}
```

### Utility Classes

Consider generating utility classes:
- Color classes: `.text-primary`, `.bg-neutral-100`
- Spacing classes: `.p-4`, `.m-8`, `.gap-6`
- Typography classes: `.text-h1`, `.text-body`

### Component Examples

Provide code examples for each component showing all variants and states in actual HTML/CSS.

## Quality Assurance

### Design Review Checklist

- [ ] All colors from defined palette
- [ ] Typography scale applied consistently
- [ ] Spacing follows system
- [ ] Components match specifications
- [ ] Accessibility requirements met
- [ ] Responsive across breakpoints
- [ ] Interactive states implemented
- [ ] Loading/error states handled
- [ ] Browser compatibility verified
- [ ] Performance optimized
