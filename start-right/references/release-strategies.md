# Release Strategies Reference

This document provides detailed guidance on different release strategies and deployment targets.

## npm Package Release

**Best for**: JavaScript/TypeScript libraries, CLI tools, frameworks

**Prerequisites**:
- npm account and NPM_TOKEN secret configured
- `package.json` with correct metadata (name, version, main, types)
- Build output in publishable state

**Workflow steps**:
1. Build the package
2. Run `npm publish`
3. Create GitHub Release with version tag
4. Include link to npm package in release notes

**Configuration**:
```json
{
  "name": "@username/package-name",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  }
}
```

**GitHub Release notes example**:
```
📦 Published to npm: https://www.npmjs.com/package/@username/package-name

Install with:
npm install @username/package-name
```

## GitHub Pages Deployment

**Best for**: Static websites, documentation sites, SPAs

**Prerequisites**:
- GitHub Pages enabled in repository settings
- Build outputs static files to a directory (usually `dist/` or `build/`)

**Workflow steps**:
1. Build the static site
2. Deploy to `gh-pages` branch using `peaceiris/actions-gh-pages`
3. Create GitHub Release with link to live site

**Configuration considerations**:
- Set correct `base` path for SPAs (e.g., Vite: `base: '/repo-name/'`)
- Configure 404.html for SPA routing
- Custom domain setup (optional)

**GitHub Release notes example**:
```
🌐 Deployed to: https://username.github.io/repo-name

Changes in this release:
[auto-generated release notes]
```

## Vercel Deployment

**Best for**: Next.js apps, React apps, modern web frameworks

**Prerequisites**:
- Vercel account connected to GitHub
- Vercel project configured (can be done via CLI or UI)

**Workflow approaches**:

### Option 1: Automatic (Recommended)
- Let Vercel handle deployment via their GitHub integration
- GitHub Actions only handles validation
- Every push to main triggers Vercel deployment automatically

### Option 2: Manual via GitHub Actions
- Use Vercel CLI in GitHub Actions
- Requires VERCEL_TOKEN secret
- More control but more complex

**GitHub Release notes example**:
```
🚀 Deployed to Vercel: https://project-name.vercel.app

Production URL: https://your-domain.com (if custom domain)
```

## Docker Container Release

**Best for**: Microservices, backend applications, full-stack apps

**Prerequisites**:
- Dockerfile in repository
- Multi-stage builds for optimization (recommended)

**Release targets**:
- **GitHub Container Registry** (ghcr.io) - Recommended, free with GitHub
- **Docker Hub** - Public registry, widely used
- **AWS ECR**, **Google GCR**, **Azure ACR** - Cloud-specific registries

**Workflow steps**:
1. Build Docker image with version tag
2. Push to container registry
3. Also tag as `latest`
4. Create GitHub Release with pull command

**Best practices**:
- Use multi-stage builds to minimize image size
- Run containers as non-root user
- Include health check in Dockerfile
- Version images with semantic versioning

**GitHub Release notes example**:
```
🐳 Docker image: `ghcr.io/username/repo-name:v1.2.3`

Pull and run:
docker pull ghcr.io/username/repo-name:v1.2.3
docker run -p 8080:8080 ghcr.io/username/repo-name:v1.2.3
```

## Binary Artifacts Release

**Best for**: CLI tools, desktop apps, native applications

**Platforms to support**:
- Linux (x86_64, arm64)
- macOS (x86_64, arm64/Apple Silicon)
- Windows (x86_64)

**Workflow approaches**:

### Option 1: GitHub Actions matrix build
Build on multiple runners (ubuntu, macos, windows) and upload artifacts

### Option 2: Cross-compilation
Compile for multiple targets from single runner (works for Go, Rust)

### Option 3: GoReleaser / cargo-dist
Use specialized tools for automated multi-platform releases

**GitHub Release notes example**:
```
📥 Download the binary for your platform:

- Linux x86_64: [app-linux-amd64](link)
- Linux ARM64: [app-linux-arm64](link)
- macOS x86_64: [app-darwin-amd64](link)
- macOS ARM64: [app-darwin-arm64](link)
- Windows x86_64: [app-windows-amd64.exe](link)

Quick install:
curl -L https://github.com/user/repo/releases/download/v1.2.3/app-linux-amd64 -o app
chmod +x app
./app
```

## Python Package (PyPI) Release

**Best for**: Python libraries, CLI tools, frameworks

**Prerequisites**:
- PyPI account and API token
- `pyproject.toml` or `setup.py` with metadata
- Build tool (build, setuptools, poetry)

**Workflow steps**:
1. Build distribution packages (wheel + sdist)
2. Upload to PyPI using twine
3. Create GitHub Release with PyPI link

**Configuration**:
```toml
[build-system]
requires = ["setuptools>=45", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "my-package"
version = "1.0.0"
description = "Package description"
authors = [{name = "Your Name", email = "you@example.com"}]
```

**GitHub Release notes example**:
```
📦 Published to PyPI: https://pypi.org/project/my-package/

Install with:
pip install my-package
```

## Rust Crate (crates.io) Release

**Best for**: Rust libraries

**Prerequisites**:
- crates.io account
- CARGO_REGISTRY_TOKEN secret
- `Cargo.toml` with complete metadata

**Workflow steps**:
1. Run tests and validation
2. Publish to crates.io using `cargo publish`
3. Create GitHub Release

**GitHub Release notes example**:
```
📦 Published to crates.io: https://crates.io/crates/my-crate

Add to your Cargo.toml:
[dependencies]
my-crate = "1.0.0"
```

## Claude Code Skill Release

**Best for**: Claude Code skills and extensions

**Prerequisites**:
- Skill properly structured and validated
- Skill packaged as .skill file

**Workflow steps**:
1. Validate skill structure
2. Package skill into .skill file
3. Create GitHub Release with .skill file attached
4. No deployment needed

**GitHub Release notes example**:
```
🎯 Claude Code Skill Release

Download the skill file and install in Claude Code:
1. Download [skill-name.skill](link)
2. In Claude Code, run: /skills install /path/to/skill-name.skill

What's included:
- [Brief description of skill capabilities]
```

## Desktop App Distribution

**Best for**: Electron apps, Tauri apps

**Platforms**: Windows, macOS, Linux

**Workflow tools**:
- **Electron Builder**: Automated builds and updates
- **Tauri**: Rust-based alternative with smaller bundle sizes

**Distribution methods**:
- GitHub Releases with auto-updater
- Platform-specific stores (Microsoft Store, Mac App Store)
- Custom update server

## Platform-as-a-Service (PaaS) Deployment

**Platforms**: Railway, Fly.io, Render, Heroku (legacy)

**Common characteristics**:
- Git-based deployment
- Automatic container building
- Built-in databases and add-ons
- Easy environment variable management

**Workflow integration**:
Most PaaS platforms integrate directly with GitHub - just validation in GitHub Actions, deployment handled by platform

## Release Strategy Selection Guide

### Choose npm/PyPI/crates.io when:
- Building a library or package
- Want maximum distribution reach
- Package manager installation is preferred

### Choose GitHub Pages when:
- Pure static site
- Documentation site
- No server-side logic needed
- Want simple, free hosting

### Choose Vercel/Netlify when:
- Modern framework (Next.js, SvelteKit, etc.)
- Need serverless functions
- Want preview deployments for PRs
- Need automatic optimizations

### Choose Docker when:
- Microservices architecture
- Need consistent runtime environment
- Deploying to Kubernetes or container orchestration
- Complex dependencies

### Choose Binary release when:
- CLI tool
- Desktop application
- Want users to run without installing runtime
- Performance-critical application

### Choose PaaS when:
- Full-stack web application
- Need managed database
- Want simple deployment
- Solo developer or small team

## Multi-Release Strategy

Some projects benefit from multiple release targets:

**Example: CLI tool**
- npm package (for Node.js users)
- Standalone binary (for system installation)
- Docker image (for containerized environments)

**Example: Web framework**
- npm package (for developers)
- Documentation site on GitHub Pages
- Example deployed to Vercel

**Example: Library**
- Language package registry (npm, PyPI, etc.)
- GitHub Releases for changelogs
- Documentation site

## Versioning and Changelog Best Practices

**Semantic Versioning**:
- MAJOR: Breaking changes
- MINOR: New features (backward compatible)
- PATCH: Bug fixes

**Auto-versioning**:
Use commit messages or PR labels to determine version bump:
- `feat:` → MINOR bump
- `fix:` → PATCH bump
- `BREAKING CHANGE:` → MAJOR bump

**Changelog generation**:
- Auto-generate from commit messages (Conventional Commits)
- Auto-generate from PR titles
- Use GitHub's release notes generation
- Tools: semantic-release, conventional-changelog
