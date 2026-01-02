# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-02

### Added
- Initial release of Proxmox Cleanup Tool
- Automated Docker resource cleanup (containers, images, volumes, networks)
- Dry-run mode for safe preview of cleanup operations
- Comprehensive backup system with metadata preservation
- Resource protection patterns with wildcard support
- CLI interface with full command set
- Configuration management with JSON files
- Cron-based scheduling system
- Webhook notification support
- Comprehensive test suite with 157 tests
- Property-based testing with fast-check
- TypeScript implementation with full type safety
- Error handling and recovery mechanisms
- Detailed logging and reporting
- One-line installation script
- Systemd service integration
- Log rotation configuration
- Update mechanism
- Production-ready deployment

### Features
- **Smart Resource Detection**: Identifies truly unused Docker resources
- **Safety First**: Multiple protection mechanisms and dry-run mode
- **Backup & Recovery**: Automatic metadata backup before cleanup
- **Flexible Configuration**: JSON-based configuration with CLI overrides
- **Scheduling**: Automated cleanup with cron expressions
- **Notifications**: Webhook integration for cleanup results
- **Comprehensive Testing**: 157 tests including property-based testing
- **Production Ready**: Error handling, logging, and monitoring

### Technical Details
- TypeScript 5.9.3
- Node.js 18+ support
- Docker API integration
- Proxmox VE API integration
- Jest testing framework
- ESLint code quality
- Comprehensive error handling
- Parallel processing optimization

### Installation
- One-line installation: `curl -fsSL https://raw.githubusercontent.com/busyass/proxmox-cleanup/main/scripts/install.sh | bash`
- Manual installation support
- Global npm package installation
- Systemd service setup
- Configuration file creation
- Log rotation setup

[1.0.0]: https://github.com/busyass/proxmox-cleanup/releases/tag/v1.0.0