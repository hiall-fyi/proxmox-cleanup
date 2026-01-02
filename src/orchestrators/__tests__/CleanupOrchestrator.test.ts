import { CleanupOrchestrator } from '../CleanupOrchestrator';
import {
  IDockerClient,
  IResourceScanner,
  IBackupManager,
  IReporter
} from '../../interfaces';
import {
  CleanupConfig,
  Resource,
  ContainerResource,
  ImageResource,
  BackupResult,
  Report
} from '../../types';

// Mock implementations
class MockDockerClient implements IDockerClient {
  private connected = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async listContainers(): Promise<ContainerResource[]> { return []; }
  async listImages(): Promise<ImageResource[]> { return []; }
  async listVolumes(): Promise<any[]> { return []; }
  async listNetworks(): Promise<any[]> { return []; }
  async removeContainer(): Promise<void> {}
  async removeImage(): Promise<void> {}
  async removeVolume(): Promise<void> {}
  async removeNetwork(): Promise<void> {}
  async pruneSystem(): Promise<any> { return {}; }
}

class MockResourceScanner implements IResourceScanner {
  private dryRun = false;
  private mockResources: Resource[] = [];

  constructor(mockResources: Resource[] = []) {
    this.mockResources = mockResources;
  }

  async scanContainers(): Promise<ContainerResource[]> {
    return this.mockResources.filter(r => r.type === 'container') as ContainerResource[];
  }

  async scanImages(): Promise<ImageResource[]> {
    return this.mockResources.filter(r => r.type === 'image') as ImageResource[];
  }

  async scanVolumes(): Promise<any[]> {
    return this.mockResources.filter(r => r.type === 'volume');
  }

  async scanNetworks(): Promise<any[]> {
    return this.mockResources.filter(r => r.type === 'network');
  }

  async isResourceInUse(): Promise<boolean> {
    return false; // Mock as not in use
  }

  async performCleanup(resources: Resource[]): Promise<{ removed: Resource[], skipped: Resource[], errors: any[] }> {
    if (this.dryRun) {
      return { removed: resources, skipped: [], errors: [] };
    }
    return { removed: resources, skipped: [], errors: [] };
  }

  isDryRun(): boolean {
    return this.dryRun;
  }

  setDryRun(dryRun: boolean): void {
    this.dryRun = dryRun;
  }

  async calculateResourceSizes(resources: Resource[]): Promise<Resource[]> {
    return resources;
  }

  async calculateTotalSize(resources: Resource[]): Promise<number> {
    return resources.reduce((total, r) => total + r.size, 0);
  }

  sortResourcesBySize(resources: Resource[]): Resource[] {
    return [...resources].sort((a, b) => b.size - a.size);
  }

  async getDiskSpaceBefore(): Promise<number> {
    return 1000000000; // 1GB
  }

  async getDiskSpaceAfter(): Promise<number> {
    return 1100000000; // 1.1GB (100MB freed)
  }

  verifySpaceFreed(): boolean {
    return true;
  }
}

class MockBackupManager implements IBackupManager {
  private shouldFail = false;

  setShouldFail(fail: boolean): void {
    this.shouldFail = fail;
  }

  async createBackup(): Promise<BackupResult> {
    if (this.shouldFail) {
      return {
        success: false,
        backupPath: '',
        error: 'Backup failed'
      };
    }
    return {
      success: true,
      backupPath: '/tmp/backup.json',
      error: undefined
    };
  }

  async saveBackup(): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Save backup failed');
    }
  }

  async loadBackup(): Promise<any> {
    return {
      timestamp: new Date(),
      resources: [],
      metadata: {
        proxmoxHost: 'test-host',
        totalSize: 0,
        resourceCount: 0
      }
    };
  }
}

class MockReporter implements IReporter {
  private reports: Report[] = [];

  generateReport(mode: 'dry-run' | 'cleanup', scannedResources: Resource[], result: any, executionTime: number): Report {
    const report: Report = {
      timestamp: new Date(),
      mode,
      summary: {
        resourcesScanned: scannedResources.length,
        resourcesRemoved: result.removed.length,
        diskSpaceFreed: result.diskSpaceFreed,
        executionTime
      },
      details: {
        removed: result.removed,
        skipped: result.skipped,
        errors: result.errors
      }
    };
    this.reports.push(report);
    return report;
  }

  generateSummary(): string { return 'Mock summary'; }
  async saveReport(): Promise<string> { return '/tmp/report.json'; }
  async saveSummary(): Promise<string> { return '/tmp/summary.txt'; }
  logOperationStart(): void {}
  logOperationComplete(): void {}
  logResourceRemoval(): void {}
  logResourceSkip(): void {}
  logBackupOperation(): void {}
  getLogger(): any {
    return {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn()
    };
  }

  getReports(): Report[] {
    return this.reports;
  }
}

describe('CleanupOrchestrator Integration Tests', () => {
  let orchestrator: CleanupOrchestrator;
  let mockDockerClient: MockDockerClient;
  let mockResourceScanner: MockResourceScanner;
  let mockBackupManager: MockBackupManager;
  let mockReporter: MockReporter;
  let mockConfig: CleanupConfig;

  beforeEach(() => {
    mockDockerClient = new MockDockerClient();
    mockResourceScanner = new MockResourceScanner();
    mockBackupManager = new MockBackupManager();
    mockReporter = new MockReporter();

    mockConfig = {
      proxmox: {
        host: 'proxmox.example.com',
        token: 'root@pam:password',
        nodeId: 'node1'
      },
      cleanup: {
        dryRun: false,
        resourceTypes: [],
        protectedPatterns: [],
        backupEnabled: true,
        backupPath: '/tmp/backups'
      },
      reporting: {
        verbose: true,
        logPath: '/tmp/logs'
      }
    };

    orchestrator = new CleanupOrchestrator(
      mockDockerClient,
      mockResourceScanner,
      mockBackupManager,
      mockReporter,
      mockConfig
    );
  });

  describe('End-to-End Cleanup Workflow', () => {
    it('should execute complete cleanup workflow successfully', async () => {
      // Setup mock resources
      const mockResources: Resource[] = [
        {
          id: 'container1',
          name: 'unused-container',
          type: 'container',
          size: 1000000,
          createdAt: new Date(),
          tags: []
        },
        {
          id: 'image1',
          name: 'unused-image',
          type: 'image',
          size: 5000000,
          createdAt: new Date(),
          tags: []
        }
      ];

      mockResourceScanner = new MockResourceScanner(mockResources);
      orchestrator = new CleanupOrchestrator(
        mockDockerClient,
        mockResourceScanner,
        mockBackupManager,
        mockReporter,
        mockConfig
      );

      const report = await orchestrator.executeCleanup();

      // Verify workflow execution
      expect(mockDockerClient.isConnected()).toBe(true);
      expect(report.mode).toBe('cleanup');
      expect(report.summary.resourcesScanned).toBe(2);
      expect(report.summary.resourcesRemoved).toBe(2);
      expect(report.summary.diskSpaceFreed).toBeGreaterThan(0);
      expect(report.details.removed).toHaveLength(2);
      expect(report.details.skipped).toHaveLength(0);
      expect(report.details.errors).toHaveLength(0);
    });

    it('should execute dry-run workflow successfully', async () => {
      const mockResources: Resource[] = [
        {
          id: 'container1',
          name: 'unused-container',
          type: 'container',
          size: 1000000,
          createdAt: new Date(),
          tags: []
        }
      ];

      mockResourceScanner = new MockResourceScanner(mockResources);
      orchestrator = new CleanupOrchestrator(
        mockDockerClient,
        mockResourceScanner,
        mockBackupManager,
        mockReporter,
        mockConfig
      );

      const report = await orchestrator.executeDryRun();

      // Verify dry-run execution
      expect(report.mode).toBe('dry-run');
      expect(report.summary.resourcesScanned).toBe(1);
      expect(report.summary.resourcesRemoved).toBe(1);
      expect(report.details.removed).toHaveLength(1);
      expect(report.details.errors).toHaveLength(0);
    });

    it('should handle backup creation during cleanup', async () => {
      const mockResources: Resource[] = [
        {
          id: 'container1',
          name: 'unused-container',
          type: 'container',
          size: 1000000,
          createdAt: new Date(),
          tags: []
        }
      ];

      mockResourceScanner = new MockResourceScanner(mockResources);
      orchestrator = new CleanupOrchestrator(
        mockDockerClient,
        mockResourceScanner,
        mockBackupManager,
        mockReporter,
        mockConfig
      );

      const report = await orchestrator.executeCleanup();

      expect(report.summary.resourcesRemoved).toBe(1);
      expect(report.details.errors).toHaveLength(0);
    });

    it('should handle backup failure and abort cleanup', async () => {
      const mockResources: Resource[] = [
        {
          id: 'container1',
          name: 'unused-container',
          type: 'container',
          size: 1000000,
          createdAt: new Date(),
          tags: []
        }
      ];

      mockResourceScanner = new MockResourceScanner(mockResources);
      mockBackupManager.setShouldFail(true);

      orchestrator = new CleanupOrchestrator(
        mockDockerClient,
        mockResourceScanner,
        mockBackupManager,
        mockReporter,
        mockConfig
      );

      await expect(orchestrator.executeCleanup()).rejects.toThrow('Backup failed');
    });

    it('should skip backup in dry-run mode', async () => {
      const mockResources: Resource[] = [
        {
          id: 'container1',
          name: 'unused-container',
          type: 'container',
          size: 1000000,
          createdAt: new Date(),
          tags: []
        }
      ];

      mockResourceScanner = new MockResourceScanner(mockResources);
      mockBackupManager.setShouldFail(true); // This should not affect dry-run

      orchestrator = new CleanupOrchestrator(
        mockDockerClient,
        mockResourceScanner,
        mockBackupManager,
        mockReporter,
        mockConfig
      );

      const report = await orchestrator.executeDryRun();

      expect(report.mode).toBe('dry-run');
      expect(report.summary.resourcesRemoved).toBe(1);
      expect(report.details.errors).toHaveLength(0);
    });

    it('should filter resources by type when specified', async () => {
      const mockResources: Resource[] = [
        {
          id: 'container1',
          name: 'unused-container',
          type: 'container',
          size: 1000000,
          createdAt: new Date(),
          tags: []
        },
        {
          id: 'image1',
          name: 'unused-image',
          type: 'image',
          size: 5000000,
          createdAt: new Date(),
          tags: []
        }
      ];

      mockResourceScanner = new MockResourceScanner(mockResources);

      // Configure to only clean containers
      const configWithFilter = {
        ...mockConfig,
        cleanup: {
          ...mockConfig.cleanup,
          resourceTypes: ['container' as const]
        }
      };

      orchestrator = new CleanupOrchestrator(
        mockDockerClient,
        mockResourceScanner,
        mockBackupManager,
        mockReporter,
        configWithFilter
      );

      const report = await orchestrator.executeCleanup();

      expect(report.summary.resourcesScanned).toBe(2); // Both scanned
      expect(report.summary.resourcesRemoved).toBe(1); // Only container removed
      expect(report.details.removed[0].type).toBe('container');
    });

    it('should handle errors gracefully and continue cleanup', async () => {
      const mockResources: Resource[] = [
        {
          id: 'container1',
          name: 'unused-container',
          type: 'container',
          size: 1000000,
          createdAt: new Date(),
          tags: []
        }
      ];

      // Create a scanner that throws errors
      class ErrorResourceScanner extends MockResourceScanner {
        async performCleanup(resources: Resource[]) {
          return {
            removed: [],
            skipped: [],
            errors: resources.map(r => ({ resource: r, error: 'Mock error' }))
          };
        }
      }

      mockResourceScanner = new ErrorResourceScanner(mockResources);
      orchestrator = new CleanupOrchestrator(
        mockDockerClient,
        mockResourceScanner,
        mockBackupManager,
        mockReporter,
        mockConfig
      );

      const report = await orchestrator.executeCleanup();

      expect(report.summary.resourcesScanned).toBe(1);
      expect(report.summary.resourcesRemoved).toBe(0);
      expect(report.details.errors).toHaveLength(1);
      expect(report.details.errors[0].message).toBe('Mock error');
    });
  });

  describe('Configuration Management', () => {
    it('should return current configuration', () => {
      const config = orchestrator.getConfig();
      expect(config).toEqual(mockConfig);
    });

    it('should update configuration', () => {
      const newConfig = {
        cleanup: {
          dryRun: true,
          resourceTypes: ['container' as const],
          protectedPatterns: ['important-*'],
          backupEnabled: false,
          backupPath: '/new/path'
        }
      };

      orchestrator.updateConfig(newConfig);
      const updatedConfig = orchestrator.getConfig();

      expect(updatedConfig.cleanup.dryRun).toBe(true);
      expect(updatedConfig.cleanup.resourceTypes).toEqual(['container']);
      expect(updatedConfig.cleanup.protectedPatterns).toEqual(['important-*']);
      expect(updatedConfig.cleanup.backupEnabled).toBe(false);
    });

    it('should update scanner dry-run mode when config changes', () => {
      expect(mockResourceScanner.isDryRun()).toBe(false);

      orchestrator.updateConfig({
        cleanup: { ...mockConfig.cleanup, dryRun: true }
      });

      expect(mockResourceScanner.isDryRun()).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle Docker connection failure', async () => {
      // Create a client that fails to connect
      class FailingDockerClient extends MockDockerClient {
        async connect(): Promise<void> {
          throw new Error('Connection failed');
        }
      }

      orchestrator = new CleanupOrchestrator(
        new FailingDockerClient(),
        mockResourceScanner,
        mockBackupManager,
        mockReporter,
        mockConfig
      );

      await expect(orchestrator.executeCleanup()).rejects.toThrow('Connection failed');
    });

    it('should handle resource scanning failure', async () => {
      // Create a scanner that fails
      class FailingResourceScanner extends MockResourceScanner {
        async scanContainers(): Promise<ContainerResource[]> {
          throw new Error('Scan failed');
        }
      }

      orchestrator = new CleanupOrchestrator(
        mockDockerClient,
        new FailingResourceScanner(),
        mockBackupManager,
        mockReporter,
        mockConfig
      );

      await expect(orchestrator.executeCleanup()).rejects.toThrow('Scan failed');
    });
  });
});
