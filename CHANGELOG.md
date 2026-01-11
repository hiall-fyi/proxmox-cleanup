# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-01-11

### Fixed
- **Critical**: Fixed binary wrapper path resolution issue that caused "Cannot find module" error after global npm installation
- **Critical**: Fixed installation script repository URL to use correct GitHub repository
- Binary wrapper now correctly resolves CLI entry point using Node.js path resolution
- Installation script now has comprehensive error handling and cleanup on failure
- Git conflicts during updates now handled automatically
- Build verification ensures complete build before global installation

### Improved
- Simplified binary wrapper implementation (more reliable and maintainable)
- Rewrote installation script with proper error handling and rollback mechanism
- Config file updates now use safer JSON manipulation methods
- Update script now shows version information for better user feedback
- Test failures no longer block installation (warning only)

### Added
- Automatic cleanup on installation failure
- Build output verification before global installation
- Version tracking in update script
- Detailed error messages with context throughout installation process
- Installation state tracking for proper cleanup

### Technical Details
- Binary wrapper now uses Node.js `__dirname` which correctly follows symlinks to resolve the CLI entry point path
- Installation script includes `trap` mechanism for cleanup on failure
- All critical commands now have proper error checking
- Security improvements: proper file permissions (config: 600, directories: 755)

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
- One-line installation script
- Manual installation support
- Global npm package installation
- Systemd service integration
- Configuration file creation
- Log rotation setup

[1.1.0]: https://github.com/hiall-fyi/proxmox-cleanup/releases/tag/v1.1.0
[1.0.0]: https://github.com/hiall-fyi/proxmox-cleanup/releases/tag/v1.0.0
