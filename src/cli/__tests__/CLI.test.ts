import { ProxmoxCleanupCLI } from '../index';
import { CleanupConfig } from '../../types';
import * as fs from 'fs';

// Mock all external dependencies
jest.mock('../../orchestrators/CleanupOrchestrator');
jest.mock('../../clients/DockerClient');
jest.mock('../../scanners/ResourceScanner');
jest.mock('../../managers/BackupManager');
jest.mock('../../reporters/Reporter');
jest.mock('../../clients/ProxmoxClient');
jest.mock('fs');
jest.mock('path');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('ProxmoxCleanupCLI', () => {
  let cli: ProxmoxCleanupCLI;
  let originalArgv: string[];
  let originalExit: typeof process.exit;
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;

  // Capture console output
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    // Save original values
    originalArgv = process.argv;
    originalExit = process.exit;
    originalConsoleLog = console.log;
    originalConsoleError = console.error;

    // Mock console methods
    consoleOutput = [];
    consoleErrors = [];
    console.log = jest.fn((...args) => consoleOutput.push(args.join(' ')));
    console.error = jest.fn((...args) => consoleErrors.push(args.join(' ')));

    // Mock process.exit
    process.exit = jest.fn() as any;

    // Reset mocks
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockReturnValue('{}');

    cli = new ProxmoxCleanupCLI();
  });

  afterEach(() => {
    // Restore original values
    process.argv = originalArgv;
    process.exit = originalExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  describe('CLI Argument Parsing', () => {
    it('should parse cleanup command with all options', async () => {
      const testArgs = [
        'node',
        'cli.js',
        'cleanup',
        '--dry-run',
        '--types', 'containers,images',
        '--protect', 'important-*,system-*',
        '--backup',
        '--backup-path', '/custom/backup',
        '--verbose',
        '--log-path', '/custom/logs',
        '--proxmox-host', 'proxmox.example.com',
        '--proxmox-token', 'root@pam:password',
        '--proxmox-node', 'node1'
      ];

      process.argv = testArgs;

      // Mock successful execution
      const mockExecuteCleanup = jest.spyOn(cli as any, 'executeCleanup').mockResolvedValue(undefined);

      await cli.run();

      expect(mockExecuteCleanup).toHaveBeenCalledWith(
        expect.objectContaining({
          dryRun: true,
          types: 'containers,images',
          protect: 'important-*,system-*',
          backup: true,
          backupPath: '/custom/backup',
          verbose: true,
          logPath: '/custom/logs',
          proxmoxHost: 'proxmox.example.com',
          proxmoxToken: 'root@pam:password',
          proxmoxNode: 'node1'
        })
      );
    });

    it('should parse dry-run command with options', async () => {
      const testArgs = [
        'node',
        'cli.js',
        'dry-run',
        '--types', 'volumes,networks',
        '--protect', 'keep-*',
        '--verbose'
      ];

      process.argv = testArgs;

      const mockExecuteDryRun = jest.spyOn(cli as any, 'executeDryRun').mockResolvedValue(undefined);

      await cli.run();

      expect(mockExecuteDryRun).toHaveBeenCalledWith(
        expect.objectContaining({
          types: 'volumes,networks',
          protect: 'keep-*',
          verbose: true
        })
      );
    });

    it('should parse list command with options', async () => {
      const testArgs = [
        'node',
        'cli.js',
        'list',
        '--types', 'images',
        '--sort-by-size'
      ];

      process.argv = testArgs;

      const mockListResources = jest.spyOn(cli as any, 'listResources').mockResolvedValue(undefined);

      await cli.run();

      expect(mockListResources).toHaveBeenCalledWith(
        expect.objectContaining({
          types: 'images',
          sortBySize: true
        })
      );
    });

    it('should parse validate-config command', async () => {
      const testArgs = [
        'node',
        'cli.js',
        'validate-config',
        '--config', '/path/to/config.json'
      ];

      process.argv = testArgs;

      const mockValidateConfig = jest.spyOn(cli as any, 'validateConfig').mockResolvedValue(undefined);

      await cli.run();

      expect(mockValidateConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          config: '/path/to/config.json'
        })
      );
    });

    it('should handle --no-backup option', async () => {
      const testArgs = [
        'node',
        'cli.js',
        'cleanup',
        '--no-backup'
      ];

      process.argv = testArgs;

      const mockExecuteCleanup = jest.spyOn(cli as any, 'executeCleanup').mockResolvedValue(undefined);

      await cli.run();

      expect(mockExecuteCleanup).toHaveBeenCalledWith(
        expect.objectContaining({
          backup: false
        })
      );
    });
  });

  describe('Configuration Loading', () => {
    it('should load configuration from file when specified', async () => {
      const mockConfig: CleanupConfig = {
        proxmox: {
          host: 'test-host',
          token: 'test-token',
          nodeId: 'test-node'
        },
        cleanup: {
          dryRun: false,
          resourceTypes: ['container'],
          protectedPatterns: ['important-*'],
          backupEnabled: true,
          backupPath: '/test/backup'
        },
        reporting: {
          verbose: true,
          logPath: '/test/logs'
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const options = { config: '/path/to/config.json' };
      const config = await (cli as any).loadConfig(options);

      expect(mockFs.existsSync).toHaveBeenCalledWith('/path/to/config.json');
      expect(mockFs.readFileSync).toHaveBeenCalledWith('/path/to/config.json', 'utf8');
      expect(config).toEqual(mockConfig);
    });

    it('should create default configuration when no file specified', async () => {
      const options = {};
      const config = await (cli as any).loadConfig(options);

      expect(config).toEqual({
        proxmox: {
          host: '',
          token: '',
          nodeId: ''
        },
        cleanup: {
          dryRun: false,
          resourceTypes: [],
          protectedPatterns: [],
          backupEnabled: true,
          backupPath: './backups'
        },
        reporting: {
          verbose: false,
          logPath: './logs'
        }
      });
    });

    it('should override config with CLI options', async () => {
      const options = {
        dryRun: true,
        types: 'containers,images',
        protect: 'keep-*,important-*',
        backup: false,
        backupPath: '/custom/backup',
        verbose: true,
        logPath: '/custom/logs',
        proxmoxHost: 'custom-host',
        proxmoxToken: 'custom-token',
        proxmoxNode: 'custom-node'
      };

      const config = await (cli as any).loadConfig(options);

      expect(config.cleanup.dryRun).toBe(true);
      expect(config.cleanup.resourceTypes).toEqual(['container', 'image']);
      expect(config.cleanup.protectedPatterns).toEqual(['keep-*', 'important-*']);
      expect(config.cleanup.backupEnabled).toBe(false);
      expect(config.cleanup.backupPath).toBe('/custom/backup');
      expect(config.reporting.verbose).toBe(true);
      expect(config.reporting.logPath).toBe('/custom/logs');
      expect(config.proxmox.host).toBe('custom-host');
      expect(config.proxmox.token).toBe('custom-token');
      expect(config.proxmox.nodeId).toBe('custom-node');
    });
  });

  describe('Resource Type Parsing', () => {
    it('should parse valid resource types', () => {
      const result = (cli as any).parseResourceTypes('containers,images,volumes,networks');
      expect(result).toEqual(['container', 'image', 'volume', 'network']);
    });

    it('should handle single resource type', () => {
      const result = (cli as any).parseResourceTypes('containers');
      expect(result).toEqual(['container']);
    });

    it('should handle whitespace in resource types', () => {
      const result = (cli as any).parseResourceTypes(' containers , images ');
      expect(result).toEqual(['container', 'image']);
    });

    it('should throw error for invalid resource types', () => {
      expect(() => {
        (cli as any).parseResourceTypes('containers,invalid,images');
      }).toThrow('Invalid resource type: invalid');
    });

    it('should handle mixed case resource types', () => {
      const result = (cli as any).parseResourceTypes('Containers,IMAGES');
      expect(result).toEqual(['container', 'image']);
    });
  });

  describe('Resource Filtering', () => {
    const mockResources = [
      { type: 'container', name: 'test-container', size: 1000 },
      { type: 'image', name: 'test-image', size: 2000 },
      { type: 'volume', name: 'test-volume', size: 3000 },
      { type: 'network', name: 'test-network', size: 0 }
    ];

    it('should return all resources when types is "all"', () => {
      const result = (cli as any).filterResourcesByType(mockResources, 'all');
      expect(result).toEqual(mockResources);
    });

    it('should return all resources when types is empty', () => {
      const result = (cli as any).filterResourcesByType(mockResources, '');
      expect(result).toEqual(mockResources);
    });

    it('should filter by single resource type', () => {
      const result = (cli as any).filterResourcesByType(mockResources, 'containers');
      expect(result).toEqual([mockResources[0]]);
    });

    it('should filter by multiple resource types', () => {
      const result = (cli as any).filterResourcesByType(mockResources, 'containers,images');
      expect(result).toEqual([mockResources[0], mockResources[1]]);
    });
  });

  describe('Utility Functions', () => {
    it('should format bytes correctly', () => {
      expect((cli as any).formatBytes(0)).toBe('0 B');
      expect((cli as any).formatBytes(1024)).toBe('1 KB');
      expect((cli as any).formatBytes(1048576)).toBe('1 MB');
      expect((cli as any).formatBytes(1073741824)).toBe('1 GB');
      expect((cli as any).formatBytes(1536)).toBe('1.5 KB');
    });

    it('should get correct resource icons', () => {
      expect((cli as any).getResourceIcon('container')).toBe('📦');
      expect((cli as any).getResourceIcon('image')).toBe('🖼️');
      expect((cli as any).getResourceIcon('volume')).toBe('💾');
      expect((cli as any).getResourceIcon('network')).toBe('🌐');
      expect((cli as any).getResourceIcon('unknown')).toBe('📄');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate correct configuration structure', () => {
      const validConfig: CleanupConfig = {
        proxmox: { host: '', token: '', nodeId: '' },
        cleanup: {
          dryRun: false,
          resourceTypes: ['container', 'image'],
          protectedPatterns: [],
          backupEnabled: true,
          backupPath: './backups'
        },
        reporting: { verbose: false, logPath: './logs' }
      };

      expect(() => {
        (cli as any).validateConfigStructure(validConfig);
      }).not.toThrow();
    });

    it('should throw error for missing sections', () => {
      const invalidConfig = {
        proxmox: { host: '', token: '', nodeId: '' }
        // Missing cleanup and reporting sections
      };

      expect(() => {
        (cli as any).validateConfigStructure(invalidConfig);
      }).toThrow('Invalid configuration structure');
    });

    it('should throw error for invalid resource types', () => {
      const invalidConfig: any = {
        proxmox: { host: '', token: '', nodeId: '' },
        cleanup: {
          dryRun: false,
          resourceTypes: ['container', 'invalid-type'],
          protectedPatterns: [],
          backupEnabled: true,
          backupPath: './backups'
        },
        reporting: { verbose: false, logPath: './logs' }
      };

      expect(() => {
        (cli as any).validateConfigStructure(invalidConfig);
      }).toThrow('Invalid resource types in config: invalid-type');
    });
  });

  describe('Error Handling', () => {
    it('should handle cleanup execution errors', async () => {
      const testArgs = ['node', 'cli.js', 'cleanup'];
      process.argv = testArgs;

      jest.spyOn(cli as any, 'executeCleanup').mockRejectedValue(new Error('Cleanup failed'));

      await cli.run();

      expect(process.exit).toHaveBeenCalledWith(1);
      expect(consoleErrors).toContain('❌ Cleanup failed: Cleanup failed');
    });

    it('should handle dry-run execution errors', async () => {
      const testArgs = ['node', 'cli.js', 'dry-run'];
      process.argv = testArgs;

      jest.spyOn(cli as any, 'executeDryRun').mockRejectedValue(new Error('Dry-run failed'));

      await cli.run();

      expect(process.exit).toHaveBeenCalledWith(1);
      expect(consoleErrors).toContain('❌ Dry-run failed: Dry-run failed');
    });

    it('should handle list resources errors', async () => {
      const testArgs = ['node', 'cli.js', 'list'];
      process.argv = testArgs;

      jest.spyOn(cli as any, 'listResources').mockRejectedValue(new Error('List failed'));

      await cli.run();

      expect(process.exit).toHaveBeenCalledWith(1);
      expect(consoleErrors).toContain('❌ List failed: List failed');
    });

    it('should handle config validation errors', async () => {
      const testArgs = ['node', 'cli.js', 'validate-config'];
      process.argv = testArgs;

      jest.spyOn(cli as any, 'validateConfig').mockRejectedValue(new Error('Config invalid'));

      await cli.run();

      expect(process.exit).toHaveBeenCalledWith(1);
      expect(consoleErrors).toContain('❌ Config validation failed: Config invalid');
    });

    it('should handle JSON parsing errors in config file', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');

      const options = { config: '/path/to/config.json' };

      await expect((cli as any).loadConfig(options)).rejects.toThrow();
    });
  });

  describe('Display Functions', () => {
    it('should display cleanup report correctly', () => {
      const mockReport = {
        summary: {
          resourcesScanned: 10,
          resourcesRemoved: 5,
          diskSpaceFreed: 1048576,
          executionTime: 1500
        },
        details: {
          removed: [
            { name: 'container1', type: 'container', size: 524288 },
            { name: 'image1', type: 'image', size: 524288 }
          ],
          skipped: [],
          errors: []
        }
      };

      (cli as any).displayReport(mockReport, false);

      expect(consoleOutput.some(line => line.includes('CLEANUP REPORT'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('Resources Scanned: 10'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('Resources Removed: 5'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('1 MB'))).toBe(true);
    });

    it('should display dry-run report correctly', () => {
      const mockReport = {
        summary: {
          resourcesScanned: 8,
          resourcesRemoved: 3,
          diskSpaceFreed: 2097152,
          executionTime: 800
        },
        details: {
          removed: [
            { name: 'container1', type: 'container', size: 1048576 }
          ],
          skipped: [
            { name: 'container2', type: 'container', size: 1048576 }
          ],
          errors: []
        }
      };

      (cli as any).displayReport(mockReport, true);

      expect(consoleOutput.some(line => line.includes('DRY-RUN REPORT'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('Would Be Removed: 3'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('Resources Skipped: 1'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('This was a dry-run'))).toBe(true);
    });

    it('should display resource list correctly', () => {
      const mockResources = [
        { name: 'container1', type: 'container', size: 1048576 },
        { name: 'image1', type: 'image', size: 2097152 },
        { name: 'volume1', type: 'volume', size: 524288 }
      ];

      (cli as any).displayResourceList(mockResources);

      expect(consoleOutput.some(line => line.includes('Found 3 unused resources'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('CONTAINER'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('IMAGE'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('VOLUME'))).toBe(true);
    });

    it('should display empty resource list message', () => {
      (cli as any).displayResourceList([]);

      expect(consoleOutput.some(line => line.includes('No unused resources found!'))).toBe(true);
    });
  });
});
