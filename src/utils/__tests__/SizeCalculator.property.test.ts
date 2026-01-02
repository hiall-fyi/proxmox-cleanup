import { SizeCalculator } from '../SizeCalculator';
import { IDockerClient } from '../../interfaces';
import { ContainerResource, ImageResource, VolumeResource, NetworkResource, Resource } from '../../types';
import * as fc from 'fast-check';

// Mock Docker client for testing
class MockDockerClient implements IDockerClient {
  private containers: ContainerResource[] = [];
  private images: ImageResource[] = [];
  private volumes: VolumeResource[] = [];
  private networks: NetworkResource[] = [];
  private connected = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async listContainers(_all?: boolean): Promise<ContainerResource[]> {
    return this.containers;
  }

  async listImages(): Promise<ImageResource[]> {
    return this.images;
  }

  async listVolumes(): Promise<VolumeResource[]> {
    return this.volumes;
  }

  async listNetworks(): Promise<NetworkResource[]> {
    return this.networks;
  }

  async removeContainer(_id: string): Promise<void> {}
  async removeImage(_id: string): Promise<void> {}
  async removeVolume(_id: string): Promise<void> {}
  async removeNetwork(_id: string): Promise<void> {}
  async pruneSystem(): Promise<any> {
    return {
      containersDeleted: 0,
      imagesDeleted: 0,
      volumesDeleted: 0,
      networksDeleted: 0,
      spaceReclaimed: 0
    };
  }
}

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
  size: fc.nat({ max: 5000000000 }), // Up to 5GB
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
  size: fc.nat({ max: 2000000000 }), // Up to 2GB
  createdAt: fc.date(),
  tags: fc.array(fc.string()),
  mountPoint: fc.string({ minLength: 1 }),
  usedByContainers: fc.array(fc.string())
});

const networkArbitrary = fc.record({
  id: fc.string({ minLength: 1 }),
  name: fc.string({ minLength: 1 }),
  type: fc.constant('network' as const),
  size: fc.constant(0), // Networks always have 0 size
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
  let mockClient: MockDockerClient;
  let sizeCalculator: SizeCalculator;

  beforeEach(async () => {
    mockClient = new MockDockerClient();
    await mockClient.connect();
    sizeCalculator = new SizeCalculator(mockClient);
  });

  describe('Property 4: Size Calculation Accuracy', () => {
    // Feature: proxmox-cleanup, Property 4: Size Calculation Accuracy
    // Validates: Requirements 4.1, 4.2
    it('should calculate total size as sum of individual resource sizes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(resourceArbitrary, { minLength: 1, maxLength: 10 }),
          async (resources) => {
            // Calculate individual sizes
            const individualSizes = await Promise.all(
              resources.map(resource => sizeCalculator.calculateResourceSize(resource))
            );

            // Calculate total size
            const totalSize = await sizeCalculator.calculateTotalSize(resources);

            // Property: Total should equal sum of individual sizes
            const expectedTotal = individualSizes.reduce((sum: number, size: number) => sum + size, 0);
            expect(totalSize).toBe(expectedTotal);

            // Property: Total size should be non-negative
            expect(totalSize).toBeGreaterThanOrEqual(0);

            // Property: If all resources have zero size, total should be zero
            if (resources.every(r => r.size === 0)) {
              expect(totalSize).toBe(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain size consistency when updating resource sizes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(resourceArbitrary, { minLength: 1, maxLength: 5 }),
          async (resources) => {
            // Update resource sizes
            const updatedResources = await sizeCalculator.updateResourceSizes(resources);

            // Property: Same number of resources
            expect(updatedResources).toHaveLength(resources.length);

            // Property: All resources should have non-negative sizes
            updatedResources.forEach((resource: Resource) => {
              expect(resource.size).toBeGreaterThanOrEqual(0);
            });

            // Property: _Resource IDs and types should remain unchanged
            updatedResources.forEach((updated: Resource, index: number) => {
              expect(updated.id).toBe(resources[index].id);
              expect(updated.type).toBe(resources[index].type);
              expect(updated.name).toBe(resources[index].name);
            });

            // Property: Networks should always have zero size
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

    it('should sort resources correctly by size', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(resourceArbitrary, { minLength: 2, maxLength: 10 }),
          async (resources) => {
            // Sort resources by size
            const sortedResources = sizeCalculator.sortResourcesBySize(resources);

            // Property: Same number of resources
            expect(sortedResources).toHaveLength(resources.length);

            // Property: Should be sorted in descending order
            for (let i = 0; i < sortedResources.length - 1; i++) {
              expect(sortedResources[i].size).toBeGreaterThanOrEqual(sortedResources[i + 1].size);
            }

            // Property: All original resources should be present
            const originalIds = resources.map(r => r.id).sort();
            const sortedIds = sortedResources.map((r: Resource) => r.id).sort();
            expect(sortedIds).toEqual(originalIds);

            // Property: Largest resource should be first
            const maxSize = Math.max(...resources.map(r => r.size));
            expect(sortedResources[0].size).toBe(maxSize);

            // Property: Smallest resource should be last
            const minSize = Math.min(...resources.map(r => r.size));
            expect(sortedResources[sortedResources.length - 1].size).toBe(minSize);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 10: Disk Space Verification', () => {
    // Feature: proxmox-cleanup, Property 10: Disk Space Verification
    // Validates: Requirements 4.4
    it('should verify disk space calculations within tolerance', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            predictedSpace: fc.nat({ max: 10000000000 }), // Up to 10GB
            actualSpace: fc.nat({ max: 10000000000 }),
            tolerance: fc.integer({ min: 1, max: 10 }).map(x => x / 100) // 1% to 10%
          }),
          async (testData) => {
            const { predictedSpace, actualSpace, tolerance } = testData;

            // Test verification logic
            const isWithinTolerance = sizeCalculator.verifySpaceFreed(
              predictedSpace,
              actualSpace,
              tolerance
            );

            // Property: If predicted and actual are equal, should always be within tolerance
            if (predictedSpace === actualSpace) {
              expect(isWithinTolerance).toBe(true);
            }

            // Property: If predicted is zero, any non-negative actual should be valid
            if (predictedSpace === 0) {
              expect(isWithinTolerance).toBe(actualSpace >= 0);
            }

            // Property: If difference is within tolerance, should return true
            if (predictedSpace > 0) {
              const difference = Math.abs(predictedSpace - actualSpace);
              const percentageDifference = difference / predictedSpace;

              if (percentageDifference <= tolerance) {
                expect(isWithinTolerance).toBe(true);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge cases in space verification', async () => {
      // Test zero predicted space
      expect(sizeCalculator.verifySpaceFreed(0, 1000)).toBe(true);
      expect(sizeCalculator.verifySpaceFreed(0, 0)).toBe(true);

      // Test exact matches
      expect(sizeCalculator.verifySpaceFreed(1000, 1000)).toBe(true);

      // Test within 5% tolerance (default)
      expect(sizeCalculator.verifySpaceFreed(1000, 950)).toBe(true); // 5% difference
      expect(sizeCalculator.verifySpaceFreed(1000, 1050)).toBe(true); // 5% difference
      expect(sizeCalculator.verifySpaceFreed(1000, 900)).toBe(false); // 10% difference

      // Test custom tolerance
      expect(sizeCalculator.verifySpaceFreed(1000, 900, 0.1)).toBe(true); // 10% tolerance
      expect(sizeCalculator.verifySpaceFreed(1000, 800, 0.1)).toBe(false); // 20% difference
    });
  });

  describe('Size Formatting', () => {
    it('should format bytes correctly', () => {
      expect(SizeCalculator.formatBytes(0)).toBe('0 B');
      expect(SizeCalculator.formatBytes(1024)).toBe('1 KB');
      expect(SizeCalculator.formatBytes(1024 * 1024)).toBe('1 MB');
      expect(SizeCalculator.formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
      expect(SizeCalculator.formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1 TB');

      expect(SizeCalculator.formatBytes(1536)).toBe('1.5 KB'); // 1.5 KB
      expect(SizeCalculator.formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB'); // 2.5 MB
    });

    it('should handle formatting edge cases', () => {
      expect(SizeCalculator.formatBytes(-1)).toBe('0 B'); // Negative should be 0
      expect(SizeCalculator.formatBytes(0.5)).toBe('0.5 B'); // Fractional bytes
      expect(SizeCalculator.formatBytes(Number.MAX_SAFE_INTEGER)).toContain('B'); // Very large numbers
    });
  });

  describe('Individual _Resource Size Calculation', () => {
    it('should calculate container sizes correctly', async () => {
      const container: ContainerResource = {
        id: 'container1',
        name: 'test-container',
        type: 'container',
        size: 1000,
        createdAt: new Date(),
        tags: [],
        status: 'stopped',
        imageId: 'image1',
        volumes: []
      };

      const size = await sizeCalculator.calculateResourceSize(container);
      expect(size).toBeGreaterThanOrEqual(0);
    });

    it('should calculate network sizes as zero', async () => {
      const network: NetworkResource = {
        id: 'network1',
        name: 'test-network',
        type: 'network',
        size: 0,
        createdAt: new Date(),
        tags: [],
        driver: 'bridge',
        connectedContainers: []
      };

      const size = await sizeCalculator.calculateResourceSize(network);
      expect(size).toBe(0);
    });
  });
});
