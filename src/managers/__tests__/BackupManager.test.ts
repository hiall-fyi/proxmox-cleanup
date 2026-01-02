import * as fs from 'fs/promises';
import { BackupManager } from '../BackupManager';
import { Resource } from '../../types';

describe('BackupManager Error Handling', () => {
  it('should handle backup creation failure gracefully', async () => {
    const backupManager = new BackupManager('./test-backups-fail');

    // Mock the ensureBackupDirectory method to simulate failure
    const originalEnsureBackupDirectory = (backupManager as any).ensureBackupDirectory;
    (backupManager as any).ensureBackupDirectory = jest.fn().mockRejectedValue(new Error('Permission denied'));

    const testResources: Resource[] = [
      {
        id: 'test-123',
        name: 'test-resource',
        type: 'container',
        size: 1000,
        createdAt: new Date(),
        tags: []
      }
    ];

    const result = await backupManager.createBackup(testResources);

    // Property: Backup should fail gracefully when directory creation fails
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.error).toContain('Failed to create backup');

    // Restore original method
    (backupManager as any).ensureBackupDirectory = originalEnsureBackupDirectory;
  });

  it('should handle file read errors when loading backup', async () => {
    const backupManager = new BackupManager('./test-backups');

    // Try to load non-existent backup
    await expect(
      backupManager.loadBackup('/nonexistent/backup.json')
    ).rejects.toThrow();
  });

  it('should handle invalid JSON in backup file', async () => {
    const testBackupDir = './test-backups-invalid';
    const backupManager = new BackupManager(testBackupDir);

    try {
      // Create directory and invalid backup file
      await fs.mkdir(testBackupDir, { recursive: true });
      const invalidBackupPath = `${testBackupDir}/invalid.backup.json`;
      await fs.writeFile(invalidBackupPath, 'invalid json content', 'utf-8');

      // Try to load invalid backup
      await expect(
        backupManager.loadBackup(invalidBackupPath)
      ).rejects.toThrow();
    } finally {
      // Cleanup
      try {
        await fs.unlink(`${testBackupDir}/invalid.backup.json`);
        await fs.rmdir(testBackupDir);
      } catch {
        // Ignore cleanup errors
      }
    }
  });
});
