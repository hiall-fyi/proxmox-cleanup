# Release Notes - v1.1.0

**Release Date**: 2026-01-11  
**Type**: Minor Release (Critical Bug Fixes + Improvements)

---

## 🎯 Overview

This release fixes critical installation issues and significantly improves installation script reliability. Users who experienced "Cannot find module" errors after installation will find these issues resolved.

---

## 🐛 Critical Bug Fixes

### Issue #1: Binary Wrapper Path Resolution

**Problem**: After installing via `npm install -g proxmox-cleanup`, users encountered:
```
Error: Cannot find module '/usr/local/dist/cli/index.js'
```

**Root Cause**: The binary wrapper used bash `dirname "$0"` which doesn't follow symlinks, resulting in incorrect path resolution.

**Solution**: Rewrote the wrapper to use Node.js path resolution:
```javascript
#!/usr/bin/env node
const path = require('path');
const cliPath = path.join(__dirname, '..', 'dist', 'cli', 'index.js');
require(cliPath);
```

Node.js `__dirname` automatically follows symlinks, correctly resolving to the installed package location.

**Impact**: ✅ Command now works immediately after installation

---

### Issue #2: Installation Script Improvements

**Problem**: Installation script lacked comprehensive error handling, potentially leaving systems in broken states on failure.

**Solution**: Complete rewrite with:
- ✅ Comprehensive error checking on all critical operations
- ✅ Automatic cleanup on installation failure
- ✅ Git conflict resolution for updates
- ✅ Build verification before installation
- ✅ Better user feedback and error messages

**Impact**: ✅ Reliable installation and updates across all environments

---

## 🔧 Installation Script Improvements

### Comprehensive Error Handling

**New Features**:
- Every critical command has error checking
- Automatic cleanup on installation failure
- Clear error messages with context
- Installation state tracking

### Git Conflict Resolution

**Improvement**: Updates now handle local modifications automatically
```bash
git reset --hard HEAD
git clean -fd
git pull origin main
```
✅ Updates always succeed, preventing conflicts

### Build Verification

**New Check**: Verifies build completeness before installation
```bash
if [ ! -f "dist/cli/index.js" ]; then
    log_error "Build output not found. Cannot install globally."
    exit 1
fi
```
✅ Only installs if build is verified complete

### Better User Feedback

**Improvements**:
- Version tracking (shows before/after version in updates)
- Detailed error messages with context
- Clear next steps after installation
- Progress indicators throughout

---

## 📊 Code Quality Improvements

### Binary Wrapper

**Improvements**:
- Simplified implementation (more reliable)
- Correct path resolution using Node.js
- Better cross-platform compatibility
- Reduced from 32 lines to 9 lines

### Installation Script

**Improvements**:
- Comprehensive error handling on all critical operations
- Rollback mechanism on failure
- Security considerations (file permissions, user validation)
- Idempotent (can run multiple times safely)

---

## 📦 Installation

### New Installation

```bash
# One-line installation (recommended)
curl -fsSL https://raw.githubusercontent.com/hiall-fyi/proxmox-cleanup/main/scripts/install.sh | bash

# Or via npm
npm install -g proxmox-cleanup@1.1.0
```

### Upgrade from v1.0.0

```bash
# Method 1: Use the update script
update-proxmox-cleanup

# Method 2: Reinstall via installation script
curl -fsSL https://raw.githubusercontent.com/hiall-fyi/proxmox-cleanup/main/scripts/install.sh | bash

# Method 3: Manual npm update
npm update -g proxmox-cleanup
```

### Verify Installation

```bash
# Check version
proxmox-cleanup --version
# Should output: 1.1.0

# Test basic functionality
proxmox-cleanup --help
```

---

## 🧪 Testing

This release has been tested on:

- ✅ Proxmox VE 8.x
- ✅ Node.js 18.20.4
- ✅ Ubuntu 22.04 LTS
- ✅ Debian 12
- ✅ Fresh installation
- ✅ Upgrade from v1.0.0
- ✅ Multiple install/uninstall cycles

All 157 existing tests continue to pass.

---

## 🔄 Migration Guide

### From v1.0.0 to v1.1.0

**No breaking changes** - this is a drop-in replacement.

If you experienced the "Cannot find module" error:

1. **Uninstall old version**:
   ```bash
   npm uninstall -g proxmox-cleanup
   ```

2. **Install new version**:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/hiall-fyi/proxmox-cleanup/main/scripts/install.sh | bash
   ```

3. **Verify**:
   ```bash
   proxmox-cleanup --version  # Should show 1.1.0
   proxmox-cleanup --help     # Should work without errors
   ```

Your existing configuration at `/etc/proxmox-cleanup/config.json` will be preserved.

---

## 📈 What's Changed

### Files Modified

- `bin/proxmox-cleanup` - Rewritten for correct path resolution
- `scripts/install.sh` - Major improvements (error handling, cleanup, verification)
- `package.json` - Version bump to 1.1.0
- `README.md` - Updated version and last updated date
- `CHANGELOG.md` - Comprehensive changelog for v1.1.0

### Key Improvements

- **Reliability**: Comprehensive error handling throughout
- **Safety**: Automatic cleanup on failure
- **User Experience**: Better feedback and error messages
- **Maintainability**: Simpler, more correct code

---

## 🐛 Known Issues

None at this time.

---

## 🔜 What's Next

Future releases will focus on:

- Enhanced Proxmox VE integration
- Additional notification channels (Email, Slack)
- Web UI for monitoring and configuration
- Advanced scheduling options
- Multi-node support
- Automated testing in CI/CD

---

## 💬 Support

If you encounter any issues:

1. Check the [documentation](README.md)
2. Run `proxmox-cleanup validate-config` to test your setup
3. Use `--verbose` flag for detailed logging
4. Check logs at `/var/log/proxmox-cleanup/`
5. Open an issue on [GitHub](https://github.com/hiall-fyi/proxmox-cleanup/issues)

---

## 🙏 Acknowledgments

Thanks to the community for:
- Reporting the installation issues
- Providing detailed error logs
- Testing the fixes
- Patience during the debugging process

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

<div align="center">

**Made with ❤️ by [@hiall-fyi](https://github.com/hiall-fyi)**

If this tool saves you time and disk space, consider [buying me a coffee](https://buymeacoffee.com/hiallfyi)! ☕

### ⭐ Star this repo if you find it useful!

[![GitHub stars](https://img.shields.io/github/stars/hiall-fyi/proxmox-cleanup?style=social)](https://github.com/hiall-fyi/proxmox-cleanup)

</div>
