#!/bin/bash
# Prepare release script for proxmox-cleanup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

echo "🚀 Preparing Proxmox Cleanup Release"
echo "===================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    log_error "package.json not found. Please run this script from the project root."
    exit 1
fi

# Check if git is clean
if [ -n "$(git status --porcelain)" ]; then
    log_warning "Git working directory is not clean. Uncommitted changes:"
    git status --short
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Aborted by user"
        exit 1
    fi
fi

# Clean previous build
log_info "Cleaning previous build..."
rm -rf dist/
rm -rf node_modules/
log_success "Cleaned build artifacts"

# Install dependencies
log_info "Installing dependencies..."
npm install
log_success "Dependencies installed"

# Run linting
log_info "Running linter..."
if npm run lint; then
    log_success "Linting passed"
else
    log_error "Linting failed"
    exit 1
fi

# Run tests
log_info "Running tests..."
if npm test; then
    log_success "All tests passed"
else
    log_error "Tests failed"
    exit 1
fi

# Build project
log_info "Building project..."
if npm run build; then
    log_success "Build completed"
else
    log_error "Build failed"
    exit 1
fi

# Verify CLI works
log_info "Verifying CLI..."
if node dist/cli/index.js --version; then
    log_success "CLI verification passed"
else
    log_error "CLI verification failed"
    exit 1
fi

# Check if bin script exists and is executable
if [ ! -f "bin/proxmox-cleanup" ]; then
    log_error "bin/proxmox-cleanup not found"
    exit 1
fi

if [ ! -x "bin/proxmox-cleanup" ]; then
    log_warning "bin/proxmox-cleanup is not executable, fixing..."
    chmod +x bin/proxmox-cleanup
fi

# Test global installation (in a temporary directory)
log_info "Testing global installation..."
TEMP_DIR=$(mktemp -d)
cp -r . "$TEMP_DIR/"
cd "$TEMP_DIR"

# Test npm pack
if npm pack; then
    log_success "npm pack successful"
    rm -f *.tgz
else
    log_error "npm pack failed"
    cd - > /dev/null
    rm -rf "$TEMP_DIR"
    exit 1
fi

cd - > /dev/null
rm -rf "$TEMP_DIR"

# Check package.json for required fields
log_info "Validating package.json..."

REQUIRED_FIELDS=("name" "version" "description" "main" "bin")
for field in "${REQUIRED_FIELDS[@]}"; do
    if ! grep -q "\"$field\"" package.json; then
        log_error "Missing required field in package.json: $field"
        exit 1
    fi
done

log_success "package.json validation passed"

# Check if README exists and is not empty
if [ ! -f "README.md" ] || [ ! -s "README.md" ]; then
    log_error "README.md is missing or empty"
    exit 1
fi

# Check if config example exists
if [ ! -f "config.example.json" ]; then
    log_error "config.example.json is missing"
    exit 1
fi

# Generate file list for release
log_info "Generating release file list..."
cat > RELEASE-FILES.txt << EOF
# Proxmox Cleanup Release Files

## Core Files
- package.json
- README.md
- CHANGELOG.md (if exists)
- LICENSE (if exists)

## Source Code
- src/
- bin/
- dist/ (built)

## Configuration
- config.example.json
- tsconfig.json
- jest.config.js
- eslint.config.js

## Documentation
- INSTALL-GUIDE.md
- GITHUB-DEPLOYMENT.md
- docs/ (if exists)

## Scripts
- scripts/

## Tests
- src/**/__tests__/

## Build Artifacts (Generated)
- dist/
- node_modules/ (excluded from git)

Generated on: $(date)
Version: $(node -p "require('./package.json').version")
EOF

log_success "Release file list generated"

# Show release summary
echo ""
log_success "🎉 Release preparation completed!"
echo ""
echo "📋 Release Summary:"
echo "   Version: $(node -p "require('./package.json').version")"
echo "   Files ready: ✅"
echo "   Tests passed: ✅"
echo "   Build successful: ✅"
echo "   CLI verified: ✅"
echo ""
echo "📚 Next steps:"
echo "1. Review changes: git diff"
echo "2. Commit changes: git add . && git commit -m 'Prepare release vX.X.X'"
echo "3. Create tag: git tag -a vX.X.X -m 'Release vX.X.X'"
echo "4. Push to GitHub: git push origin main --tags"
echo "5. Create GitHub release (optional)"
echo ""
echo "🚀 Ready for deployment!"