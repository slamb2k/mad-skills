# Design Best Practices

Professional design principles and patterns for creating effective user interfaces.

## Visual Hierarchy

### Size & Scale

**Establish clear importance through sizing:**
- Most important: Largest elements (headings, primary CTAs)
- Supporting content: Medium size (body text, secondary buttons)
- Least important: Smallest elements (captions, metadata)

**Golden ratio for scaling:**
- 1.618 multiplier between levels
- Common scales: 1.2, 1.25, 1.333, 1.5, 1.618

**Example scale (1.25):**
- 12px → 15px → 19px → 24px → 30px → 37px → 46px

### Color & Contrast

**Use color to guide attention:**
- Primary actions: Bright, saturated colors
- Secondary actions: Muted, less saturated
- Destructive actions: Red/warning colors
- Success states: Green
- Neutral actions: Gray scale

**Contrast creates hierarchy:**
- High contrast: Important elements (black on white)
- Medium contrast: Body content (dark gray on white)
- Low contrast: Supporting text (light gray on white)

### Spacing & Proximity

**Related elements group together:**
- Form label close to its input
- Section content tighter than sections
- Card content closer than cards to each other

**Breathing room for importance:**
- More whitespace around important elements
- Generous margins for hero sections
- Tight spacing for dense data

### Position & Alignment

**Users scan in patterns:**
- **F-pattern**: Users scan top, then left side (reading flow)
- **Z-pattern**: Eyes move in Z shape (landing pages)

**Use position strategically:**
- Top-left: Logo, primary navigation
- Top-right: User account, secondary actions
- Center: Primary content, important messages
- Bottom: Footer, tertiary information

## Layout Principles

### Grid Systems

**Benefits:**
- Visual consistency
- Easier responsive design
- Faster design decisions
- Professional appearance

**12-column grid (standard):**
- Flexible divisions: 2, 3, 4, 6 columns
- Common breakpoints: 320px, 768px, 1024px, 1440px
- Gutter: 16px-32px typical

**Grid usage:**
- Full-width: Hero sections, images
- Contained: Body content (max-width for readability)
- Breaking the grid: Intentional, for emphasis

### Whitespace (Negative Space)

**Purpose:**
- Reduce cognitive load
- Improve readability
- Create elegance
- Guide eye movement

**Types:**
- **Macro**: Between major sections
- **Micro**: Between lines, paragraphs, elements

**Best practices:**
- More whitespace = more premium feel
- Whitespace ≠ wasted space
- Embrace emptiness
- Balance density with breathing room

### Responsive Design

**Mobile-first approach:**
1. Design for smallest screen
2. Progressive enhancement for larger screens
3. Content priority drives design

**Breakpoint strategy:**
- **Mobile** (320-767px): Single column, stacked
- **Tablet** (768-1023px): 2 columns, some sidebars
- **Desktop** (1024px+): Full layouts, multi-column

**Responsive patterns:**
- Stack on mobile, side-by-side on desktop
- Hide less important on mobile
- Larger touch targets on mobile (44x44px)
- Readable line length all screens (45-75 characters)

## Typography

### Readability

**Optimal line length:**
- Body text: 45-75 characters per line
- Too short: Choppy reading
- Too long: Eye strain, lose place

**Line height (leading):**
- Body text: 1.5-1.75 (150-175%)
- Headings: 1.2-1.4 (tighter)
- Small text: 1.4-1.6

**Font size:**
- Body minimum: 16px (better: 18px)
- Small text minimum: 14px
- Large displays: Scale up body text

### Font Pairing

**Combination strategies:**
- **Serif + Sans-serif**: Classic, elegant
- **Sans + Sans**: Modern, clean (vary weight/width)
- **Display + Body**: Attention-grabbing

**Rules:**
- Maximum 2-3 font families
- Use weights for hierarchy
- Test at actual sizes
- Consider loading performance

### Typographic Hierarchy

**Clear structure:**
- H1: Page title (unique, largest)
- H2: Major sections
- H3: Subsections
- H4-H6: Less common, use sparingly

**Visual differentiation:**
- Size (most important)
- Weight (bold for emphasis)
- Color (sparingly)
- Letter-spacing (uppercase headings)
- Line height (tighter for headings)

## Color Theory

### Color Psychology

**Color associations:**
- **Blue**: Trust, calm, professional (banks, tech)
- **Green**: Growth, health, nature (wellness, finance)
- **Red**: Energy, urgency, passion (food, entertainment)
- **Yellow**: Optimism, warmth, caution (warnings)
- **Purple**: Luxury, creativity (beauty, arts)
- **Orange**: Friendly, confident (creative, youth)
- **Black**: Sophistication, power (luxury, formal)
- **White**: Purity, simplicity (minimal, modern)

**Context matters:**
- Industry conventions
- Cultural differences
- Competitor colors (differentiate or align)

### Color Harmony

**Common schemes:**

**Monochromatic:**
- Single hue, various shades/tints
- Safe, cohesive, elegant
- Can feel monotonous if overdone

**Analogous:**
- Adjacent colors on wheel (blue, blue-green, green)
- Harmonious, natural
- Pick one dominant

**Complementary:**
- Opposite colors (blue and orange)
- High contrast, vibrant
- Use one as accent

**Triadic:**
- Evenly spaced colors (red, yellow, blue)
- Vibrant, balanced
- Difficult to execute well

### Color Application

**60-30-10 rule:**
- 60%: Dominant color (backgrounds, large areas)
- 30%: Secondary color (contrast, visual interest)
- 10%: Accent color (CTAs, important elements)

**Tints and shades:**
- Create depth with one color
- Generate 50-900 scale
- Lighter: Add white (tints)
- Darker: Add black (shades)

**Semantic colors:**
- Success: Green
- Warning: Yellow/Orange
- Error: Red
- Info: Blue
- Keep consistent meaning

## Component Design

### Buttons

**Clear affordance:**
- Look clickable (shadows, borders, or solid fill)
- Change on hover (color shift, shadow increase)
- Respond to click (active state)

**Hierarchy:**
- **Primary**: One per screen section, most prominent
- **Secondary**: Less prominent, supports primary
- **Tertiary/Ghost**: Least prominent, subtle actions

**Button text:**
- Action-oriented verbs ("Get Started", not "Click Here")
- Specific ("Download Report", not "Submit")
- Concise (1-3 words ideal)

### Cards

**Purpose:**
- Group related information
- Create scannable layouts
- Provide interaction affordance

**Effective cards:**
- Clear visual boundary (shadow, border, background)
- Consistent padding
- Logical content grouping
- Optional: Image, heading, body, actions

**Card grids:**
- Equal heights (or intentional variety)
- Consistent spacing
- Responsive columns (1-2-3-4)

### Forms

**Reduce friction:**
- Only ask for necessary information
- Single column layout (faster completion)
- Logical grouping (fieldsets)
- Clear labels (not just placeholders)
- Inline validation (immediate feedback)

**Field design:**
- Label above input (don't float)
- Sufficient spacing between fields
- Error messages near relevant field
- Success indicators
- Clear required field markers

**Submission:**
- Prominent submit button
- Loading state while processing
- Clear success/error messages
- Don't disable submit without reason

## User Experience Patterns

### Progressive Disclosure

**Don't overwhelm users:**
- Show essential first
- Reveal details on demand
- Use accordions, tabs, modals

**Examples:**
- Advanced search options (collapsed by default)
- Settings (basic vs advanced)
- Product details (summary → full specs)

### Empty States

**Don't show nothing:**
- Explain why empty
- Guide next action
- Make it welcoming

**Good empty states:**
- Clear headline ("No projects yet")
- Helpful description ("Create your first project to get started")
- Clear CTA ("Create Project" button)
- Optional: Illustration or icon

### Loading States

**Set expectations:**
- Show something is happening
- Indicate progress if possible
- Preserve layout (avoid jumping)

**Techniques:**
- Spinners (short waits)
- Progress bars (known duration)
- Skeleton screens (preserve structure)
- Optimistic UI (show result before confirming)

### Error Handling

**User-friendly errors:**
- Clear what went wrong
- Why it happened
- How to fix it
- Avoid technical jargon

**Example:**
- ❌ "Error 500: Internal server exception"
- ✅ "We couldn't save your changes. Please try again, or contact support if the problem persists."

### Feedback & Confirmation

**Acknowledge actions:**
- Button press (visual feedback)
- Form submission (success message)
- Destructive actions (confirm first)
- Background processes (notifications)

**Toast notifications:**
- Brief message
- Auto-dismiss (3-5 seconds)
- Don't block interaction
- Success, warning, error styles

## Visual Design

### Consistency

**Maintain patterns:**
- Same component style throughout
- Consistent spacing rhythm
- Unified color application
- Predictable interactions

**Design system benefits:**
- Faster design decisions
- Cohesive experience
- Easier maintenance
- Team alignment

### Balance & Symmetry

**Visual weight distribution:**
- Symmetrical: Formal, stable (traditional sites)
- Asymmetrical: Dynamic, modern (contemporary design)

**Creating balance:**
- Size (larger = heavier)
- Color (bright = heavier)
- Position (center = focal point)
- Density (more elements = heavier)

### Depth & Elevation

**Create hierarchy with depth:**
- Flat: Background elements
- Raised: Cards, panels
- Floating: Dropdowns, tooltips
- Overlay: Modals, drawers

**Techniques:**
- Shadows (most common)
- Borders
- Background color contrast
- Blur effects (backdrop)

## Performance & Optimization

### Image Optimization

**Best practices:**
- Use appropriate formats (WebP, AVIF)
- Compress without visible quality loss
- Responsive images (srcset)
- Lazy loading for below-fold images

**File size targets:**
- Hero images: < 200KB
- Icons: SVG when possible
- Thumbnails: < 50KB

### CSS Optimization

**Minimize render blocking:**
- Critical CSS inline
- Defer non-critical styles
- Remove unused CSS
- Minimize specificity

**Efficient selectors:**
- Classes over IDs
- Avoid deep nesting
- Use CSS variables for themes

### Animation Performance

**60fps animations:**
- Animate transform, opacity only
- Avoid animating width, height, margin
- Use will-change sparingly
- Reduce motion for preferences

```css
/* Good performance */
.card {
  transition: transform 0.3s, opacity 0.3s;
}

.card:hover {
  transform: translateY(-4px);
}

/* Poor performance */
.card {
  transition: margin-top 0.3s;
}

.card:hover {
  margin-top: -4px;
}
```

## Modern Design Trends

### Minimalism

**Principles:**
- Remove unnecessary elements
- Focus on content
- Ample whitespace
- Simple color palettes
- Clean typography

**When appropriate:**
- Content-focused sites
- Professional services
- Tech products
- Modern brands

### Neumorphism (Soft UI)

**Characteristics:**
- Soft shadows (inner and outer)
- Subtle depth
- Light backgrounds
- Muted colors

**Considerations:**
- Accessibility concerns (low contrast)
- Best for accent elements
- Don't overuse

### Glassmorphism

**Characteristics:**
- Semi-transparent elements
- Backdrop blur
- Light borders
- Subtle shadows

**Usage:**
- Navigation bars
- Cards over images
- Modals
- Modern, premium feel

### Dark Mode

**Considerations:**
- Don't just invert colors
- Use dark grays, not pure black
- Reduce white brightness
- Maintain contrast ratios
- Provide toggle option

**Benefits:**
- Reduces eye strain (low light)
- Saves battery (OLED)
- Modern aesthetic
- User preference

## Checklist for Good Design

**Visual:**
- [ ] Clear hierarchy
- [ ] Consistent spacing
- [ ] Readable typography
- [ ] Appropriate color usage
- [ ] Professional imagery

**Usability:**
- [ ] Intuitive navigation
- [ ] Clear CTAs
- [ ] Fast load times
- [ ] Mobile-friendly
- [ ] Accessible to all users

**Content:**
- [ ] Scannable layout
- [ ] Clear messaging
- [ ] Logical flow
- [ ] Action-oriented copy
- [ ] Trustworthy

**Polish:**
- [ ] Smooth animations
- [ ] Consistent interactions
- [ ] Attention to detail
- [ ] Tested across devices
- [ ] Error-free

## Anti-Patterns to Avoid

**Visual:**
- Too many font families
- Poor color contrast
- Inconsistent spacing
- Cluttered layouts
- Low-quality images

**Interaction:**
- Hidden navigation
- Unclear buttons
- Disabled elements without explanation
- Surprising behavior
- Modal overuse

**Content:**
- Walls of text
- Vague CTAs
- Jargon-heavy copy
- Poor information architecture
- Outdated content

**Technical:**
- Slow loading
- Not responsive
- Broken links
- Poor accessibility
- Browser incompatibility
