# Installation Success Screenshot

## What this screenshot should show:

```
✅ All tests passed
ℹ️  Installing globally...
✅ Installed globally
ℹ️  Setting up configuration...
✅ Created configuration file
⚠️  Please edit /etc/proxmox-cleanup/config.json with your Proxmox settings!
ℹ️  Creating update script...
✅ Update script created at /usr/local/bin/update-proxmox-cleanup
ℹ️  Setting up systemd service...
✅ Systemd service created and enabled
ℹ️  Setting up log rotation...
✅ Log rotation configured
ℹ️  Verifying installation...
✅ proxmox-cleanup installed successfully
✅ Command line interface working
🎉 Installation completed successfully!

📋 Next steps:
1. Edit configuration: nano /etc/proxmox-cleanup/config.json
2. Test configuration: proxmox-cleanup validate-config -c /etc/proxmox-cleanup/config.json
3. Run dry-run test: proxmox-cleanup dry-run -c /etc/proxmox-cleanup/config.json
4. Perform actual cleanup: proxmox-cleanup cleanup -c /etc/proxmox-cleanup/config.json
```

## To add the screenshot:

1. Take a screenshot of the successful installation output
2. Mask any sensitive information (server names, IPs)
3. Save as `installation-success.png` in this directory
4. The README will automatically display it