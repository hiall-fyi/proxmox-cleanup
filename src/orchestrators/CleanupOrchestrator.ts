import {
  CleanupConfig,
  CleanupResult,
  Resource,
  Report,
  CleanupError
} from '../types';
import {
  IDockerClient,
  IResourceScanner,
  IBackupManager,
  IReporter,
  ICleanupOrchestrator
} from '../interfaces';
import { SizeCalculator } from '../utils/SizeCalculator';
import { errorMessage } from '../utils/errors';

/**
 * Main orchestrator that coordinates the cleanup workflow
 */
export class CleanupOrchestrator implements ICleanupOrchestrator {
  private dockerClient: IDockerClient;
  private resourceScanner: IResourceScanner;
  private backupManager: IBackupManager;
  private reporter: IReporter;
  private config: CleanupConfig;

  constructor(
    dockerClient: IDockerClient,
    resourceScanner: IResourceScanner,
    backupManager: IBackupManager,
    reporter: IReporter,
    config: CleanupConfig
  ) {
    this.dockerClient = dockerClient;
    this.resourceScanner = resourceScanner;
    this.backupManager = backupManager;
    this.reporter = reporter;
    this.config = config;
  }

  /**
   * Execute the complete cleanup workflow
   */
  async executeCleanup(): Promise<Report> {
    const startTime = Date.now();
    const mode = this.config.cleanup.dryRun ? 'dry-run' : 'cleanup';

    try {
      await this.connectToDocker();

      const allResources = await this.scanAll();

      this.reporter.logOperationStart(mode, allResources.length);

      const filteredResources = this.filterResources(allResources);
      const sortedResources = SizeCalculator.sortResourcesBySize(filteredResources);

      if (this.config.cleanup.backupEnabled && !this.config.cleanup.dryRun) {
        await this.createBackup(sortedResources);
      }

      const cleanupResult = await this.performCleanup(sortedResources);

      // diskSpaceFreed is the sum of the sizes reported by the Docker API
      // for the resources we actually removed. Networks and volumes often
      // report 0 (Engine doesn't expose their size), so this is a lower
      // bound rather than a precise filesystem delta.
      const diskSpaceFreed = SizeCalculator.calculateTotalSize(cleanupResult.removed);
      const executionTime = Date.now() - startTime;

      const finalResult: CleanupResult = {
        ...cleanupResult,
        diskSpaceFreed,
        executionTime
      };

      const report = this.reporter.generateReport(mode, allResources, finalResult, executionTime);

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
          message: errorMessage(error),
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
    const originalDryRun = this.config.cleanup.dryRun;
    this.config.cleanup.dryRun = true;
    this.resourceScanner.setDryRun(true);

    try {
      return await this.executeCleanup();
    } finally {
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
   * Scan every resource type and return them as a single flat list.
   */
  private async scanAll(): Promise<Resource[]> {
    const [containers, images, volumes, networks] = await Promise.all([
      this.resourceScanner.scanContainers(),
      this.resourceScanner.scanImages(),
      this.resourceScanner.scanVolumes(),
      this.resourceScanner.scanNetworks()
    ]);

    return [...containers, ...images, ...volumes, ...networks];
  }

  /**
   * List unused resources without removing anything: scan, filter by the
   * configured resource types, and sort largest-first. Shares the scan +
   * filter + sort pipeline with executeCleanup so the `list` command can
   * never drift from what cleanup would actually act on.
   */
  async listUnused(): Promise<Resource[]> {
    await this.connectToDocker();
    const allResources = await this.scanAll();
    const filtered = this.filterResources(allResources);
    return SizeCalculator.sortResourcesBySize(filtered);
  }

  /**
   * Filter resources by type
   */
  private filterResources(resources: Resource[]): Resource[] {
    const { resourceTypes } = this.config.cleanup;
    if (resourceTypes.length > 0) {
      return resources.filter(resource => resourceTypes.includes(resource.type));
    }
    return resources;
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
        errorMessage(error)
      );
      throw error;
    }
  }

  /**
   * Perform the actual cleanup or dry-run.
   * The scanner fetches the container list once for the whole batch
   * rather than re-listing per resource.
   */
  private async performCleanup(resources: Resource[]): Promise<CleanupResult> {
    const result = await this.resourceScanner.performCleanup(resources);

    result.removed.forEach(r => this.reporter.logResourceRemoval(r, true));
    result.skipped.forEach(r => this.reporter.logResourceSkip(r, 'Resource is in use'));

    const errors: CleanupError[] = result.errors.map(e => ({
      type: 'unknown',
      message: e.error,
      timestamp: new Date(),
      recoverable: false,
      resource: e.resource
    }));
    errors.forEach(e => {
      if (e.resource) {
        this.reporter.logResourceRemoval(e.resource, false, e.message);
      }
    });

    return {
      removed: result.removed,
      skipped: result.skipped,
      errors,
      diskSpaceFreed: 0, // set by caller
      executionTime: 0   // set by caller
    };
  }
}
