import {
  ContainerResource,
  ImageResource,
  VolumeResource,
  NetworkResource,
  Resource
} from '../types';
import { IResourceScanner } from '../interfaces';
import { IDockerClient } from '../interfaces';
import { ResourceFilter } from '../utils';
import { SizeCalculator } from '../utils/SizeCalculator';

/**
 * Resource scanner implementation
 * Identifies unused Docker resources
 */
export class ResourceScanner implements IResourceScanner {
  private dockerClient: IDockerClient;
  private allContainers: ContainerResource[] = [];
  private resourceFilter: ResourceFilter;
  private dryRun: boolean;
  private sizeCalculator: SizeCalculator;

  constructor(dockerClient: IDockerClient, protectedPatterns: string[] = [], dryRun: boolean = false) {
    this.dockerClient = dockerClient;
    this.resourceFilter = new ResourceFilter(protectedPatterns);
    this.dryRun = dryRun;
    this.sizeCalculator = new SizeCalculator(dockerClient);
  }

  /**
   * Scan for unused containers
   * A container is unused if it's stopped/exited with no restart policy
   */
  async scanContainers(): Promise<ContainerResource[]> {
    // Get all containers (including stopped ones)
    this.allContainers = await this.dockerClient.listContainers(true);

    // Filter for unused containers
    // Unused = stopped or exited (not running)
    const unusedContainers = this.allContainers.filter(container => {
      return container.status === 'stopped' || container.status === 'exited';
    });

    // Filter out protected resources
    return this.resourceFilter.filterProtected(unusedContainers);
  }

  /**
   * Scan for unused images
   * An image is unused if it's not used by any container
   */
  async scanImages(): Promise<ImageResource[]> {
    // Ensure we have container data
    if (this.allContainers.length === 0) {
      this.allContainers = await this.dockerClient.listContainers(true);
    }

    // Get all images
    const allImages = await this.dockerClient.listImages();

    // Build set of image IDs used by containers
    const usedImageIds = new Set(
      this.allContainers.map(container => container.imageId)
    );

    // Filter for unused images
    const _unusedImages = allImages.filter(image => {
      return !usedImageIds.has(image.id);
    });

    // Populate usedByContainers for all images
    const imagesWithUsage = allImages.map(image => ({
      ...image,
      usedByContainers: this.allContainers
        .filter(c => c.imageId === image.id)
        .map(c => c.id)
    })).filter(image => image.usedByContainers.length === 0);

    // Filter out protected resources
    return this.resourceFilter.filterProtected(imagesWithUsage);
  }

  /**
   * Scan for unused volumes
   * A volume is unused if it's not mounted by any container
   */
  async scanVolumes(): Promise<VolumeResource[]> {
    // Ensure we have container data
    if (this.allContainers.length === 0) {
      this.allContainers = await this.dockerClient.listContainers(true);
    }

    // Get all volumes
    const allVolumes = await this.dockerClient.listVolumes();

    // Build set of volume names used by containers
    const usedVolumeNames = new Set<string>();
    this.allContainers.forEach(container => {
      container.volumes.forEach(volumeName => {
        if (volumeName) {
          usedVolumeNames.add(volumeName);
        }
      });
    });

    // Filter for unused volumes
    const _unusedVolumes = allVolumes.filter(volume => {
      return !usedVolumeNames.has(volume.name);
    });

    // Populate usedByContainers for all volumes
    const volumesWithUsage = allVolumes.map(volume => ({
      ...volume,
      usedByContainers: this.allContainers
        .filter(c => c.volumes.includes(volume.name))
        .map(c => c.id)
    })).filter(volume => volume.usedByContainers.length === 0);

    // Filter out protected resources
    return this.resourceFilter.filterProtected(volumesWithUsage);
  }

  /**
   * Scan for unused networks
   * A network is unused if it has no connected containers
   * Excludes default networks (bridge, host, none)
   */
  async scanNetworks(): Promise<NetworkResource[]> {
    // Get all networks
    const allNetworks = await this.dockerClient.listNetworks();

    // Default networks that should never be removed
    const defaultNetworks = new Set(['bridge', 'host', 'none']);

    // Filter for unused networks (excluding defaults)
    const unusedNetworks = allNetworks.filter(network => {
      const isDefault = defaultNetworks.has(network.name);
      const hasNoContainers = network.connectedContainers.length === 0;
      return !isDefault && hasNoContainers;
    });

    // Filter out protected resources
    return this.resourceFilter.filterProtected(unusedNetworks);
  }

  /**
   * Check if a resource is currently in use
   * This is a comprehensive check across all resource types
   * Handles stopped containers with restart policies
   */
  async isResourceInUse(resource: Resource): Promise<boolean> {
    // Ensure we have fresh container data
    this.allContainers = await this.dockerClient.listContainers(true);

    switch (resource.type) {
    case 'container': {
      // A container is in use if it's running
      const container = resource as ContainerResource;
      return container.status === 'running';
    }
    case 'image': {
      // An image is in use if any container (running or stopped) uses it
      // We consider stopped containers because they might be restarted
      const image = resource as ImageResource;
      return this.allContainers.some(c => c.imageId === image.id);
    }
    case 'volume': {
      // A volume is in use if any container (running or stopped) mounts it
      // We consider stopped containers because they might be restarted
      const volume = resource as VolumeResource;
      return this.allContainers.some(c => c.volumes.includes(volume.name));
    }
    case 'network': {
      // A network is in use if it has connected containers
      const network = resource as NetworkResource;
      return network.connectedContainers.length > 0;
    }
    default:
      return false;
    }
  }

  /**
   * Perform cleanup operation with dry-run support
   * In dry-run mode, no actual removal occurs
   */
  async performCleanup(resources: Resource[]): Promise<{ removed: Resource[], skipped: Resource[], errors: any[] }> {
    const removed: Resource[] = [];
    const skipped: Resource[] = [];
    const errors: any[] = [];

    for (const resource of resources) {
      try {
        // Check if resource is still in use (safety check)
        const inUse = await this.isResourceInUse(resource);
        if (inUse) {
          skipped.push(resource);
          continue;
        }

        // In dry-run mode, just simulate the removal
        if (this.dryRun) {
          removed.push(resource);
          continue;
        }

        // Perform actual removal based on resource type
        switch (resource.type) {
        case 'container':
          await this.dockerClient.removeContainer(resource.id);
          removed.push(resource);
          break;
        case 'image':
          await this.dockerClient.removeImage(resource.id);
          removed.push(resource);
          break;
        case 'volume':
          await this.dockerClient.removeVolume(resource.id);
          removed.push(resource);
          break;
        case 'network':
          await this.dockerClient.removeNetwork(resource.id);
          removed.push(resource);
          break;
        default:
          skipped.push(resource);
        }
      } catch (error) {
        errors.push({
          resource,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return { removed, skipped, errors };
  }

  /**
   * Get dry-run status
   */
  isDryRun(): boolean {
    return this.dryRun;
  }

  /**
   * Set dry-run mode
   */
  setDryRun(dryRun: boolean): void {
    this.dryRun = dryRun;
  }

  /**
   * Calculate accurate sizes for resources
   */
  async calculateResourceSizes(resources: Resource[]): Promise<Resource[]> {
    return this.sizeCalculator.updateResourceSizes(resources);
  }

  /**
   * Calculate total size of resources
   */
  async calculateTotalSize(resources: Resource[]): Promise<number> {
    return this.sizeCalculator.calculateTotalSize(resources);
  }

  /**
   * Sort resources by size in descending order
   */
  sortResourcesBySize(resources: Resource[]): Resource[] {
    return this.sizeCalculator.sortResourcesBySize(resources);
  }

  /**
   * Get disk space before cleanup
   */
  async getDiskSpaceBefore(): Promise<number> {
    return this.sizeCalculator.getDiskSpaceBefore();
  }

  /**
   * Get disk space after cleanup
   */
  async getDiskSpaceAfter(): Promise<number> {
    return this.sizeCalculator.getDiskSpaceAfter();
  }

  /**
   * Verify predicted vs actual disk space freed
   */
  verifySpaceFreed(predicted: number, actual: number): boolean {
    return this.sizeCalculator.verifySpaceFreed(predicted, actual);
  }

  /**
   * Format bytes to human readable string
   */
  static formatBytes(bytes: number): string {
    return SizeCalculator.formatBytes(bytes);
  }
}
