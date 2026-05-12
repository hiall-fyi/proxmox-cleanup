import {
  ContainerResource,
  ImageResource,
  VolumeResource,
  NetworkResource,
  Resource,
  CleanupErrorDetail
} from '../types';
import { IResourceScanner } from '../interfaces';
import { IDockerClient } from '../interfaces';
import { ResourceFilter } from '../utils/ResourceFilter';
import { SizeCalculator } from '../utils/SizeCalculator';

/**
 * Resource scanner implementation
 * Identifies unused Docker resources
 */
export class ResourceScanner implements IResourceScanner {
  private dockerClient: IDockerClient;
  private resourceFilter: ResourceFilter;
  private dryRun: boolean;

  constructor(dockerClient: IDockerClient, protectedPatterns: string[] = [], dryRun: boolean = false) {
    this.dockerClient = dockerClient;
    this.resourceFilter = new ResourceFilter(protectedPatterns);
    this.dryRun = dryRun;
  }

  /**
   * Scan for unused containers (stopped or exited) that aren't protected.
   */
  async scanContainers(): Promise<ContainerResource[]> {
    const containers = await this.dockerClient.listContainers(true);
    const unused = containers.filter(c => c.status !== 'running');
    return this.resourceFilter.filterProtected(unused);
  }

  /**
   * Scan for unused images (not referenced by any container, running or stopped).
   */
  async scanImages(): Promise<ImageResource[]> {
    const [containers, images] = await Promise.all([
      this.dockerClient.listContainers(true),
      this.dockerClient.listImages()
    ]);

    const imagesWithUsage = images
      .map(image => ({
        ...image,
        usedByContainers: containers
          .filter(c => c.imageId === image.id)
          .map(c => c.id)
      }))
      .filter(image => image.usedByContainers.length === 0);

    return this.resourceFilter.filterProtected(imagesWithUsage);
  }

  /**
   * Scan for unused volumes (not mounted by any container, running or stopped).
   */
  async scanVolumes(): Promise<VolumeResource[]> {
    const [containers, volumes] = await Promise.all([
      this.dockerClient.listContainers(true),
      this.dockerClient.listVolumes()
    ]);

    const mountedNames = new Set<string>();
    for (const container of containers) {
      for (const name of container.volumes) {
        if (name) mountedNames.add(name);
      }
    }

    const volumesWithUsage = volumes
      .map(volume => ({
        ...volume,
        usedByContainers: containers
          .filter(c => c.volumes.includes(volume.name))
          .map(c => c.id)
      }))
      .filter(volume => !mountedNames.has(volume.name));

    return this.resourceFilter.filterProtected(volumesWithUsage);
  }

  /**
   * Scan for unused networks — no connected containers, excluding Docker's
   * built-in `bridge`, `host`, and `none` networks.
   */
  async scanNetworks(): Promise<NetworkResource[]> {
    const allNetworks = await this.dockerClient.listNetworks();
    const defaultNetworks = new Set(['bridge', 'host', 'none']);

    const unusedNetworks = allNetworks.filter(network => {
      return !defaultNetworks.has(network.name) && network.connectedContainers.length === 0;
    });

    return this.resourceFilter.filterProtected(unusedNetworks);
  }

  /**
   * Check if a resource is still in use. Fetches the current container list
   * once and caches it on the instance for the duration of a single
   * `performCleanup` call.
   */
  async isResourceInUse(resource: Resource, containers?: ContainerResource[]): Promise<boolean> {
    const liveContainers = containers ?? await this.dockerClient.listContainers(true);

    switch (resource.type) {
    case 'container': {
      const container = resource as ContainerResource;
      return container.status === 'running';
    }
    case 'image': {
      const image = resource as ImageResource;
      return liveContainers.some(c => c.imageId === image.id);
    }
    case 'volume': {
      const volume = resource as VolumeResource;
      return liveContainers.some(c => c.volumes.includes(volume.name));
    }
    case 'network': {
      const network = resource as NetworkResource;
      return network.connectedContainers.length > 0;
    }
    default:
      return false;
    }
  }

  /**
   * Perform cleanup operation with dry-run support.
   * Fetches the container list once up-front and reuses it for every
   * `isResourceInUse` check instead of re-listing per resource.
   */
  async performCleanup(resources: Resource[]): Promise<{ removed: Resource[]; skipped: Resource[]; errors: CleanupErrorDetail[] }> {
    const removed: Resource[] = [];
    const skipped: Resource[] = [];
    const errors: CleanupErrorDetail[] = [];

    const containers = await this.dockerClient.listContainers(true);

    for (const resource of resources) {
      try {
        if (await this.isResourceInUse(resource, containers)) {
          skipped.push(resource);
          continue;
        }

        if (this.dryRun) {
          removed.push(resource);
          continue;
        }

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

  isDryRun(): boolean {
    return this.dryRun;
  }

  setDryRun(dryRun: boolean): void {
    this.dryRun = dryRun;
  }

  /**
   * Resources already carry sizes populated by the Docker API; pass through.
   */
  calculateResourceSizes(resources: Resource[]): Resource[] {
    return new SizeCalculator().updateResourceSizes(resources);
  }

  calculateTotalSize(resources: Resource[]): number {
    return new SizeCalculator().calculateTotalSize(resources);
  }

  sortResourcesBySize(resources: Resource[]): Resource[] {
    return new SizeCalculator().sortResourcesBySize(resources);
  }
}
