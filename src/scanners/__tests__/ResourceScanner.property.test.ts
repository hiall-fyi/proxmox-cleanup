import * as fc from 'fast-check';
import { ResourceScanner } from '../ResourceScanner';
import { IDockerClient } from '../../interfaces';

// Feature: proxmox-cleanup
// Property: Resource identification completeness
// Validates: Requirements 1.1, 1.2, 1.3, 1.4

describe('ResourceScanner Property Tests', () => {
  it('should identify all unused containers from any set of containers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.hexaString({ minLength: 12, maxLength: 64 }),
            name: fc.string({ minLength: 1, maxLength: 20 }),
            status: fc.constantFrom('running', 'stopped', 'exited'),
            imageId: fc.hexaString({ minLength: 12, maxLength: 64 }),
            size: fc.nat(),
            createdAt: fc.date(),
            tags: fc.array(fc.string(), { maxLength: 5 }),
            volumes: fc.array(fc.string(), { maxLength: 3 })
          }),
          { minLength: 0, maxLength: 20 }
        ),
        async (containers) => {
          const mockDockerClient: IDockerClient = {
            connect: jest.fn(),
            isConnected: jest.fn().mockReturnValue(true),
            listContainers: jest.fn().mockResolvedValue(
              containers.map(c => ({ ...c, type: 'container' as const }))
            ),
            listImages: jest.fn(),
            listVolumes: jest.fn(),
            listNetworks: jest.fn(),
            removeContainer: jest.fn(),
            removeImage: jest.fn(),
            removeVolume: jest.fn(),
            removeNetwork: jest.fn(),
            pruneSystem: jest.fn()
          };

          const scanner = new ResourceScanner(mockDockerClient);
          const unusedContainers = await scanner.scanContainers();

          const expectedUnusedCount = containers.filter(
            c => c.status === 'stopped' || c.status === 'exited'
          ).length;

          expect(unusedContainers.length).toBe(expectedUnusedCount);
          expect(unusedContainers.every(c => c.status !== 'running')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// Feature: proxmox-cleanup, Property 1: Safe Removal Guarantee
// Validates: Requirements 2.1, 2.2, 2.3
it('should not mark resources as unused if they are in use by any container', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.tuple(
        // Generate containers
        fc.array(
          fc.record({
            id: fc.hexaString({ minLength: 12, maxLength: 64 }),
            name: fc.string({ minLength: 1, maxLength: 20 }),
            status: fc.constantFrom('running', 'stopped', 'exited'),
            imageId: fc.hexaString({ minLength: 12, maxLength: 64 }),
            size: fc.nat(),
            createdAt: fc.date(),
            tags: fc.array(fc.string(), { maxLength: 5 }),
            volumes: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 })
          }),
          { minLength: 1, maxLength: 10 }
        ),
        // Generate images
        fc.array(
          fc.record({
            id: fc.hexaString({ minLength: 12, maxLength: 64 }),
            repository: fc.string({ minLength: 1, maxLength: 20 }),
            tag: fc.string({ minLength: 1, maxLength: 10 }),
            size: fc.nat(),
            createdAt: fc.date(),
            tags: fc.array(fc.string(), { maxLength: 5 })
          }),
          { minLength: 1, maxLength: 10 }
        )
      ),
      async ([containers, images]) => {
        const mockDockerClient: IDockerClient = {
          connect: jest.fn(),
          isConnected: jest.fn().mockReturnValue(true),
          listContainers: jest.fn().mockResolvedValue(
            containers.map(c => ({ ...c, type: 'container' as const }))
          ),
          listImages: jest.fn().mockResolvedValue(
            images.map(img => ({
              ...img,
              name: `${img.repository}:${img.tag}`,
              type: 'image' as const,
              usedByContainers: []
            }))
          ),
          listVolumes: jest.fn(),
          listNetworks: jest.fn(),
          removeContainer: jest.fn(),
          removeImage: jest.fn(),
          removeVolume: jest.fn(),
          removeNetwork: jest.fn(),
          pruneSystem: jest.fn()
        };

        const scanner = new ResourceScanner(mockDockerClient);

        // Scan for unused images
        const unusedImages = await scanner.scanImages();

        // Build set of image IDs used by containers
        const usedImageIds = new Set(containers.map(c => c.imageId));

        // Property: No unused image should be used by any container
        const allSafe = unusedImages.every(img => !usedImageIds.has(img.id));

        // Property: All images used by containers should NOT be in unused list
        const noUsedImagesInResult = unusedImages.every(img => {
          return !containers.some(c => c.imageId === img.id);
        });

        expect(allSafe).toBe(true);
        expect(noUsedImagesInResult).toBe(true);
      }
    ),
    { numRuns: 100 }
  );
});
