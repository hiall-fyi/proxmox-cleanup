#!/bin/bash
# Proxmox Cleanup - GitHub 發布腳本

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

echo "🚀 Proxmox Cleanup - GitHub 發布"
echo "=================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    log_error "package.json not found. Please run this script from the project root."
    exit 1
fi

# Get GitHub username
if [ -z "$1" ]; then
    echo "請輸入你嘅 GitHub 用戶名："
    read -r GITHUB_USERNAME
else
    GITHUB_USERNAME="$1"
fi

if [ -z "$GITHUB_USERNAME" ]; then
    log_error "GitHub 用戶名係必需嘅"
    exit 1
fi

log_info "GitHub 用戶名: $GITHUB_USERNAME"

# Update URLs in files
log_info "更新文件中嘅 GitHub URLs..."
sed -i.bak "s/YOUR_USERNAME/$GITHUB_USERNAME/g" scripts/install.sh

# Remove backup files
rm -f scripts/install.sh.bak

log_success "URLs 更新完成"

# Initialize git if not already done
if [ ! -d ".git" ]; then
    log_info "初始化 Git repository..."
    git init
    git branch -M main
    log_success "Git repository 初始化完成"
fi

# Check if git user is configured
if [ -z "$(git config user.name)" ] || [ -z "$(git config user.email)" ]; then
    log_warning "Git 用戶資訊未設定"
    echo "請輸入你嘅名字："
    read -r GIT_NAME
    echo "請輸入你嘅 email："
    read -r GIT_EMAIL
    
    git config user.name "$GIT_NAME"
    git config user.email "$GIT_EMAIL"
    log_success "Git 用戶資訊設定完成"
fi

# Add all files
log_info "添加文件到 Git..."
git add .

# Check if there are changes to commit
if git diff --staged --quiet; then
    log_warning "沒有新嘅更改需要提交"
else
    # Commit changes
    log_info "提交更改..."
    git commit -m "Prepare for GitHub release

- Complete CLI interface with cleanup, dry-run, list, validate commands
- Docker resource scanning and cleanup (containers, images, volumes, networks)
- Proxmox integration with API client
- Backup system with metadata preservation
- Comprehensive reporting and logging
- Scheduling support with cron expressions
- Notification system (webhook, email, Slack placeholders)
- Property-based testing with 157 test cases
- TypeScript implementation with full type safety
- ESLint configuration and code quality checks
- GitHub deployment scripts and documentation"
    
    log_success "更改提交完成"
fi

# Check if remote exists
if ! git remote get-url origin &> /dev/null; then
    log_info "添加 GitHub remote..."
    git remote add origin "https://github.com/$GITHUB_USERNAME/proxmox-cleanup.git"
    log_success "GitHub remote 添加完成"
fi

# Push to GitHub
log_info "推送到 GitHub..."
if git push -u origin main; then
    log_success "推送到 GitHub 成功"
else
    log_error "推送失敗。請檢查："
    echo "1. GitHub repository 是否已創建"
    echo "2. 你是否有推送權限"
    echo "3. 網絡連接是否正常"
    exit 1
fi

# Create and push tag
VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"

log_info "創建 release tag: $TAG"
if git tag -a "$TAG" -m "Release $TAG: Initial stable release

Features:
- Complete Docker resource cleanup automation
- Proxmox VE integration
- CLI interface with multiple commands
- Backup and restore functionality
- Comprehensive testing suite (157 test cases)
- Production-ready deployment scripts
- TypeScript implementation with full type safety"; then
    log_success "Tag 創建成功"
else
    log_warning "Tag 可能已存在，跳過創建"
fi

if git push origin "$TAG"; then
    log_success "Tag 推送成功"
else
    log_warning "Tag 推送失敗，可能已存在"
fi

echo ""
log_success "🎉 GitHub 發布完成！"
echo ""
echo "📋 下一步："
echo "1. 去 https://github.com/$GITHUB_USERNAME/proxmox-cleanup"
echo "2. 點擊 'Releases' → 'Create a new release'"
echo "3. 選擇 tag '$TAG'"
echo "4. 填寫 release 資訊"
echo "5. 點擊 'Publish release'"
echo ""
echo "🔗 安裝命令："
echo "curl -fsSL https://raw.githubusercontent.com/$GITHUB_USERNAME/proxmox-cleanup/main/scripts/install.sh | bash"
echo ""
echo "📚 文檔："
echo "- README: https://github.com/$GITHUB_USERNAME/proxmox-cleanup/blob/main/README.md"
echo "- 安裝指南: https://github.com/$GITHUB_USERNAME/proxmox-cleanup/blob/main/INSTALL-GUIDE.md"
echo ""

# Open GitHub in browser (macOS)
if command -v open &> /dev/null; then
    read -p "是否要打開 GitHub repository？(y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        open "https://github.com/$GITHUB_USERNAME/proxmox-cleanup"
    fi
fi