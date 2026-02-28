# Distil Iteration Mode

When `--favorites` is provided, generate new designs inspired by existing
favorites. This allows iterative refinement over multiple sessions.

The primary agent acts as a thin orchestrator — all heavy file reading
and design creation is delegated to subagents.

## Workflow

### Step I1: Reconnaissance via Subagent

Launch a single **Explore subagent** to gather all needed context:

```
Task(
  subagent_type: "Explore",
  model: "haiku",
  description: "Scan project and favorites",
  prompt: "Gather context for design iteration mode.

    1. Check src/designs/ exists. If not, report project_exists: false and stop.
    2. List all DesignN.tsx files (glob src/designs/Design*.tsx)
    3. For each design, read ONLY the first 10 lines to extract the
       metadata comment (style name, key traits)
    4. Determine the highest design number
    5. For favorites {FAVORITES_LIST}, read the FULL content of each
       favorite design file and extract:
       - Color palette, design style/theme, typography choices
       - Layout patterns, animation styles, component patterns
    6. Check package manager from lockfile (bun.lockb/pnpm-lock/yarn.lock/package-lock)
    7. Check skill availability:
       - ~/.claude/skills/bencium-innovative-ux-designer/SKILL.md
       - ~/.claude/skills/web-animation-design/SKILL.md
       - ~/.claude/skills/design-system/SKILL.md

    Return RECON_REPORT (max 40 lines):
    - project_exists: true/false
    - package_manager: detected
    - design_count: N
    - highest_number: N
    - all_designs: list of (number, style_name) pairs
    - favorite_summaries: for each favorite, a 3-5 line summary of its
      visual characteristics (palette, style, typography, layout, animations)
    - skills_installed: list of (name, yes/no)
  "
)
```

If `project_exists` is false, inform user they need an initial generation first.
If any skill is missing, inform user and offer to install.

### Step I2: Generate New Designs via Subagent

Set `START_INDEX = highest_number + 1`.

Launch a **general-purpose subagent** to create the new variations:

```
Task(
  subagent_type: "general-purpose",
  description: "Create design iterations",
  prompt: "
    You are creating {COUNT} new design variations inspired by existing favorites.

    ## Site Specification
    {SITE_SPEC}

    ## Design Knowledge — Read These Files
    Load design principles and the 50+ style catalog from these skill files:
    - ~/.claude/skills/bencium-innovative-ux-designer/SKILL.md
    - ~/.claude/skills/bencium-innovative-ux-designer/MOTION-SPEC.md
    - ~/.claude/skills/web-animation-design/SKILL.md
    - ~/.claude/skills/design-system/SKILL.md
    - ~/.claude/skills/design-system/references/style-guide.md

    Also read the project design guide:
    - {skill_dir}/references/design-guide.md

    ## Favorite Designs (Inspiration Sources)
    {favorite_summaries from RECON_REPORT}

    Also read the full source of each favorite for detailed inspiration:
    {List favorite file paths: src/designs/Design{N}.tsx}

    ## All Existing Designs (avoid duplicating styles)
    {all_designs from RECON_REPORT}

    ## Task
    Create designs numbered {START_INDEX} through {START_INDEX + COUNT - 1}.
    Each new design should be a VARIATION inspired by the favorites.

    For each design, create `src/designs/Design{N}.tsx`:
    - Pick 1-2 favorites as primary inspiration
    - Create a NEW variation using one of these strategies:
      - Color shift: Keep structure, change palette
      - Style blend: Combine elements from multiple favorites
      - Intensity variation: More/less bold, more/less minimal
      - Animation evolution: Add or modify motion design
      - Layout remix: Keep aesthetic, reorganize layout
      - Detail enhancement: Add micro-interactions and polish
      - Theme variation: Same colors, different visual style
    - Apply anti-AI-slop rules from the loaded skills
    - Include purposeful animations with proper easing
    - Each design must be self-contained in a single file
    - Import and render DesignNav from '../components/DesignNav'

    After creating all designs, update:
    1. `src/App.tsx` — Add routes for ALL designs (existing + new)
    2. Each design file's DesignNav `designs` array — Include ALL designs

    ## Design File Requirements
    Each design file must have a metadata comment:
    - Style name (hint at inspiration, e.g. 'Neo Dark', 'Glass Aurora')
    - Which favorites inspired it
    - Key visual traits and variation strategy used

    ## DesignNav Names
    Use descriptive names hinting at inspiration:
    - Inspired by 'Dark Premium' (#2): 'Neo Dark', 'Midnight Gold', 'Dark Luxe'
    - Inspired by 'Glassmorphism' (#1): 'Glass Aurora', 'Frost Bloom', 'Crystal'
    - Blending multiple: 'Cyber Glass', 'Warm Noir'

    ## App.tsx Requirements
    Import ALL design components (existing + new).
    Route each: <Route path='/{N}' element={<DesignN />} />
    Default route redirects to /1.

    Return DESIGN_REPORT (max 30 lines):
    - Each design: number, name, inspiration source(s), variation strategy
    - Total count (existing + new)
    - Files created and modified
  "
)
```

### Step I3: Restart Dev Server

If running, HMR should pick up changes — skip this step.
Otherwise launch as background Bash:

```
Task(
  subagent_type: "Bash",
  run_in_background: true,
  description: "Start Vite dev server",
  prompt: "{package_manager} run dev --port {PORT}"
)
```

### Step I4: Present New Designs

Report to user (from DESIGN_REPORT):
- How many new designs were created
- Which favorites inspired each
- New design numbers and names
- Remind they can iterate again with new favorites

## Context Protection Summary

| Step | Agent | Model | Why |
|---|---|---|---|
| I1: Recon | Explore | haiku | Reads all files, returns compact summary |
| I2: Create | general-purpose | default | Reads skills + favorites, writes designs |
| I3: Dev server | Bash (background) | — | Non-blocking |
| I4: Present | Primary | — | User-facing, uses compact DESIGN_REPORT |

Primary agent context: site spec + RECON_REPORT (~40 lines) + DESIGN_REPORT (~30 lines).

## Scalability (50+ designs)

- Consider pagination or grouping in DesignNav
- Move designList to a separate `src/data/designs.ts`
- Consider lazy loading design components

## Design Metadata

For large collections, add lineage comments:
```tsx
/**
 * Design 8: Midnight Aurora
 * Inspired by: #2 (Dark Premium), #5 (Organic Curves)
 * Strategy: Style blend — dark theme with flowing organic shapes
 * Created: Iteration 2
 */
```
