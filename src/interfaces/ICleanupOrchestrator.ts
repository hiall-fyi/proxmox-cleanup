import { CleanupConfig, Report, Resource } from '../types';

/**
 * Interface for cleanup orchestration
 */
export interface ICleanupOrchestrator {
  /**
   * Execute the complete cleanup workflow
   */
  executeCleanup(): Promise<Report>;

  /**
   * Execute dry-run workflow
   */
  executeDryRun(): Promise<Report>;

  /**
   * List unused resources (scanned, type-filtered, sorted) without removing.
   */
  listUnused(): Promise<Resource[]>;

  /**
   * Get cleanup configuration
   */
  getConfig(): CleanupConfig;

  /**
   * Update cleanup configuration
   */
  updateConfig(newConfig: Partial<CleanupConfig>): void;
}
