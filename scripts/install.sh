#!/bin/bash
# Proxmox Cleanup - GitHub Installation Script
# Usage: curl -fsSL https://raw.githubusercontent.com/busyass/proxmox-cleanup/main/scripts/install.sh | bash

set -e

# Configuration
REPO_URL="https://github.com/busyass/proxmox-cleanup.git"
INSTALL_DIR="/opt/proxmox-cleanup"
CONFIG_DIR="/etc/proxmox-cleanup"
LOG_DIR="/var/log/proxmox-cleanup"
BACKUP_DIR="/var/backups/proxmox-cleanup"

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

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_warning "Node.js not found. Installing..."
        apt update
        apt install -y nodejs npm
        log_success "Node.js installed"
    else
        NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -lt 18 ]; then
            log_error "Node.js version 18+ required. Current: $(node --version)"
            exit 1
        fi
        log_success "Node.js $(node --version) found"
    fi
    
    # Check Git
    if ! command -v git &> /dev/null; then
        log_warning "Git not found. Installing..."
        apt install -y git
        log_success "Git installed"
    else
        log_success "Git $(git --version | cut -d' ' -f3) found"
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker not found. Please install Docker first."
        log_info "Install Docker: https://docs.docker.com/engine/install/"
        exit 1
    else
        log_success "Docker $(docker --version | cut -d' ' -f3 | cut -d',' -f1) found"
    fi
    
    # Check if Docker daemon is running
    if ! docker ps &> /dev/null; then
        log_error "Docker daemon is not running. Please start Docker first."
        exit 1
    fi
}

# Clone or update repository
setup_repository() {
    log_info "Setting up repository..."
    
    if [ -d "$INSTALL_DIR" ]; then
        log_info "Updating existing installation..."
        cd "$INSTALL_DIR"
        
        # Backup current config if exists
        if [ -f "$CONFIG_DIR/config.json" ]; then
            cp "$CONFIG_DIR/config.json" "$CONFIG_DIR/config.json.backup.$(date +%Y%m%d_%H%M%S)"
            log_info "Backed up existing configuration"
        fi
        
        git pull origin main
        log_success "Repository updated"
    else
        log_info "Cloning repository..."
        git clone "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
        log_success "Repository cloned"
    fi
}

# Install dependencies and build
build_project() {
    log_info "Installing dependencies..."
    cd "$INSTALL_DIR"
    
    # Clean previous build
    rm -rf node_modules/ dist/
    
    # Install dependencies
    npm install
    log_success "Dependencies installed"
    
    # Build project
    log_info "Building project..."
    npm run build
    log_success "Project built"
    
    # Run tests (optional, skip if fails)
    log_info "Running tests..."
    if npm test; then
        log_success "All tests passed"
    else
        log_warning "Some tests failed, but continuing installation"
    fi
}

# Install globally
install_globally() {
    log_info "Installing globally..."
    cd "$INSTALL_DIR"
    
    # Uninstall previous version if exists
    if npm list -g proxmox-cleanup &> /dev/null; then
        npm uninstall -g proxmox-cleanup
        log_info "Removed previous global installation"
    fi
    
    # Install globally
    npm install -g .
    log_success "Installed globally"
}

# Setup configuration
setup_configuration() {
    log_info "Setting up configuration..."
    
    # Create directories
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$LOG_DIR"
    mkdir -p "$BACKUP_DIR"
    
    # Set permissions
    chown root:root "$CONFIG_DIR" "$LOG_DIR" "$BACKUP_DIR"
    chmod 755 "$CONFIG_DIR" "$LOG_DIR" "$BACKUP_DIR"
    
    # Copy example config if not exists
    if [ ! -f "$CONFIG_DIR/config.json" ]; then
        cp "$INSTALL_DIR/config.example.json" "$CONFIG_DIR/config.json"
        
        # Update paths in config
        sed -i "s|\"./backups\"|\"$BACKUP_DIR\"|g" "$CONFIG_DIR/config.json"
        sed -i "s|\"./logs\"|\"$LOG_DIR\"|g" "$CONFIG_DIR/config.json"
        
        # Secure config file
        chmod 600 "$CONFIG_DIR/config.json"
        chown root:root "$CONFIG_DIR/config.json"
        
        log_success "Created configuration file"
        log_warning "Please edit $CONFIG_DIR/config.json with your Proxmox settings!"
    else
        log_info "Configuration file already exists"
    fi
}

# Create update script
create_update_script() {
    log_info "Creating update script..."
    
    cat > /usr/local/bin/update-proxmox-cleanup << 'EOF'
#!/bin/bash
set -e

INSTALL_DIR="/opt/proxmox-cleanup"

echo "🔄 Updating Proxmox Cleanup..."

if [ ! -d "$INSTALL_DIR" ]; then
    echo "❌ Installation directory not found. Please reinstall."
    exit 1
fi

cd "$INSTALL_DIR"

# Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin main

# Reinstall dependencies and rebuild
echo "📦 Installing dependencies..."
npm install

echo "🔨 Building project..."
npm run build

# Reinstall globally
echo "🌍 Reinstalling globally..."
npm install -g .

echo "✅ Update completed!"

# Verify
proxmox-cleanup --version
EOF
    
    chmod +x /usr/local/bin/update-proxmox-cleanup
    log_success "Update script created at /usr/local/bin/update-proxmox-cleanup"
}

# Setup systemd service
setup_systemd_service() {
    log_info "Setting up systemd service..."
    
    cat > /etc/systemd/system/proxmox-cleanup.service << EOF
[Unit]
Description=Proxmox Docker Cleanup
After=docker.service
Wants=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/proxmox-cleanup cleanup -c $CONFIG_DIR/config.json
User=root
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    systemctl enable proxmox-cleanup.service
    log_success "Systemd service created and enabled"
}

# Setup log rotation
setup_logrotate() {
    log_info "Setting up log rotation..."
    
    cat > /etc/logrotate.d/proxmox-cleanup << EOF
$LOG_DIR/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 root root
}
EOF
    
    log_success "Log rotation configured"
}

# Verify installation
verify_installation() {
    log_info "Verifying installation..."
    
    # Check if command is available
    if ! command -v proxmox-cleanup &> /dev/null; then
        log_error "proxmox-cleanup command not found in PATH"
        log_info "PATH: $PATH"
        log_info "npm global bin: $(npm config get prefix)/bin"
        exit 1
    fi
    
    # Check version
    VERSION=$(proxmox-cleanup --version)
    log_success "proxmox-cleanup $VERSION installed successfully"
    
    # Test basic functionality
    if proxmox-cleanup --help &> /dev/null; then
        log_success "Command line interface working"
    else
        log_error "Command line interface not working"
        exit 1
    fi
}

# Display next steps
show_next_steps() {
    echo ""
    echo "🎉 Installation completed successfully!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Edit configuration:"
    echo "   nano $CONFIG_DIR/config.json"
    echo ""
    echo "2. Test configuration:"
    echo "   proxmox-cleanup validate-config -c $CONFIG_DIR/config.json"
    echo ""
    echo "3. Run dry-run test:"
    echo "   proxmox-cleanup dry-run -c $CONFIG_DIR/config.json"
    echo ""
    echo "4. Perform actual cleanup:"
    echo "   proxmox-cleanup cleanup -c $CONFIG_DIR/config.json"
    echo ""
    echo "📚 Documentation:"
    echo "   - Installation guide: $INSTALL_DIR/INSTALL-GUIDE.md"
    echo "   - README: $INSTALL_DIR/README.md"
    echo ""
    echo "🔄 To update in the future:"
    echo "   update-proxmox-cleanup"
    echo ""
    echo "🗂️ Important paths:"
    echo "   - Config: $CONFIG_DIR/config.json"
    echo "   - Logs: $LOG_DIR/"
    echo "   - Backups: $BACKUP_DIR/"
    echo "   - Source: $INSTALL_DIR/"
    echo ""
}

# Main installation function
main() {
    echo "🚀 Proxmox Cleanup - GitHub Installation"
    echo "========================================"
    echo ""
    
    check_root
    check_prerequisites
    setup_repository
    build_project
    install_globally
    setup_configuration
    create_update_script
    setup_systemd_service
    setup_logrotate
    verify_installation
    show_next_steps
}

# Run main function
main "$@"