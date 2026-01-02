# 🎉 Proxmox Cleanup v1.0.0 - Initial Release

## 🚀 What's New

This is the first stable release of Proxmox Cleanup Tool - an automated Docker resource cleanup solution designed specifically for Proxmox VE environments.

## ✨ Key Features

### 🧹 Automated Cleanup
- **Smart Docker Resource Management**: Automatically identifies and removes unused containers, images, volumes, and networks
- **Safe Operations**: Comprehensive dependency checking ensures no active resources are removed
- **Backup System**: Automatic metadata backup before any cleanup operations

### 🛡️ Safety First
- **Dry-Run Mode**: Preview all operations without making changes
- **Resource Protection**: Flexible pattern-based protection for critical resources
- **Dependency Checking**: Prevents removal of resources in use by other containers

### 🎯 Production Ready
- **157 Comprehensive Tests**: Including property-based testing with 100+ iterations per property
- **Error Handling**: Graceful handling of all failure scenarios
- **Logging & Reporting**: Detailed execution logs and cleanup reports
- **Performance Optimized**: Parallel processing and efficient resource scanning

### 📅 Automation
- **Cron Scheduling**: Set up automated cleanup schedules
- **Webhook Notifications**: Get notified about cleanup results
- **Systemd Integration**: Runs as a system service

### 🖥️ Easy to Use
- **One-Line Installation**: `curl -fsSL https://raw.githubusercontent.com/busyass/proxmox-cleanup/main/scripts/install.sh | bash`
- **CLI Interface**: Full-featured command-line interface
- **Configuration Management**: Flexible JSON-based configuration

## 📦 Installation

### Quick Install (Recommended)
```bash
curl -fsSL https://raw.githubusercontent.com/busyass/proxmox-cleanup/main/scripts/install.sh | bash
```

### Manual Install
```bash
git clone https://github.com/busyass/proxmox-cleanup.git
cd proxmox-cleanup
npm install
npm run build
npm install -g .
```

## 🔧 Usage Examples

### Basic Cleanup
```bash
# Preview what would be cleaned
proxmox-cleanup dry-run

# Perform actual cleanup
proxmox-cleanup cleanup
```

### Advanced Usage
```bash
# Clean specific resource types
proxmox-cleanup cleanup --types containers,images

# Clean with custom protection patterns
proxmox-cleanup cleanup --protect "important-*,system-*"

# Clean without backup
proxmox-cleanup cleanup --no-backup
```

### Configuration
```bash
# Validate configuration
proxmox-cleanup validate-config -c /etc/proxmox-cleanup/config.json

# List unused resources
proxmox-cleanup list --sort-by-size
```

## 📊 Test Results

- ✅ **157 tests passing**
- ✅ **Property-based testing** with 100+ iterations per property
- ✅ **Zero linting errors**
- ✅ **Full TypeScript compilation**
- ✅ **Comprehensive error handling**

## 🏗️ Architecture

Built with modern TypeScript and follows clean architecture principles:

- **Modular Design**: Separate concerns for scanning, cleanup, backup, and reporting
- **Interface-Based**: Dependency injection and testable components
- **Error Resilient**: Comprehensive error handling and recovery
- **Performance Focused**: Parallel processing and efficient algorithms

## 🔒 Security

- **Input Validation**: All inputs are validated and sanitized
- **Secure Token Handling**: API tokens are handled securely
- **Principle of Least Privilege**: Minimal required permissions
- **No Sensitive Data Logging**: Sensitive information is never logged

## 📚 Documentation

- **Comprehensive README**: Detailed usage instructions and examples
- **Installation Guide**: Step-by-step installation instructions
- **Configuration Reference**: Complete configuration options
- **API Documentation**: Full TypeScript interfaces and types

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines and feel free to:

- Report bugs
- Suggest features
- Submit pull requests
- Improve documentation

## 📝 What's Next

Future releases will include:

- Web UI dashboard
- More notification channels (Slack, Discord, Teams)
- Advanced scheduling options
- Resource usage analytics
- Multi-node Proxmox cluster support

## 🙏 Acknowledgments

Thanks to the open-source community and the tools that made this possible:

- TypeScript & Node.js ecosystem
- Docker API
- Proxmox VE
- Jest testing framework
- Fast-check property testing

---

**Full Changelog**: https://github.com/busyass/proxmox-cleanup/commits/main

**Installation**: `curl -fsSL https://raw.githubusercontent.com/busyass/proxmox-cleanup/main/scripts/install.sh | bash`