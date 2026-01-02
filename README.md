# Proxmox Cleanup System

Automated cleanup tool for unused Docker resources on Proxmox infrastructure.

## Features

- 🐳 **Docker Resource Management**: Automatically identifies and removes unused containers, images, volumes, and networks
- 🛡️ **Safety First**: Protected resource patterns, dependency checking, and dry-run mode
- 💾 **Backup System**: Automatic backup of resource metadata before cleanup
- 📊 **Comprehensive Reporting**: Detailed reports with disk space calculations and execution metrics
- ⏰ **Scheduling**: Automated cleanup with cron expressions
- 🔔 **Notifications**: Webhook, email, and Slack notifications for cleanup events
- 🖥️ **CLI Interface**: Full-featured command-line interface with multiple commands
- 🧪 **Property-Based Testing**: Comprehensive test suite with 100+ iterations per property

## Installation

### Prerequisites

- Node.js 18+ and npm
- Docker daemon running
- Proxmox VE (optional, for Proxmox integration)

### Install from Source

```bash
git clone <repository-url>
cd proxmox-cleanup
npm install
npm run build
```

### Global Installation

```bash
npm install -g proxmox-cleanup
```

## Quick Start

### 1. Dry Run (Preview Mode)

```bash
# Preview what would be removed
proxmox-cleanup dry-run

# Preview specific resource types
proxmox-cleanup dry-run --types containers,images
```

### 2. Actual Cleanup

```bash
# Clean all unused resources with backup
proxmox-cleanup cleanup

# Clean specific types without backup
proxmox-cleanup cleanup --types volumes --no-backup
```

### 3. List Unused Resources

```bash
# List all unused resources
proxmox-cleanup list

# List specific types sorted by size
proxmox-cleanup list --types images --sort-by-size
```

## Configuration

### Configuration File

Create a `config.json` file (see `config.example.json`):

```json
{
  "proxmox": {
    "host": "proxmox.example.com",
    "token": "root@pam:your-api-token",
    "nodeId": "node1"
  },
  "cleanup": {
    "dryRun": false,
    "resourceTypes": [],
    "protectedPatterns": ["important-*", "system-*"],
    "backupEnabled": true,
    "backupPath": "./backups"
  },
  "reporting": {
    "verbose": true,
    "logPath": "./logs"
  },
  "scheduling": {
    "enabled": false,
    "cronExpression": "0 2 * * *",
    "dryRun": true,
    "timezone": "UTC"
  },
  "notifications": {
    "enabled": false,
    "onSuccess": true,
    "onFailure": true,
    "webhookUrl": "https://your-webhook.com"
  }
}
```

### CLI Options

All configuration options can be overridden via CLI:

```bash
proxmox-cleanup cleanup \
  --config ./config.json \
  --types containers,images \
  --protect "important-*,system-*" \
  --backup-path ./custom-backups \
  --verbose \
  --proxmox-host proxmox.local \
  --proxmox-token "root@pam:token"
```

## Commands

### `cleanup`

Execute cleanup of unused Docker resources.

```bash
proxmox-cleanup cleanup [options]

Options:
  -d, --dry-run                    Preview without removing
  -t, --types <types>              Resource types (containers,images,volumes,networks)
  -p, --protect <patterns>         Protection patterns (wildcards supported)
  -b, --backup                     Create backup (default: true)
  --no-backup                      Disable backup
  --backup-path <path>             Custom backup directory
  -c, --config <path>              Configuration file path
  -v, --verbose                    Enable verbose logging
  --proxmox-host <host>            Proxmox host address
  --proxmox-token <token>          Proxmox API token
  --proxmox-node <node>            Proxmox node ID
```

### `dry-run`

Preview what would be removed without making changes.

```bash
proxmox-cleanup dry-run [options]
```

### `list`

List unused Docker resources without removing them.

```bash
proxmox-cleanup list [options]

Options:
  --sort-by-size                   Sort by size (largest first)
```

### `validate-config`

Validate configuration file and test connections.

```bash
proxmox-cleanup validate-config [options]

Options:
  -c, --config <path>              Configuration file to validate
```

## Resource Types

- **containers**: Stopped or exited containers
- **images**: Images not used by any container
- **volumes**: Volumes not mounted by any container
- **networks**: Networks with no connected containers (excluding defaults)

## Protection Patterns

Protect resources from cleanup using patterns:

- **Wildcards**: `important-*`, `*-production`, `*-system-*`
- **Exact names**: `my-important-container`
- **Tags**: Resources with specific tags
- **IDs**: Exact resource IDs

## Backup System

Before cleanup, the system creates backups containing:

- Resource metadata (names, IDs, sizes, creation dates)
- Dependency information
- Timestamp and system information
- JSON format for easy parsing

Backup files are stored in the configured backup directory with timestamps.

## Scheduling

Automate cleanup with cron expressions:

```json
{
  "scheduling": {
    "enabled": true,
    "cronExpression": "0 2 * * *",  // Daily at 2 AM
    "dryRun": false,
    "timezone": "UTC"
  }
}
```

Common cron patterns:
- `0 2 * * *` - Daily at 2 AM
- `0 */6 * * *` - Every 6 hours
- `0 0 * * 0` - Weekly on Sunday
- `0 0 1 * *` - Monthly on 1st

## Notifications

Get notified about cleanup results:

### Webhook Notifications

```json
{
  "notifications": {
    "enabled": true,
    "webhookUrl": "https://your-webhook.com/cleanup",
    "onSuccess": true,
    "onFailure": true
  }
}
```

### Email & Slack (Placeholder)

Email and Slack integrations are implemented as placeholders. Extend the `NotificationService` class to add actual implementations.

## Safety Features

### Dependency Checking

- Containers using images are protected
- Volumes mounted by containers are protected
- Networks with connected containers are protected
- Stopped containers with restart policies are protected

### Protected Resources

- System networks (bridge, host, none)
- Resources matching protection patterns
- Resources with specific tags or IDs

### Dry-Run Mode

- Preview all operations without making changes
- Identical results across multiple runs
- Safe for testing and validation

## Reporting

### Summary Reports

```
🧹 CLEANUP REPORT
==================================================
📊 Resources Scanned: 25
🗑️ Resources Removed: 12
💾 Disk Space Freed: 2.5 GB
⏱️ Execution Time: 1500ms
==================================================
```

### Detailed Reports

- JSON reports with full resource details
- Text summaries for human reading
- Execution logs with timestamps
- Success/failure rates

## Development

### Building

```bash
npm run build
```

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Linting

```bash
npm run lint
```

## Architecture

```
proxmox-cleanup/
├── src/
│   ├── types/           # TypeScript type definitions
│   ├── interfaces/      # Interface contracts
│   ├── clients/         # Docker & Proxmox API clients
│   ├── scanners/        # Resource scanning logic
│   ├── utils/           # Utility functions
│   ├── managers/        # Backup management
│   ├── reporters/       # Report generation
│   ├── schedulers/      # Cron scheduling
│   ├── services/        # Notification services
│   ├── orchestrators/   # Main workflow coordination
│   └── cli/             # Command-line interface
├── config.example.json  # Example configuration
└── README.md           # This file
```

## Testing Strategy

### Property-Based Testing

Uses `fast-check` to test universal properties with 100+ random inputs:

- **Resource identification completeness**
- **Safe removal guarantee**
- **Backup completeness**
- **Size calculation accuracy**
- **Report consistency**

### Unit Testing

Comprehensive unit tests for all components:

- API clients with mocked responses
- Resource scanning with various scenarios
- Error handling and edge cases
- CLI argument parsing

## Error Handling

- Graceful handling of Docker daemon failures
- Network error recovery with exponential backoff
- Partial cleanup continuation on individual failures
- Comprehensive error logging and reporting

## Performance

- Parallel resource scanning
- Efficient dependency checking
- Minimal memory footprint
- Optimized for large resource sets

## Security

- No sensitive data in logs
- Secure token handling
- Input validation and sanitization
- Principle of least privilege

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:

1. Check the documentation
2. Run `proxmox-cleanup validate-config` to test setup
3. Use `--verbose` flag for detailed logging
4. Check logs in the configured log directory

## Changelog

See `CHANGELOG.md` for version history and changes.