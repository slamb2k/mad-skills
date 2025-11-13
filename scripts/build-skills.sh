#!/bin/bash
set -e

# Build script for MAD Skills
# Packages skills into distributable .zip files

echo "================================"
echo "Building MAD Skills packages..."
echo "================================"

# Create dist directory if it doesn't exist
mkdir -p dist

# Clean old builds
echo "Cleaning old builds..."
rm -f dist/*.zip

# Function to package a skill
package_skill() {
    local skill_name=$1
    local skill_dir=$2

    echo ""
    echo "Packaging ${skill_name}..."

    if [ ! -d "$skill_dir" ]; then
        echo "ERROR: Skill directory ${skill_dir} not found"
        exit 1
    fi

    # Create temporary directory for packaging
    temp_dir=$(mktemp -d)
    trap "rm -rf $temp_dir" EXIT

    # Copy skill to temp directory
    cp -r "$skill_dir" "$temp_dir/$skill_name"

    # Remove node_modules if present (users will run npm install)
    if [ -d "$temp_dir/$skill_name/scripts/node_modules" ]; then
        echo "  Removing node_modules..."
        rm -rf "$temp_dir/$skill_name/scripts/node_modules"
    fi

    # Create zip file
    cd "$temp_dir"
    zip -r "$skill_name.zip" "$skill_name" > /dev/null
    cd - > /dev/null

    # Move to dist
    mv "$temp_dir/$skill_name.zip" "dist/"

    # Get size
    size=$(ls -lh "dist/$skill_name.zip" | awk '{print $5}')
    echo "  ✓ Created dist/${skill_name}.zip (${size})"
}

# Package Playtight skill (script-based skill with npm dependencies)
package_skill "playtight" "plugins/mad-skills/skills/playtight"

# Package Pixel Pusher skill (workflow skill - no scripts/dependencies)
package_skill "pixel-pusher" "plugins/mad-skills/skills/pixel-pusher"

# TODO: Add more skills here as they are developed
# package_skill "tempo" "plugins/mad-skills/skills/tempo"

echo ""
echo "================================"
echo "Build complete!"
echo "================================"
echo ""
echo "Packaged skills:"
ls -lh dist/*.zip
echo ""
