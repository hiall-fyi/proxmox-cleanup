import { SizeCalculator } from '../SizeCalculator';
import { Resource } from '../../types';
import * as fc from 'fast-check';

// Arbitraries for generating test data
const containerArbitrary = fc.record({
  id: fc.string({ minLength: 1 }),
  name: fc.string({ minLength: 1 }),
  type: fc.constant('container' as const),
  size: fc.nat({ max: 1000000000 }), // Up to 1GB
  createdAt: fc.date(),
  tags: fc.array(fc.string()),
  status: fc.oneof(
    fc.constant('running' as const),
    fc.constant('stopped' as const),
    fc.constant('exited' as const)
  ),
  imageId: fc.string({ minLength: 1 }),
  volumes: fc.array(fc.string())
});

const imageArbitrary = fc.record({
  id: fc.string({ minLength: 1 }),
  name: fc.string({ minLength: 1 }),
  type: fc.constant('image' as const),
  size: fc.nat({ max: 5000000000 }),
  createdAt: fc.date(),
  tags: fc.array(fc.string()),
  repository: fc.string({ minLength: 1 }),
  tag: fc.string({ minLength: 1 }),
  usedByContainers: fc.array(fc.string())
});

const volumeArbitrary = fc.record({
  id: fc.string({ minLength: 1 }),
  name: fc.string({ minLength: 1 }),
  type: fc.constant('volume' as const),
  size: fc.nat({ max: 2000000000 }),
  createdAt: fc.date(),
  tags: fc.array(fc.string()),
  mountPoint: fc.string({ minLength: 1 }),
  usedByContainers: fc.array(fc.string())
});

const networkArbitrary = fc.record({
  id: fc.string({ minLength: 1 }),
  name: fc.string({ minLength: 1 }),
  type: fc.constant('network' as const),
  size: fc.constant(0),
  createdAt: fc.date(),
  tags: fc.array(fc.string()),
  driver: fc.string({ minLength: 1 }),
  connectedContainers: fc.array(fc.string())
});

const resourceArbitrary = fc.oneof(
  containerArbitrary,
  imageArbitrary,
  volumeArbitrary,
  networkArbitrary
);

describe('SizeCalculator Property Tests', () => {
  let sizeCalculator: SizeCalculator;

  beforeEach(() => {
    sizeCalculator = new SizeCalculator();
  });

  describe('Property 4: Size Calculation Accuracy', () => {
    // Feature: proxmox-cleanup, Property 4: Size Calculation Accuracy
    // Validates: Requirements 4.1, 4.2
    it('should calculate total size as sum of individual resource sizes', () => {
      fc.assert(
        fc.property(
          fc.array(resourceArbitrary, { minLength: 1, maxLength: 10 }),
          (resources) => {
            const totalSize = sizeCalculator.calculateTotalSize(resources);
            const expectedTotal = resources.reduce((sum, r) => sum + r.size, 0);

            expect(totalSize).toBe(expectedTotal);
            expect(totalSize).toBeGreaterThanOrEqual(0);

            if (resources.every(r => r.size === 0)) {
              expect(totalSize).toBe(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return resources unchanged from updateResourceSizes', () => {
      fc.assert(
        fc.property(
          fc.array(resourceArbitrary, { minLength: 1, maxLength: 5 }),
          (resources) => {
            const updatedResources = sizeCalculator.updateResourceSizes(resources);

            expect(updatedResources).toHaveLength(resources.length);

            updatedResources.forEach((updated: Resource, index: number) => {
              expect(updated.id).toBe(resources[index].id);
              expect(updated.type).toBe(resources[index].type);
              expect(updated.name).toBe(resources[index].name);
              expect(updated.size).toBe(resources[index].size);
            });

            updatedResources
              .filter((r: Resource) => r.type === 'network')
              .forEach((network: Resource) => {
                expect(network.size).toBe(0);
              });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should sort resources correctly by size', () => {
      fc.assert(
        fc.property(
          fc.array(resourceArbitrary, { minLength: 2, maxLength: 10 }),
          (resources) => {
            const sortedResources = sizeCalculator.sortResourcesBySize(resources);

            expect(sortedResources).toHaveLength(resources.length);

            for (let i = 0; i < sortedResources.length - 1; i++) {
              expect(sortedResources[i].size).toBeGreaterThanOrEqual(sortedResources[i + 1].size);
            }

            const originalIds = resources.map(r => r.id).sort();
            const sortedIds = sortedResources.map((r: Resource) => r.id).sort();
            expect(sortedIds).toEqual(originalIds);

            expect(sortedResources[0].size).toBe(Math.max(...resources.map(r => r.size)));
            expect(sortedResources[sortedResources.length - 1].size)
              .toBe(Math.min(...resources.map(r => r.size)));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not mutate the input array when sorting', () => {
      fc.assert(
        fc.property(
          fc.array(resourceArbitrary, { minLength: 2, maxLength: 10 }),
          (resources) => {
            const originalOrder = resources.map(r => r.id);
            sizeCalculator.sortResourcesBySize(resources);
            expect(resources.map(r => r.id)).toEqual(originalOrder);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Size Formatting', () => {
    it('should format bytes correctly', () => {
      expect(SizeCalculator.formatBytes(0)).toBe('0 B');
      expect(SizeCalculator.formatBytes(1024)).toBe('1 KB');
      expect(SizeCalculator.formatBytes(1024 * 1024)).toBe('1 MB');
      expect(SizeCalculator.formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
      expect(SizeCalculator.formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1 TB');

      expect(SizeCalculator.formatBytes(1536)).toBe('1.5 KB');
      expect(SizeCalculator.formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
    });

    it('should handle formatting edge cases', () => {
      expect(SizeCalculator.formatBytes(-1)).toBe('0 B');
      expect(SizeCalculator.formatBytes(0.5)).toBe('0.5 B');
      expect(SizeCalculator.formatBytes(Number.MAX_SAFE_INTEGER)).toContain('B');
    });
  });
});
