# Azure DevOps Setup

Platform-specific pre-flight for `PLATFORM == azdo`. GitHub repos skip this
entirely. Run these after the dependency table (see `SKILL.md` Pre-flight), then
pass the resulting `AZDO_*` values into every stage prompt.

### AzDO Tooling Detection

When `PLATFORM == azdo`, determine which tooling is available. Set `AZDO_MODE`
for use in all subsequent stages:

```bash
if az devops -h &>/dev/null; then
  AZDO_MODE="cli"
else
  AZDO_MODE="rest"
fi
```

- **`cli`**: Use `az repos` / `az pipelines` commands (preferred)
- **`rest`**: Use Azure DevOps REST API via `curl`. Requires a PAT (personal
  access token) in `AZURE_DEVOPS_EXT_PAT` or `AZDO_PAT` env var. If no PAT
  is found, prompt the user to either install the CLI or set the env var.

Report in pre-flight:
- ✅ `az devops cli` — version found
- ⚠️ `az devops cli` — not found → using REST API fallback
- ❌ `az devops cli` — not found, no PAT configured → halt with setup instructions

### AzDO Configuration Validation

When `PLATFORM == azdo`, extract organization and project from the remote URL
and validate they are usable. These values are needed by every `az repos` /
`az pipelines` command and every REST API call.

```bash
# Extract org and project from remote URL patterns:
#   https://dev.azure.com/{ORG}/{PROJECT}/_git/{REPO}
#   https://{ORG}@dev.azure.com/{ORG}/{PROJECT}/_git/{REPO}
#   {ORG}@vs-ssh.visualstudio.com:v3/{ORG}/{PROJECT}/{REPO}

REMOTE_URL=$(git remote get-url origin 2>/dev/null)

if echo "$REMOTE_URL" | grep -q 'dev\.azure\.com'; then
  # HTTPS format: https://dev.azure.com/{ORG}/{PROJECT}/_git/{REPO}
  # Also handles: https://{ORG}@dev.azure.com/{ORG}/{PROJECT}/_git/{REPO}
  AZDO_ORG=$(echo "$REMOTE_URL" | sed -n 's|.*dev\.azure\.com/\([^/]*\)/.*|\1|p')
  AZDO_PROJECT=$(echo "$REMOTE_URL" | sed -n 's|.*dev\.azure\.com/[^/]*/\([^/]*\)/.*|\1|p')
  AZDO_ORG_URL="https://dev.azure.com/$AZDO_ORG"
elif echo "$REMOTE_URL" | grep -q 'vs-ssh\.visualstudio\.com'; then
  # SSH format: {ORG}@vs-ssh.visualstudio.com:v3/{ORG}/{PROJECT}/{REPO}
  AZDO_ORG=$(echo "$REMOTE_URL" | sed -n 's|.*vs-ssh\.visualstudio\.com:v3/\([^/]*\)/.*|\1|p')
  AZDO_PROJECT=$(echo "$REMOTE_URL" | sed -n 's|.*vs-ssh\.visualstudio\.com:v3/[^/]*/\([^/]*\)/.*|\1|p')
  AZDO_ORG_URL="https://dev.azure.com/$AZDO_ORG"
elif echo "$REMOTE_URL" | grep -q 'visualstudio\.com'; then
  # Legacy HTTPS format: https://{ORG}.visualstudio.com/{PROJECT}/_git/{REPO}
  AZDO_ORG=$(echo "$REMOTE_URL" | sed -n 's|.*//\([^.]*\)\.visualstudio\.com.*|\1|p')
  AZDO_PROJECT=$(echo "$REMOTE_URL" | sed -n 's|.*/\([^/]*\)/_git/.*|\1|p')
  AZDO_ORG_URL="https://${AZDO_ORG}.visualstudio.com"
fi

# URL-decode for CLI/display; keep URL-safe versions for REST API paths
AZDO_PROJECT_URL_SAFE="$AZDO_PROJECT"
AZDO_ORG=$(python3 -c "import urllib.parse; print(urllib.parse.unquote('$AZDO_ORG'))")
AZDO_PROJECT=$(python3 -c "import urllib.parse; print(urllib.parse.unquote('$AZDO_PROJECT_URL_SAFE'))")

if [ -z "$AZDO_ORG" ] || [ -z "$AZDO_PROJECT" ]; then
  echo "❌ Could not extract organization/project from remote URL"
  echo "   Remote: $REMOTE_URL"
  echo ""
  echo "Ensure the remote URL follows one of these formats:"
  echo "  https://dev.azure.com/{ORG}/{PROJECT}/_git/{REPO}"
  echo "  https://{ORG}.visualstudio.com/{PROJECT}/_git/{REPO}"
  echo "  {ORG}@vs-ssh.visualstudio.com:v3/{ORG}/{PROJECT}/{REPO}"
  # HALT — cannot proceed without org/project context
fi
```

When `AZDO_MODE == cli`, also configure the defaults so commands work correctly:
```bash
az devops configure --defaults organization="$AZDO_ORG_URL" project="$AZDO_PROJECT"
```

When `AZDO_MODE == rest`, store these for API calls:
- Base URL: `$AZDO_ORG_URL/$AZDO_PROJECT_URL_SAFE/_apis`
- Auth header: `Authorization: Basic $(printf ":%s" "$PAT" | base64 | tr -d '\n')`

Report in pre-flight:
- ✅ `azdo context` — org: `{AZDO_ORG}`, project: `{AZDO_PROJECT}`
- ❌ `azdo context` — could not parse from remote URL → halt with instructions
