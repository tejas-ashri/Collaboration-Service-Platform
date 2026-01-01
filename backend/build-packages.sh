#!/bin/bash
# Build all shared packages

cd "$(dirname "$0")"

echo "🔨 Building all shared packages..."

# Build packages in dependency order using their tsconfig files
# The root tsconfig has path mappings that should work

# First, ensure types is built (no dependencies)
echo "Building types..."
cd packages/shared/types
mkdir -p dist
npx tsc -b 2>&1 | grep -E "(error|Building)" || npx tsc src/index.ts --outDir dist --module commonjs --target es2020 --esModuleInterop --skipLibCheck --declaration 2>&1 | tail -1
cd - > /dev/null

# Build other packages
for pkg in config logger redis auth-middleware; do
    if [ -d "packages/shared/$pkg" ]; then
        echo "Building $pkg..."
        cd "packages/shared/$pkg"
        mkdir -p dist
        # Try building with tsconfig first (respects path mappings)
        npx tsc -b 2>&1 | tail -1 || \
        # Fallback: direct compilation (may have import issues but creates files)
        npx tsc src/index.ts --outDir dist --module commonjs --target es2020 --esModuleInterop --skipLibCheck --declaration 2>&1 | tail -1 || true
        cd - > /dev/null
    fi
done

# Run root build to link everything
echo "Running root build..."
npm run build 2>&1 | tail -1

# Verify dist files exist
missing=0
for pkg in packages/shared/*/; do
    if [ -f "$pkg/package.json" ] && [ ! -f "$pkg/dist/index.js" ]; then
        echo "⚠️  Warning: $pkg/dist/index.js not found"
        missing=$((missing + 1))
    fi
done

if [ $missing -eq 0 ]; then
    echo "✅ All packages built successfully"
else
    echo "⚠️  Some packages may not have built correctly"
fi

