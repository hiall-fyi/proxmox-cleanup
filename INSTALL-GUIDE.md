# Proxmox Cleanup - PVE Host Installation Guide

## Prerequisites

Before installing on your Proxmox VE host, ensure you have:

- **Node.js 18+** and **npm** installed
- **Docker daemon** running
- **Root or sudo access** on the PVE host

### Check Prerequisites

```bash
# Check Node.js version (required: 18+)
node --version

# Check npm
npm --version

# Check Docker is running
docker ps

# Install Node.js if needed (on Debian/Ubuntu)
apt update
apt install nodejs npm -y
```

## Installation Methods

### Method 1: Install from Source (Recommended)

```bash
# 1. Clone or copy your project to PVE host
cd /opt
git clone <your-repo-url> proxmox-cleanup
cd proxmox-cleanup

# 2. Install dependencies and build
npm install
npm run build

# 3. Install globally
npm install -g .

# 4. Verify installation
proxmox-cleanup --version
```

### Method 2: Direct Global Install (if published to npm)

```bash
npm install -g proxmox-cleanup
```

## Configuration Setup

### 1. Create Configuration Directory

```bash
# Create system-wide config directory
mkdir -p /etc/proxmox-cleanup
cd /etc/proxmox-cleanup
```

### 2. Create Configuration File

```bash
# Copy example config
cp /opt/proxmox-cleanup/config.example.json /etc/proxmox-cleanup/config.json

# Edit configuration
nano /etc/proxmox-cleanup/config.json
```

### 3. Essential Configuration

Edit `/etc/proxmox-cleanup/config.json`:

```json
{
  "proxmox": {
    "host": "localhost",
    "token": "root@pam:your-api-token",
    "nodeId": "your-node-name"
  },
  "cleanup": {
    "dryRun": false,
    "resourceTypes": [],
    "protectedPatterns": [
      "important-*",
      "system-*",
      "production-*",
      "pve-*",
      "proxmox-*"
    ],
    "backupEnabled": true,
    "backupPath": "/var/backups/proxmox-cleanup"
  },
  "reporting": {
    "verbose": true,
    "logPath": "/var/log/proxmox-cleanup"
  }
}
```

### 4. Create Required Directories

```bash
# Create backup directory
mkdir -p /var/backups/proxmox-cleanup

# Create log directory
mkdir -p /var/log/proxmox-cleanup

# Set proper permissions
chown root:root /var/backups/proxmox-cleanup
chown root:root /var/log/proxmox-cleanup
chmod 755 /var/backups/proxmox-cleanup
chmod 755 /var/log/proxmox-cleanup
```

## Proxmox API Token Setup

### 1. Create API Token in Proxmox Web UI

1. Login to Proxmox Web UI
2. Go to **Datacenter** → **Permissions** → **API Tokens**
3. Click **Add** and create token:
   - **User**: `root@pam`
   - **Token ID**: `cleanup-tool`
   - **Privilege Separation**: Unchecked (for full access)
4. Copy the generated token

### 2. Alternative: Create via CLI

```bash
# Create API token via pvesh
pvesh create /access/users/root@pam/token/cleanup-tool -privsep 0
```

## Verification & Testing

### 1. Validate Configuration

```bash
# Test configuration and connections
proxmox-cleanup validate-config -c /etc/proxmox-cleanup/config.json
```

### 2. Test Dry Run

```bash
# Safe test run (no actual cleanup)
proxmox-cleanup dry-run -c /etc/proxmox-cleanup/config.json -v
```

### 3. List Unused Resources

```bash
# See what would be cleaned
proxmox-cleanup list -c /etc/proxmox-cleanup/config.json --sort-by-size
```

## Usage Examples

### Basic Cleanup

```bash
# Full cleanup with backup
proxmox-cleanup cleanup -c /etc/proxmox-cleanup/config.json

# Cleanup specific types only
proxmox-cleanup cleanup -c /etc/proxmox-cleanup/config.json -t containers,images

# Dry run first (recommended)
proxmox-cleanup dry-run -c /etc/proxmox-cleanup/config.json
```

### Advanced Usage

```bash
# Cleanup with custom protection patterns
proxmox-cleanup cleanup \
  -c /etc/proxmox-cleanup/config.json \
  -p "important-*,system-*,pve-*" \
  --verbose

# Cleanup without backup (faster)
proxmox-cleanup cleanup \
  -c /etc/proxmox-cleanup/config.json \
  --no-backup

# List resources sorted by size
proxmox-cleanup list \
  -c /etc/proxmox-cleanup/config.json \
  --sort-by-size
```

## Automation Setup

### 1. Create Systemd Service (Optional)

```bash
# Create service file
cat > /etc/systemd/system/proxmox-cleanup.service << 'EOF'
[Unit]
Description=Proxmox Docker Cleanup
After=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/proxmox-cleanup cleanup -c /etc/proxmox-cleanup/config.json
User=root
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Enable service
systemctl enable proxmox-cleanup.service
```

### 2. Setup Cron Job

```bash
# Add to root crontab
crontab -e

# Add line for daily cleanup at 2 AM
0 2 * * * /usr/local/bin/proxmox-cleanup cleanup -c /etc/proxmox-cleanup/config.json >> /var/log/proxmox-cleanup/cron.log 2>&1
```

### 3. Setup Log Rotation

```bash
# Create logrotate config
cat > /etc/logrotate.d/proxmox-cleanup << 'EOF'
/var/log/proxmox-cleanup/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 root root
}
EOF
```

## Troubleshooting

### Common Issues

1. **Command not found**
   ```bash
   # Check global installation
   npm list -g proxmox-cleanup
   
   # Check PATH
   echo $PATH
   
   # Find npm global bin directory
   npm config get prefix
   ```

2. **Docker connection failed**
   ```bash
   # Check Docker daemon
   systemctl status docker
   
   # Check Docker socket permissions
   ls -la /var/run/docker.sock
   
   # Add user to docker group if needed
   usermod -aG docker root
   ```

3. **Proxmox API connection failed**
   ```bash
   # Test API token manually
   curl -k -H "Authorization: PVEAPIToken=root@pam:cleanup-tool=your-token" \
        https://localhost:8006/api2/json/version
   ```

### Debug Mode

```bash
# Run with maximum verbosity
proxmox-cleanup cleanup \
  -c /etc/proxmox-cleanup/config.json \
  --verbose \
  --dry-run
```

## Security Considerations

1. **API Token Security**
   - Store tokens securely in config files
   - Use least privilege principle
   - Rotate tokens regularly

2. **File Permissions**
   ```bash
   # Secure config file
   chmod 600 /etc/proxmox-cleanup/config.json
   chown root:root /etc/proxmox-cleanup/config.json
   ```

3. **Protected Patterns**
   - Always include system containers in protection patterns
   - Test with dry-run before actual cleanup
   - Keep backups enabled

## Monitoring & Maintenance

### 1. Check Logs

```bash
# View recent logs
tail -f /var/log/proxmox-cleanup/*.log

# Check systemd journal
journalctl -u proxmox-cleanup.service -f
```

### 2. Monitor Disk Usage

```bash
# Check backup directory size
du -sh /var/backups/proxmox-cleanup

# Check log directory size
du -sh /var/log/proxmox-cleanup
```

### 3. Regular Maintenance

```bash
# Clean old backups (keep last 30 days)
find /var/backups/proxmox-cleanup -name "*.json" -mtime +30 -delete

# Validate config periodically
proxmox-cleanup validate-config -c /etc/proxmox-cleanup/config.json
```

## Uninstallation

```bash
# Remove global package
npm uninstall -g proxmox-cleanup

# Remove configuration
rm -rf /etc/proxmox-cleanup

# Remove logs and backups (optional)
rm -rf /var/log/proxmox-cleanup
rm -rf /var/backups/proxmox-cleanup

# Remove systemd service
systemctl disable proxmox-cleanup.service
rm /etc/systemd/system/proxmox-cleanup.service
systemctl daemon-reload

# Remove cron job
crontab -e  # Remove the cleanup line

# Remove logrotate config
rm /etc/logrotate.d/proxmox-cleanup
```

## Support

For issues and questions:

1. Check logs in `/var/log/proxmox-cleanup/`
2. Run with `--verbose` flag for detailed output
3. Test with `dry-run` mode first
4. Validate configuration with `validate-config` command