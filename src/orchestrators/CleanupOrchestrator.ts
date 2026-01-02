import {
  CleanupConfig,
  CleanupResult,
  Resource,
  ResourceScanResult,
  Report,
  CleanupError
} from '../types';
import {
  IDockerClient,
  IResourceScanner,
  IBackupManager,
  IReporter,
  IProxmoxClient,
  ICleanupOrchestrator
} from '../interfaces';

/**
 * Main orchestrator that coordinates the cleanup workflow
 */
export class CleanupOrchestrator implements ICleanupOrchestrator {
  private dockerClient: IDockerClient;
  private resourceScanner: IResourceScanner;
  private backupManager: IBackupManager;
  private reporter: IReporter;
  private proxmoxClient?: IProxmoxClient;
  private config: CleanupConfig;

  constructor(
    dockerClient: IDockerClient,
    resourceScanner: IResourceScanner,
    backupManager: IBackupManager,
    reporter: IReporter,
    config: CleanupConfig,
    proxmoxClient?: IProxmoxClient
  ) {
    this.dockerClient = dockerClient;
    this.resourceScanner = resourceScanner;
    this.backupManager = backupManager;
    this.reporter = reporter;
    this.config = config;
    this.proxmoxClient = proxmoxClient;
  }

  /**
   * Execute the complete cleanup workflow
   */
  async executeCleanup(): Promise<Report> {
    const startTime = Date.now();
    const mode = this.config.cleanup.dryRun ? 'dry-run' : 'cleanup';

    try {
      this.reporter.logOperationStart(mode, 0);

      // Step 1: Connect to Docker
      await this.connectToDocker();

      // Step 2: Scan for unused resources
      const scanResult = await this.scanResources();
      const allResources = this.flattenScanResult(scanResult);

      this.reporter.logOperationStart(mode, allResources.length);

      // Step 3: Filter resources by type and protection patterns
      const filteredResources = await this.filterResources(allResources);

      // Step 4: Calculate accurate sizes
      const resourcesWithSizes = await this.calculateResourceSizes(filteredResources);

      // Step 5: Sort by size (largest first)
      const sortedResources = this.resourceScanner.sortResourcesBySize(resourcesWithSizes);

      // Step 6: Create backup if enabled
      if (this.config.cleanup.backupEnabled && !this.config.cleanup.dryRun) {
        await this.createBackup(sortedResources);
      }

      // Step 7: Get disk space before cleanup
      const diskSpaceBefore = await this.resourceScanner.getDiskSpaceBefore();

      // Step 8: Perform cleanup (or dry-run)
      const cleanupResult = await this.performCleanup(sortedResources);

      // Step 9: Get disk space after cleanup
      const diskSpaceAfter = await this.resourceScanner.getDiskSpaceAfter();
      const actualSpaceFreed = this.calculateSpaceFreed(diskSpaceBefore, diskSpaceAfter);

      // Step 10: Verify space freed (if not dry-run)
      if (!this.config.cleanup.dryRun) {
        const predictedSpace = await this.resourceScanner.calculateTotalSize(cleanupResult.removed);
        const spaceVerified = this.resourceScanner.verifySpaceFreed(predictedSpace, actualSpaceFreed);

        if (!spaceVerified) {
          this.reporter.getLogger().warn('Disk space verification failed', {
            predicted: predictedSpace,
            actual: actualSpaceFreed,
            difference: Math.abs(predictedSpace - actualSpaceFreed)
          });
        }
      }

      // Step 11: Generate and save report
      const executionTime = Date.now() - startTime;
      const finalResult: CleanupResult = {
        ...cleanupResult,
        diskSpaceFreed: this.config.cleanup.dryRun
          ? await this.resourceScanner.calculateTotalSize(cleanupResult.removed)
          : actualSpaceFreed
      };

      const report = this.reporter.generateReport(mode, allResources, finalResult, executionTime);

      // Save report files
      await this.reporter.saveReport(report);
      await this.reporter.saveSummary(report);

      this.reporter.logOperationComplete(report);

      return report;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorResult: CleanupResult = {
        removed: [],
        skipped: [],
        errors: [{
          type: 'unknown',
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
          recoverable: false
        }],
        diskSpaceFreed: 0,
        executionTime
      };

      const report = this.reporter.generateReport(mode, [], errorResult, executionTime);
      this.reporter.logOperationComplete(report);

      throw error;
    }
  }

  /**
   * Execute dry-run workflow
   */
  async executeDryRun(): Promise<Report> {
    // Temporarily set dry-run mode
    const originalDryRun = this.config.cleanup.dryRun;
    this.config.cleanup.dryRun = true;
    this.resourceScanner.setDryRun(true);

    try {
      const report = await this.executeCleanup();
      return report;
    } finally {
      // Restore original dry-run setting
      this.config.cleanup.dryRun = originalDryRun;
      this.resourceScanner.setDryRun(originalDryRun);
    }
  }

  /**
   * Get cleanup configuration
   */
  getConfig(): CleanupConfig {
    return { ...this.config };
  }

  /**
   * Update cleanup configuration
   */
  updateConfig(newConfig: Partial<CleanupConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Update scanner dry-run mode if changed
    if (newConfig.cleanup?.dryRun !== undefined) {
      this.resourceScanner.setDryRun(newConfig.cleanup.dryRun);
    }
  }

  /**
   * Connect to Docker daemon
   */
  private async connectToDocker(): Promise<void> {
    if (!this.dockerClient.isConnected()) {
      await this.dockerClient.connect();
    }
  }

  /**
   * Scan for unused resources
   */
  private async scanResources(): Promise<ResourceScanResult> {
    const [containers, images, volumes, networks] = await Promise.all([
      this.resourceScanner.scanContainers(),
      this.resourceScanner.scanImages(),
      this.resourceScanner.scanVolumes(),
      this.resourceScanner.scanNetworks()
    ]);

    const totalSize = await this.resourceScanner.calculateTotalSize([
      ...containers, ...images, ...volumes, ...networks
    ]);

    return {
      containers,
      images,
      volumes,
      networks,
      totalSize
    };
  }

  /**
   * Flatten scan result into a single array of resources
   */
  private flattenScanResult(scanResult: ResourceScanResult): Resource[] {
    return [
      ...scanResult.containers,
      ...scanResult.images,
      ...scanResult.volumes,
      ...scanResult.networks
    ];
  }

  /**
   * Filter resources by type and protection patterns
   */
  private async filterResources(resources: Resource[]): Promise<Resource[]> {
    const { resourceTypes } = this.config.cleanup;

    // Filter by resource types if specified
    if (resourceTypes.length > 0) {
      return resources.filter(resource => resourceTypes.includes(resource.type));
    }

    return resources;
  }

  /**
   * Calculate accurate sizes for resources
   */
  private async calculateResourceSizes(resources: Resource[]): Promise<Resource[]> {
    return this.resourceScanner.calculateResourceSizes(resources);
  }

  /**
   * Create backup of resources
   */
  private async createBackup(resources: Resource[]): Promise<void> {
    try {
      const backupResult = await this.backupManager.createBackup(resources);
      this.reporter.logBackupOperation(
        resources.length,
        backupResult.backupPath,
        backupResult.success,
        backupResult.error
      );

      if (!backupResult.success) {
        throw new Error(`Backup failed: ${backupResult.error}`);
      }
    } catch (error) {
      this.reporter.logBackupOperation(
        resources.length,
        '',
        false,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  /**
   * Perform the actual cleanup or dry-run
   */
  private async performCleanup(resources: Resource[]): Promise<CleanupResult> {
    const removed: Resource[] = [];
    const skipped: Resource[] = [];
    const errors: CleanupError[] = [];

    for (const resource of resources) {
      try {
        // Check if resource is still in use (safety check)
        const inUse = await this.resourceScanner.isResourceInUse(resource);
        if (inUse) {
          skipped.push(resource);
          this.reporter.logResourceSkip(resource, 'Resource is in use');
          continue;
        }

        // Perform cleanup through scanner (handles dry-run mode)
        const result = await this.resourceScanner.performCleanup([resource]);

        removed.push(...result.removed);
        skipped.push(...result.skipped);

        // Log individual resource operations
        result.removed.forEach(r => this.reporter.logResourceRemoval(r, true));
        result.skipped.forEach(r => this.reporter.logResourceSkip(r, 'Skipped by scanner'));
        result.errors.forEach(e => {
          errors.push({
            type: 'unknown',
            message: e.error,
            timestamp: new Date(),
            recoverable: false,
            resource: e.resource
          });
          this.reporter.logResourceRemoval(e.resource, false, e.error);
        });

      } catch (error) {
        const cleanupError: CleanupError = {
          type: 'unknown',
          resource,
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
          recoverable: false
        };

        errors.push(cleanupError);
        this.reporter.logResourceRemoval(resource, false, cleanupError.message);
      }
    }

    return {
      removed,
      skipped,
      errors,
      diskSpaceFreed: 0, // Will be calculated later
      executionTime: 0   // Will be set by caller
    };
  }

  /**
   * Calculate actual disk space freed
   */
  private calculateSpaceFreed(spaceBefore: number, spaceAfter: number): number {
    return Math.max(0, spaceAfter - spaceBefore);
  }
}
