import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BackupManager } from '../BackupManager';
import { Resource } from '../../types';

// Feature: proxmox-cleanup, Property 3: Backup Completeness
// Validates: Requirements 6.1, 6.2, 6.4

describe('BackupManager Property Tests', () => {
  const testBackupDir = './test-backups';
  let backupManager: BackupManager;

  beforeEach(() => {
    backupManager = new BackupManager(testBackupDir);
  });

  afterEach(async () => {
    // Clean up test backup directory
    try {
      const files = await fs.readdir(testBackupDir);
      await Promise.all(
        files.map(file => fs.unlink(path.join(testBackupDir, file)))
      );
      await fs.rmdir(testBackupDir);
    } catch {
      // Directory might not exist, ignore
    }
  });

  it('should include all resources in backup', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.hexaString({ minLength: 12, maxLength: 64 }),
            name: fc.string({ minLength: 1, maxLength: 20 }),
            type: fc.constantFrom('container', 'image', 'volume', 'network'),
            size: fc.nat(),
            createdAt: fc.date(),
            tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 })
          }),
          { minLength: 1, maxLength: 20 }
        ),
        async (resources) => {
          const result = await backupManager.createBackup(resources as Resource[]);

          // Property: Backup should be created successfully
          expect(result.success).toBe(true);
          expect(result.backupPath).toBeTruthy();

          // Load the backup and verify completeness
          const backup = await backupManager.loadBackup(result.backupPath);

          // Property: All resources should be in the backup
          expect(backup.resources.length).toBe(resources.length);

          // Property: Each resource should have all required fields
          backup.resources.forEach((resource, index) => {
            expect(resource.id).toBe(resources[index].id);
            expect(resource.name).toBe(resources[index].name);
            expect(resource.type).toBe(resources[index].type);
            expect(resource.size).toBe(resources[index].size);
            expect(resource.tags).toEqual(resources[index].tags);
          });

          // Property: Metadata should be present and correct
          expect(backup.metadata.resourceCount).toBe(resources.length);
          expect(backup.metadata.totalSize).toBe(
            resources.reduce((sum, r) => sum + r.size, 0)
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should create backup before any removal occurs (round-trip)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.hexaString({ minLength: 12, maxLength: 64 }),
            name: fc.string({ minLength: 1, maxLength: 20 }),
            type: fc.constantFrom('container', 'image', 'volume', 'network'),
            size: fc.nat(),
            createdAt: fc.date(),
            tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 })
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (resources) => {
          // Create backup
          const result = await backupManager.createBackup(resources as Resource[]);
          expect(result.success).toBe(true);

          // Load backup
          const backup = await backupManager.loadBackup(result.backupPath);

          // Property: Round-trip should preserve all resource data
          expect(backup.resources.length).toBe(resources.length);

          backup.resources.forEach((backupResource, index) => {
            const originalResource = resources[index];
            expect(backupResource.id).toBe(originalResource.id);
            expect(backupResource.name).toBe(originalResource.name);
            expect(backupResource.type).toBe(originalResource.type);
            expect(backupResource.size).toBe(originalResource.size);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate unique backup filenames', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.hexaString({ minLength: 12, maxLength: 64 }),
            name: fc.string({ minLength: 1, maxLength: 20 }),
            type: fc.constantFrom('container', 'image', 'volume', 'network'),
            size: fc.nat(),
            createdAt: fc.date(),
            tags: fc.array(fc.string(), { maxLength: 5 })
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (resources) => {
          // Create multiple backups
          const result1 = await backupManager.createBackup(resources as Resource[]);

          // Small delay to ensure different timestamp
          await new Promise(resolve => setTimeout(resolve, 10));

          const result2 = await backupManager.createBackup(resources as Resource[]);

          // Property: Backup filenames should be unique
          expect(result1.backupPath).not.toBe(result2.backupPath);

          // Property: Both backups should exist
          const backup1 = await backupManager.loadBackup(result1.backupPath);
          const backup2 = await backupManager.loadBackup(result2.backupPath);

          expect(backup1.resources.length).toBe(resources.length);
          expect(backup2.resources.length).toBe(resources.length);
        }
      ),
      { numRuns: 50 } // Reduced runs due to delays
    );
  });

  it('should handle empty resource list', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant([]),
        async (resources) => {
          const result = await backupManager.createBackup(resources);

          // Property: Backup should succeed even with empty resources
          expect(result.success).toBe(true);

          const backup = await backupManager.loadBackup(result.backupPath);

          // Property: Backup should contain empty resource list
          expect(backup.resources).toEqual([]);
          expect(backup.metadata.resourceCount).toBe(0);
          expect(backup.metadata.totalSize).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
