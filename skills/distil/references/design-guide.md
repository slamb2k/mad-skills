# Design Quality Standards & Directions

## Quality Standards

Each design should:
- Use custom color palettes (not default Tailwind)
- Include purposeful animations with proper easing
- Have responsive layouts (mobile-first)
- Feature micro-interactions (hover states, focus states, active states)
- Use thoughtful typography hierarchy with characterful fonts
- Include iconography (use Lucide React icons)
- Feel like a premium, polished product
- Accurately reflect the site specification context
- Avoid generic "AI slop" patterns (no Inter, no default blue, no cookie-cutter layouts)

## Design Directions

### Expanded Style Catalog (50+ styles)

Draw from the full style catalog in:
`~/.claude/skills/design-system/SKILL.md`

Categories include:

1. **Minimalist & Modern** — minimalist, brutalist, scandinavian, japandi, swiss
2. **Historical & Classical** — art-deco, art-nouveau, baroque, victorian, renaissance
3. **Retro & Nostalgic** — retro-80s, retro-90s, vaporwave, y2k, mid-century
4. **Digital UI** — glassmorphism, neumorphism, material-design, fluent-design, skeuomorphic
5. **Futuristic & Sci-Fi** — cyberpunk, cybernetic, space-age, dystopian, solarpunk
6. **Nature-Inspired** — organic, botanical, coastal, desert, forest
7. **Bold & Expressive** — maximalist, pop-art, psychedelic, graffiti, punk
8. **Illustration & Artistic** — hand-drawn, watercolor, flat-illustration, isometric, line-art
9. **Cultural & Regional** — mediterranean, nordic, asian-zen, tribal, moroccan
10. **Special Purpose** — dark-mode, high-contrast, print-inspired, terminal, low-fi

### Style Blending

Designs can blend two styles using weighted ratios:
- **Dominant style (70-80%)**: Core colors, primary typography, main spacing
- **Accent style (20-30%)**: Secondary colors, accent fonts, decorative elements

Example: "art-deco with cyberpunk 70/30" = Art Deco base with neon accent highlights.

## Anti-Generic Rules

Read and apply principles from:
- `~/.claude/skills/bencium-innovative-ux-designer/SKILL.md`
- `~/.claude/skills/design-system/references/style-guide.md`

### NEVER use:
- **Fonts**: Inter, Roboto, Arial, Space Grotesk as primary fonts
- **Colors**: Generic SaaS blue (#3B82F6), purple gradients on white backgrounds
- **Patterns**: Cookie-cutter layouts, predictable component arrangements
- **Effects**: Apple design mimicry, liquid/blob backgrounds without purpose
- **Overall**: Anything that looks "AI-generated" or machine-made

### ALWAYS:
- Commit FULLY to the chosen aesthetic direction — no half measures
- Use unexpected, characterful typography choices (dig deep in Google Fonts)
- Create atmosphere: textures, grain, dramatic shadows, gradient meshes
- Use dominant colors with SHARP accents (not timid, evenly-distributed palettes)
- Pick unique color pairs that aren't typical
- Vary everything across designs — no two should share fonts, palettes, or layouts

## Animation Standards

Read and apply principles from:
- `~/.claude/skills/web-animation-design/SKILL.md`
- `~/.claude/skills/bencium-innovative-ux-designer/MOTION-SPEC.md`

### Easing Blueprint
- **ease-out**: Element entrances (dropdowns, modals, tooltips) — fast start, slow settle
- **ease-in-out**: On-screen movement and morphing — natural acceleration/deceleration
- **ease**: Hover states and color transitions — elegant, asymmetrical
- **linear**: Only for constant-speed animations (spinners, marquees)
- **Never ease-in for UI**: Makes interfaces feel sluggish

### Duration Guidelines
| Element Type | Duration |
|---|---|
| Micro-interactions (button hover) | 100-150ms |
| Standard UI (tooltips, dropdowns) | 150-250ms |
| Modals, drawers | 200-300ms |
| Page transitions | 300-400ms |

### Performance Rules
- Only animate `transform` and `opacity` (GPU-accelerated)
- Avoid animating `width`, `height`, `margin`, `padding`
- Add `will-change: transform` for elements with shaky animations
- Always respect `prefers-reduced-motion`
- Include button press feedback: `transform: scale(0.97)` on `:active`

## Typography Standards

- Use 2-3 typefaces maximum, but make them CHARACTERFUL
- **Headlines**: Emotional, personality-driven, attention-grabbing
- **Body/UI**: Functional, highly legible, clarity over expression
- Use a mathematical scale (1.25x major third or 1.333x perfect fourth)
- Pair fonts with contrast: Serif + Sans, Geometric + Humanist, Display + System
- Responsive typography: use `clamp()` for fluid scaling

## Color Standards

- **Neutral palette (4-5 colors)**: Backgrounds, surfaces, borders, text
- **Accent palette (1-3 colors)**: CTAs, status indicators, emphasis
- Choose warm or cool neutrals intentionally based on brand feel
- Saturated accents should contrast clearly with both light and dark backgrounds
- Every color must serve a purpose: hierarchy, function, status, or action

## Technical Notes

- All designs should be self-contained in their own file
- Use Tailwind for all styling (no external CSS frameworks)
- Each design should be fully functional (routing, state)
- Avoid placeholder content — use realistic content from the site spec
- Include all features and sections from the specification
- Ensure WCAG AA contrast minimums (4.5:1 normal text, 3:1 large text)
- Touch targets minimum 44x44px for interactive elements
