import Docker from 'dockerode';
import {
  ContainerResource,
  ImageResource,
  VolumeResource,
  NetworkResource,
  PruneResult,
  CleanupError
} from '../types';
import { IDockerClient } from '../interfaces';

/**
 * Docker API client implementation
 */
export class DockerClient implements IDockerClient {
  private docker: Docker;
  private connected: boolean = false;

  constructor(socketPath?: string) {
    // Default to Unix socket, can be overridden for remote connections
    this.docker = new Docker({
      socketPath: socketPath || '/var/run/docker.sock'
    });
  }

  /**
   * Test connection to Docker daemon
   */
  async connect(): Promise<void> {
    try {
      await this.docker.ping();
      this.connected = true;
    } catch (error) {
      this.connected = false;
      const cleanupError = this.createError('network', 'Failed to connect to Docker daemon', error);
      throw new Error(cleanupError.message);
    }
  }

  /**
   * Check if connected to Docker daemon
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * List all containers (running and stopped)
   */
  async listContainers(all: boolean = true): Promise<ContainerResource[]> {
    this.ensureConnected();

    try {
      const containers = await this.docker.listContainers({ all });

      return containers.map(container => ({
        id: container.Id,
        name: container.Names[0]?.replace(/^\//, '') || container.Id.substring(0, 12),
        type: 'container' as const,
        size: (container as any).SizeRw || 0,
        createdAt: new Date(container.Created * 1000),
        tags: container.Labels ? Object.keys(container.Labels) : [],
        status: this.mapContainerStatus(container.State),
        imageId: container.ImageID,
        volumes: container.Mounts?.map(m => m.Name || m.Source) || []
      }));
    } catch (error) {
      const cleanupError = this.createError('unknown', 'Failed to list containers', error);
      throw new Error(cleanupError.message);
    }
  }

  /**
   * List all images
   */
  async listImages(): Promise<ImageResource[]> {
    this.ensureConnected();

    try {
      const images = await this.docker.listImages({ all: true });

      return images.map(image => {
        const repoTag = image.RepoTags?.[0] || '<none>:<none>';
        const [repository, tag] = repoTag.split(':');

        return {
          id: image.Id,
          name: repoTag,
          type: 'image' as const,
          size: image.Size || 0,
          createdAt: new Date(image.Created * 1000),
          tags: image.Labels ? Object.keys(image.Labels) : [],
          repository,
          tag,
          usedByContainers: [] // Will be populated by scanner
        };
      });
    } catch (error) {
      const cleanupError = this.createError('unknown', 'Failed to list images', error);
      throw new Error(cleanupError.message);
    }
  }

  /**
   * List all volumes
   */
  async listVolumes(): Promise<VolumeResource[]> {
    this.ensureConnected();

    try {
      const result = await this.docker.listVolumes();
      const volumes = result.Volumes || [];

      return volumes.map(volume => ({
        id: volume.Name,
        name: volume.Name,
        type: 'volume' as const,
        size: 0, // Docker API doesn't provide volume size directly
        createdAt: new Date((volume as any).CreatedAt || Date.now()),
        tags: volume.Labels ? Object.keys(volume.Labels) : [],
        mountPoint: volume.Mountpoint,
        usedByContainers: [] // Will be populated by scanner
      }));
    } catch (error) {
      const cleanupError = this.createError('unknown', 'Failed to list volumes', error);
      throw new Error(cleanupError.message);
    }
  }

  /**
   * List all networks
   */
  async listNetworks(): Promise<NetworkResource[]> {
    this.ensureConnected();

    try {
      const networks = await this.docker.listNetworks();

      return networks.map(network => ({
        id: network.Id,
        name: network.Name,
        type: 'network' as const,
        size: 0, // Networks don't have size
        createdAt: new Date(network.Created || Date.now()),
        tags: network.Labels ? Object.keys(network.Labels) : [],
        driver: network.Driver,
        connectedContainers: Object.keys(network.Containers || {})
      }));
    } catch (error) {
      const cleanupError = this.createError('unknown', 'Failed to list networks', error);
      throw new Error(cleanupError.message);
    }
  }

  /**
   * Remove a container by ID
   */
  async removeContainer(id: string): Promise<void> {
    this.ensureConnected();

    try {
      const container = this.docker.getContainer(id);
      await container.remove({ force: true });
    } catch (error: any) {
      if (error.statusCode === 404) {
        const cleanupError = this.createError('resource_not_found', `Container ${id} not found`, error);
        throw new Error(cleanupError.message);
      }
      const cleanupError = this.createError('unknown', `Failed to remove container ${id}`, error);
      throw new Error(cleanupError.message);
    }
  }

  /**
   * Remove an image by ID
   */
  async removeImage(id: string): Promise<void> {
    this.ensureConnected();

    try {
      const image = this.docker.getImage(id);
      await image.remove({ force: true });
    } catch (error: any) {
      if (error.statusCode === 404) {
        const cleanupError = this.createError('resource_not_found', `Image ${id} not found`, error);
        throw new Error(cleanupError.message);
      }
      if (error.statusCode === 409) {
        const cleanupError = this.createError('resource_in_use', `Image ${id} is in use`, error);
        throw new Error(cleanupError.message);
      }
      const cleanupError = this.createError('unknown', `Failed to remove image ${id}`, error);
      throw new Error(cleanupError.message);
    }
  }

  /**
   * Remove a volume by name
   */
  async removeVolume(name: string): Promise<void> {
    this.ensureConnected();

    try {
      const volume = this.docker.getVolume(name);
      await volume.remove();
    } catch (error: any) {
      if (error.statusCode === 404) {
        const cleanupError = this.createError('resource_not_found', `Volume ${name} not found`, error);
        throw new Error(cleanupError.message);
      }
      if (error.statusCode === 409) {
        const cleanupError = this.createError('resource_in_use', `Volume ${name} is in use`, error);
        throw new Error(cleanupError.message);
      }
      const cleanupError = this.createError('unknown', `Failed to remove volume ${name}`, error);
      throw new Error(cleanupError.message);
    }
  }

  /**
   * Remove a network by ID
   */
  async removeNetwork(id: string): Promise<void> {
    this.ensureConnected();

    try {
      const network = this.docker.getNetwork(id);
      await network.remove();
    } catch (error: any) {
      if (error.statusCode === 404) {
        const cleanupError = this.createError('resource_not_found', `Network ${id} not found`, error);
        throw new Error(cleanupError.message);
      }
      if (error.statusCode === 409) {
        const cleanupError = this.createError('resource_in_use', `Network ${id} is in use`, error);
        throw new Error(cleanupError.message);
      }
      const cleanupError = this.createError('unknown', `Failed to remove network ${id}`, error);
      throw new Error(cleanupError.message);
    }
  }

  /**
   * Prune unused Docker resources
   */
  async pruneSystem(): Promise<PruneResult> {
    this.ensureConnected();

    try {
      const [containers, images, volumes, networks] = await Promise.all([
        this.docker.pruneContainers(),
        this.docker.pruneImages(),
        this.docker.pruneVolumes(),
        this.docker.pruneNetworks()
      ]);

      return {
        containersDeleted: containers.ContainersDeleted?.length || 0,
        imagesDeleted: images.ImagesDeleted?.length || 0,
        volumesDeleted: volumes.VolumesDeleted?.length || 0,
        networksDeleted: networks.NetworksDeleted?.length || 0,
        spaceReclaimed: (containers.SpaceReclaimed || 0) + (images.SpaceReclaimed || 0)
      };
    } catch (error) {
      const cleanupError = this.createError('unknown', 'Failed to prune system', error);
      throw new Error(cleanupError.message);
    }
  }

  /**
   * Map Docker container state to our status type
   */
  private mapContainerStatus(state: string): 'running' | 'stopped' | 'exited' {
    switch (state.toLowerCase()) {
    case 'running':
      return 'running';
    case 'exited':
      return 'exited';
    default:
      return 'stopped';
    }
  }

  /**
   * Ensure client is connected before operations
   */
  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Docker client is not connected. Call connect() first.');
    }
  }

  /**
   * Create a standardized error object
   */
  private createError(type: CleanupError['type'], message: string, originalError?: any): CleanupError {
    return {
      type,
      message: `${message}: ${originalError?.message || 'Unknown error'}`,
      timestamp: new Date(),
      recoverable: type === 'network' || type === 'resource_not_found'
    };
  }
}
