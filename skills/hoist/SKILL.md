---
name: hoist
description: >-
  Generate secure, low-infrastructure release pipelines that publish artifacts
  directly — language packages (npm, PyPI, crates, RubyGems, NuGet, Go), GitHub
  Releases with binaries, static sites/Pages, or serverless functions — without
  building a container image. OIDC/trusted publishing, provenance, idempotent
  publish guards, and three trigger models (auto-bump with optional approval,
  tag, manual). The non-container sibling of /dock. Use when releasing a package
  or app that doesn't ship as a container.
argument-hint: "--skip-interview, --dry-run, --registry <name>"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, Agent
---

# Hoist - Non-Container Release Pipelines

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time.
CRITICAL: Reproduce the banner EXACTLY character-for-character. The first line of the art has 4 leading characters (one invisible braille-blank + 3 spaces) — you MUST preserve them.

```
{tagline}

⠀   ██╗██╗  ██╗ ██████╗ ██╗███████╗████████╗
   ██╔╝██║  ██║██╔═══██╗██║██╔════╝╚══██╔══╝
  ██╔╝ ███████║██║   ██║██║███████╗   ██║
 ██╔╝  ██╔══██║██║   ██║██║╚════██║   ██║
██╔╝   ██║  ██║╚██████╔╝██║███████║   ██║
╚═╝    ╚═╝  ╚═╝ ╚═════╝ ╚═╝╚══════╝   ╚═╝
```

Taglines:
- 📦 Up and away — published!
- 🏗️ Hoisting your release skyward!
- 🚀 From main to registry in one pull!
- 🪝 Latched on, lifting off!
- ⬆️ Straight to the top shelf!
- 🎁 Wrapped, signed, and shipped!
- 🛎️ Release, served fresh!
- 🔖 Tag it and bag it!

## Flags
- `--skip-interview`: detected + platform-aware defaults
- `--dry-run`: show generated files without writing
- `--registry <name>`: force the target registry

## Output Formatting
(Input box, Pre-flight table, stage headers, status icons — copy the conventions
from skills/dock/SKILL.md.)

## Pre-flight
6-column dependency table: git (required, stop), gh (optional for GitHub release
ops), sync (optional skill, fallback git pull), node/language toolchain (optional,
detected). Follow the resolution-strategy list format used by other skills.

## Platform Detection
Detect github vs azdo from the remote URL (same block as skills/dock/SKILL.md).

## Phase 0: Sync
Invoke /sync (fallback git pull).

## Phase 1: Detection
Explore subagent using references/interview-guide.md#detection-prompt → DETECTION_REPORT.

## Phase 2: Interview
Follow references/interview-guide.md#interview-questions. Compile HOIST_CONFIG
(target, registry/host, trigger model, approval gate, signing).

## Phase 3: Generate
Read references/release-templates.md and references/hardening.md. Emit the CI
workflow for the detected target + chosen trigger (secure by default: id-token,
provenance, idempotent publish guard, concurrency; token exceptions per
hardening.md). For binaries, add SHA256SUMS + optional signing. Generate
deploy/SETUP.md from references/setup-guides.md.

## Phase 4: Verify
Validate workflow YAML. Confirm the generated workflow carries the required
hardening for its target (OIDC/`id-token: write` or a flagged token secret;
provenance where supported; the version-exists guard; publish-before-tag).
--dry-run previews without writing.

## Final Report
Box report with target, trigger model, generated files, and a 🔐 Required setup
section pointing at deploy/SETUP.md.

After presenting the report, record lifecycle completion and surface the next step:
```bash
_R="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k}"
node "$_R/hooks/session-guard.cjs" lifecycle-complete hoist
```
If the command prints a `LIFECYCLE_OFFER_BEGIN…END` block, present that offer to
the user via AskUserQuestion as instructed inside the block. If it prints nothing
(or `LIFECYCLE_OFFER_NONE`), do not mention the lifecycle engine.

## Integration
Complements /dock (containers) — pick whichever fits. Runs after /rig; /ship's
merge can trigger the generated auto-bump release. Only the serverless target may
reference /keel for cloud identity.
