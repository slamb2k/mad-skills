# Dockerfile Templates

Multi-stage Dockerfile templates by detected stack. Each template follows the
four-stage pattern: deps → build → test → production.

Customize based on DETECTION_REPORT values. These are starting points, not
rigid templates — adapt to the specific project.

---

## Node.js

### With npm/yarn/pnpm

```dockerfile
# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production=false

# Stage 2: Build
FROM deps AS build
COPY . .
RUN npm run build

# Stage 3: Test (used in CI, not in final image)
FROM build AS test
RUN npm test

# Stage 4: Production
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
USER appuser
EXPOSE {PORT}
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:{PORT}/healthz || exit 1
CMD ["node", "dist/index.js"]
```

### With bun

```dockerfile
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run build

FROM build AS test
RUN bun test

FROM oven/bun:1-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
USER appuser
EXPOSE {PORT}
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD bun --eval "fetch('http://localhost:{PORT}/healthz').then(r => process.exit(r.ok ? 0 : 1))" || exit 1
CMD ["bun", "run", "dist/index.js"]
```

### Next.js (standalone output)

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM build AS test
RUN npm test

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1
CMD ["node", "server.js"]
```

Note: Requires `output: 'standalone'` in next.config.js.

---

## Python

### With pip/uv

```dockerfile
FROM python:3.12-slim AS deps
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

FROM deps AS build
COPY . .

FROM build AS test
RUN python -m pytest

FROM python:3.12-slim AS production
WORKDIR /app
RUN groupadd -r appgroup && useradd -r -g appgroup appuser
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin
COPY --from=build /app .
USER appuser
EXPOSE {PORT}
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:{PORT}/healthz')" || exit 1
CMD ["gunicorn", "--bind", "0.0.0.0:{PORT}", "--workers", "4", "app:app"]
```

### With uv (faster installs)

```dockerfile
FROM python:3.12-slim AS deps
WORKDIR /app
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

FROM deps AS build
COPY . .
RUN uv sync --frozen --no-install-project

FROM build AS test
RUN uv run pytest

FROM python:3.12-slim AS production
WORKDIR /app
RUN groupadd -r appgroup && useradd -r -g appgroup appuser
COPY --from=deps /app/.venv /app/.venv
COPY --from=build /app .
ENV PATH="/app/.venv/bin:$PATH"
USER appuser
EXPOSE {PORT}
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:{PORT}/healthz')" || exit 1
CMD ["gunicorn", "--bind", "0.0.0.0:{PORT}", "--workers", "4", "app:app"]
```

### Django

Replace CMD with:
```dockerfile
CMD ["gunicorn", "--bind", "0.0.0.0:{PORT}", "--workers", "4", "{PROJECT_NAME}.wsgi:application"]
```

Add collectstatic to build stage:
```dockerfile
RUN python manage.py collectstatic --noinput
```

### FastAPI

Replace CMD with:
```dockerfile
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "{PORT}", "--workers", "4"]
```

---

## Go

```dockerfile
FROM golang:1.23-alpine AS deps
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

FROM deps AS build
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/server ./cmd/server

FROM build AS test
RUN go test ./...

FROM gcr.io/distroless/static-debian12 AS production
COPY --from=build /app/server /server
EXPOSE {PORT}
USER nonroot:nonroot
CMD ["/server"]
```

---

## Rust

```dockerfile
FROM rust:1.83-slim AS deps
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release && rm -rf src

FROM deps AS build
COPY . .
RUN cargo build --release

FROM build AS test
RUN cargo test --release

FROM debian:bookworm-slim AS production
RUN groupadd -r appgroup && useradd -r -g appgroup appuser
COPY --from=build /app/target/release/{BINARY_NAME} /usr/local/bin/app
USER appuser
EXPOSE {PORT}
CMD ["app"]
```

---

## Ruby / Rails

```dockerfile
FROM ruby:3.3-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y build-essential libpq-dev && rm -rf /var/lib/apt/lists/*
COPY Gemfile Gemfile.lock ./
RUN bundle config set --local deployment true && bundle install

FROM deps AS build
COPY . .
RUN SECRET_KEY_BASE=placeholder bundle exec rails assets:precompile

FROM build AS test
RUN bundle exec rspec

FROM ruby:3.3-slim AS production
WORKDIR /app
RUN apt-get update && apt-get install -y libpq5 && rm -rf /var/lib/apt/lists/*
RUN groupadd -r appgroup && useradd -r -g appgroup appuser
COPY --from=deps /app/vendor/bundle ./vendor/bundle
COPY --from=build /app .
ENV RAILS_ENV=production RAILS_SERVE_STATIC_FILES=true
USER appuser
EXPOSE {PORT}
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s \
  CMD ruby -e "require 'net/http'; Net::HTTP.get(URI('http://localhost:{PORT}/up'))" || exit 1
CMD ["bundle", "exec", "rails", "server", "-b", "0.0.0.0", "-p", "{PORT}"]
```

---

## .NET

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS deps
WORKDIR /app
COPY *.csproj ./
RUN dotnet restore

FROM deps AS build
COPY . .
RUN dotnet publish -c Release -o /app/publish --no-restore

FROM build AS test
RUN dotnet test --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS production
WORKDIR /app
RUN groupadd -r appgroup && useradd -r -g appgroup appuser
COPY --from=build /app/publish .
USER appuser
EXPOSE {PORT}
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD curl -f http://localhost:{PORT}/healthz || exit 1
CMD ["dotnet", "{ASSEMBLY_NAME}.dll"]
```

---

## Java / Spring Boot

```dockerfile
FROM eclipse-temurin:21-jdk AS deps
WORKDIR /app
COPY pom.xml mvnw .mvn ./
RUN ./mvnw dependency:resolve

FROM deps AS build
COPY . .
RUN ./mvnw package -DskipTests

FROM build AS test
RUN ./mvnw test

FROM eclipse-temurin:21-jre AS production
WORKDIR /app
RUN groupadd -r appgroup && useradd -r -g appgroup appuser
COPY --from=build /app/target/*.jar app.jar
USER appuser
EXPOSE {PORT}
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s \
  CMD curl -f http://localhost:{PORT}/actuator/health || exit 1
CMD ["java", "-jar", "app.jar"]
```

---

## Generic .dockerignore

Adapt based on detected stack. Always include:

```
.git
.github
.gitlab
.env
.env.*
*.md
LICENSE
docs/
tests/
test/
__tests__/
*.test.*
*.spec.*
.vscode
.idea
.editorconfig
.eslintrc*
.prettierrc*
Makefile
docker-compose*.yml
```

Stack-specific additions:
- Node: `node_modules/`
- Python: `__pycache__/`, `*.pyc`, `.venv/`, `.mypy_cache/`
- Go: no additions needed (Go copies only what's needed)
- Rust: `target/`
- Ruby: `.bundle/`, `tmp/`, `log/`
