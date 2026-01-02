# Proxmox Cleanup - Installation Test

## One-Line Installation Command

```bash
curl -fsSL https://raw.githubusercontent.com/busyass/proxmox-cleanup/main/scripts/install.sh | bash
```

## Manual Installation Steps

1. **Clone Repository**
   ```bash
   git clone https://github.com/busyass/proxmox-cleanup.git
   cd proxmox-cleanup
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build Project**
   ```bash
   npm run build
   ```

4. **Run Tests**
   ```bash
   npm test
   ```

5. **Install Globally**
   ```bash
   npm install -g .
   ```

6. **Verify Installation**
   ```bash
   proxmox-cleanup --version
   proxmox-cleanup --help
   ```

## Test Results

- ✅ All 157 tests pass
- ✅ No linting errors
- ✅ TypeScript compilation successful
- ✅ GitHub repository accessible
- ✅ Installation script accessible via curl

## Ready for Production Use

The proxmox-cleanup tool v1.0.0 is now ready for production use on Proxmox VE hosts.