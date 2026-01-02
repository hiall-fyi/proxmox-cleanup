import { Backup, BackupResult, Resource } from '../types';

/**
 * Interface for backup management operations
 */
export interface IBackupManager {
  /**
   * Create a backup of resources
   */
  createBackup(resources: Resource[]): Promise<BackupResult>;

  /**
   * Save backup to file
   */
  saveBackup(backup: Backup, path: string): Promise<void>;

  /**
   * Load backup from file
   */
  loadBackup(path: string): Promise<Backup>;
}
