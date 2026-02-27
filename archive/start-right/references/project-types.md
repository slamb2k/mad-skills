# Project Types Reference

This document provides detailed information about different project types and their specific requirements for validation, builds, and releases.

## Node.js / JavaScript Projects

**Detection**: `package.json` file present

**Typical validation checks**:
- Format: Prettier (`npm run format:check`)
- Lint: ESLint (`npm run lint`)
- Test: Jest/Vitest (`npm test`)
- Build: TypeScript/bundler (`npm run build`)

**Release strategies**:
- **npm package**: Publish to npm registry
- **Web app**: Deploy to Vercel, Netlify, or GitHub Pages
- **CLI tool**: Publish to npm with binary support

**Required dependencies**:
```json
{
  "devDependencies": {
    "prettier": "^3.0.0",
    "eslint": "^8.0.0",
    "jest": "^29.0.0" // or vitest
  }
}
```

## TypeScript Projects

**Detection**: `tsconfig.json` or TypeScript in dependencies

**Typical validation checks**:
- Format: Prettier
- Lint: ESLint with TypeScript plugin
- Type check: `tsc --noEmit`
- Test: Jest/Vitest with ts-jest
- Build: TypeScript compiler

**Release strategies**: Same as Node.js

**Required dependencies**:
```json
{
  "devDependencies": {
    "typescript": "^5.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "ts-jest": "^29.0.0"
  }
}
```

## React Projects

**Detection**: React in `package.json` dependencies

**Typical validation checks**:
- Format: Prettier
- Lint: ESLint with React plugin
- Type check: TypeScript (if applicable)
- Test: Jest + React Testing Library
- Build: Vite/Webpack/Next.js

**Release strategies**:
- **Single-page app**: GitHub Pages, Vercel, Netlify
- **Next.js app**: Vercel (recommended), or Docker container
- **Component library**: npm package

**Additional considerations**:
- May need environment variable management
- Build optimization (bundle size, tree shaking)
- Static asset handling

## Rust Projects

**Detection**: `Cargo.toml` file present

**Typical validation checks**:
- Format: `cargo fmt --check`
- Lint: `cargo clippy -- -D warnings`
- Test: `cargo test`
- Build: `cargo build --release`

**Release strategies**:
- **Binary**: Cross-compile for multiple platforms, attach to GitHub Release
- **Library (crate)**: Publish to crates.io
- **Web Assembly**: Build to WASM for web deployment

**CI considerations**:
- Cache `~/.cargo` and `target/` directories
- Consider cross-compilation matrix for multiple platforms
- Separate debug/release builds

## Python Projects

**Detection**: `.py` files, `requirements.txt`, or `pyproject.toml`

**Typical validation checks**:
- Format: Black (`black --check .`)
- Lint: Flake8 (`flake8 .`)
- Type check: MyPy (`mypy .`)
- Test: Pytest (`pytest`)

**Release strategies**:
- **Package**: Publish to PyPI
- **CLI tool**: PyPI with entry points or standalone binary (PyInstaller)
- **Web service**: Docker container or Platform-as-a-Service

**Required tools**:
```txt
black
flake8
mypy
pytest
build  # for packaging
```

## Go Projects

**Detection**: `go.mod` file present

**Typical validation checks**:
- Format: `go fmt` / `gofmt -s`
- Lint: `golangci-lint run`
- Test: `go test ./...`
- Build: `go build`

**Release strategies**:
- **Binary**: Cross-compile with GOOS/GOARCH, attach to GitHub Release
- **Library**: Tag version in git (Go modules)
- **Docker**: Multi-stage build for small images

**CI considerations**:
- Use Go module caching
- Cross-compilation for multiple platforms is straightforward
- Consider using GoReleaser for automated releases

## Docker Projects

**Detection**: `Dockerfile` present

**Typical validation checks**:
- Dockerfile lint: `hadolint Dockerfile`
- Build: `docker build .`
- Security scan: Trivy or similar

**Release strategies**:
- **Container image**: GitHub Container Registry (ghcr.io)
- **Docker Hub**: If public registry preferred
- **Multiple registries**: Push to multiple registries for redundancy

**Best practices**:
- Multi-stage builds for smaller images
- Use specific base image tags (not `latest`)
- Run as non-root user
- Regular security scanning

## Claude Code Skills

**Detection**: `.skill` extension or skill structure

**Typical validation checks**:
- Skill validation: Custom validator script
- Structure check: Verify SKILL.md frontmatter and structure
- Test: Use skill in Claude Code environment

**Release strategies**:
- **GitHub Release**: Attach packaged .skill file
- No deployment needed - users download and install manually

**Additional files**:
- SKILL.md (required)
- Optional: scripts/, references/, assets/ directories
- Package using skill packaging tool

## Web Applications (Generic)

**Typical validation checks**:
- Format checking
- Linting
- Unit tests
- Integration tests (optional on PR, required on main)
- Build verification

**Release strategies**:
- **Static site**: GitHub Pages, Vercel, Netlify
- **Server-rendered**: Platform-specific deployment (Vercel, Railway, Fly.io)
- **Containerized**: Deploy container to cloud platform

**Additional considerations**:
- Environment configuration management
- Asset optimization and CDN
- Database migrations (if applicable)
- Health check endpoints

## Best Practices Across All Types

### Validation Checks on PRs
- **Always run**: Format check, lint, unit tests, build
- **Optional**: Integration tests (if fast), type checking
- **Never run on PR**: Deployment, long-running tests

### Validation Checks on Main Branch
- **Always run**: All checks from PR + integration tests
- **Additionally**: Security scanning, coverage reports
- **After validation**: Versioning, tagging, release

### Versioning Strategy
- **Semantic versioning**: MAJOR.MINOR.PATCH
- **Auto-increment**: Use GitHub Actions to bump version
- **Tag format**: `v1.2.3` format recommended
- **Changelog**: Auto-generate from commit messages or PRs

### Release Notes
- Use GitHub's auto-generated release notes
- Customize with categories (features, fixes, breaking changes)
- Include links to related PRs and issues
