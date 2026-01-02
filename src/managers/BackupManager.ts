import * as fs from 'fs/promises';
import * as path from 'path';
import { Backup, BackupResult, Resource } from '../types';
import { IBackupManager } from '../interfaces';

/**
 * Backup manager implementation
 * Handles creation and management of resource metadata backups
 */
export class BackupManager implements IBackupManager {
  private backupDirectory: string;

  constructor(backupDirectory: string = './backups') {
    this.backupDirectory = backupDirectory;
  }

  /**
   * Create a backup of resources
   */
  async createBackup(resources: Resource[]): Promise<BackupResult> {
    try {
      // Ensure backup directory exists
      await this.ensureBackupDirectory();

      // Create backup object
      const backup: Backup = {
        timestamp: new Date(),
        resources,
        metadata: {
          proxmoxHost: process.env.PROXMOX_HOST || 'unknown',
          totalSize: resources.reduce((sum, r) => sum + r.size, 0),
          resourceCount: resources.length
        }
      };

      // Generate backup filename with timestamp
      const filename = this.generateBackupFilename();
      const backupPath = path.join(this.backupDirectory, filename);

      // Save backup to file
      await this.saveBackup(backup, backupPath);

      return {
        success: true,
        backupPath
      };
    } catch (error: any) {
      return {
        success: false,
        backupPath: '',
        error: `Failed to create backup: ${error.message}`
      };
    }
  }

  /**
   * Save backup to file
   */
  async saveBackup(backup: Backup, filePath: string): Promise<void> {
    try {
      const jsonContent = JSON.stringify(backup, null, 2);
      await fs.writeFile(filePath, jsonContent, 'utf-8');
    } catch (error: any) {
      throw new Error(`Failed to save backup to ${filePath}: ${error.message}`);
    }
  }

  /**
   * Load backup from file
   */
  async loadBackup(filePath: string): Promise<Backup> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const backup = JSON.parse(content);

      // Convert timestamp string back to Date
      backup.timestamp = new Date(backup.timestamp);

      // Convert resource createdAt strings back to Dates
      backup.resources = backup.resources.map((r: any) => ({
        ...r,
        createdAt: new Date(r.createdAt),
        lastUsed: r.lastUsed ? new Date(r.lastUsed) : undefined
      }));

      return backup;
    } catch (error: any) {
      throw new Error(`Failed to load backup from ${filePath}: ${error.message}`);
    }
  }

  /**
   * List all backups in the backup directory
   */
  async listBackups(): Promise<string[]> {
    try {
      await this.ensureBackupDirectory();
      const files = await fs.readdir(this.backupDirectory);
      return files
        .filter(f => f.endsWith('.backup.json'))
        .sort()
        .reverse(); // Most recent first
    } catch (error: any) {
      throw new Error(`Failed to list backups: ${error.message}`);
    }
  }

  /**
   * Delete a backup file
   */
  async deleteBackup(filename: string): Promise<void> {
    try {
      const filePath = path.join(this.backupDirectory, filename);
      await fs.unlink(filePath);
    } catch (error: any) {
      throw new Error(`Failed to delete backup ${filename}: ${error.message}`);
    }
  }

  /**
   * Get backup directory path
   */
  getBackupDirectory(): string {
    return this.backupDirectory;
  }

  /**
   * Set backup directory path
   */
  setBackupDirectory(directory: string): void {
    this.backupDirectory = directory;
  }

  /**
   * Ensure backup directory exists
   */
  private async ensureBackupDirectory(): Promise<void> {
    try {
      await fs.access(this.backupDirectory);
    } catch {
      // Directory doesn't exist, create it
      await fs.mkdir(this.backupDirectory, { recursive: true });
    }
  }

  /**
   * Generate backup filename with timestamp
   */
  private generateBackupFilename(): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .split('.')[0]; // Remove milliseconds
    return `cleanup_${timestamp}.backup.json`;
  }
}
