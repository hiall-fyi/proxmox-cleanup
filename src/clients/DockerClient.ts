import Docker from 'dockerode';
import {
  ContainerResource,
  ImageResource,
  VolumeResource,
  NetworkResource,
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
   * List all containers (running and stopped).
   * Passes `size: true` so Docker populates SizeRw for each container.
   */
  async listContainers(all: boolean = true): Promise<ContainerResource[]> {
    return this.listResources('containers', async () => {
      const containers = await this.docker.listContainers({ all, size: true });

      return containers.map(container => ({
        id: container.Id,
        name: container.Names[0]?.replace(/^\//, '') || container.Id.substring(0, 12),
        type: 'container' as const,
        size: (container as Docker.ContainerInfo & { SizeRw?: number }).SizeRw || 0,
        createdAt: new Date(container.Created * 1000),
        tags: container.Labels ? Object.keys(container.Labels) : [],
        status: this.mapContainerStatus(container.State),
        imageId: container.ImageID,
        // Only named volumes — bind mounts report Name === '' and would
        // otherwise leak host paths into what callers treat as volume names.
        volumes: container.Mounts
          ?.filter(m => m.Type === 'volume' && m.Name)
          .map(m => m.Name as string) || []
      }));
    });
  }

  /**
   * List all images
   */
  async listImages(): Promise<ImageResource[]> {
    return this.listResources('images', async () => {
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
    });
  }

  /**
   * List all volumes
   */
  async listVolumes(): Promise<VolumeResource[]> {
    return this.listResources('volumes', async () => {
      const result = await this.docker.listVolumes();
      const volumes = result.Volumes || [];

      return volumes.map(volume => {
        const rawCreated = (volume as Docker.VolumeInspectInfo & { CreatedAt?: string }).CreatedAt;
        return {
          id: volume.Name,
          name: volume.Name,
          type: 'volume' as const,
          size: 0, // Docker API doesn't provide volume size directly
          createdAt: rawCreated ? new Date(rawCreated) : undefined,
          tags: volume.Labels ? Object.keys(volume.Labels) : [],
          mountPoint: volume.Mountpoint,
          usedByContainers: [] // Will be populated by scanner
        };
      });
    });
  }

  /**
   * List all networks
   */
  async listNetworks(): Promise<NetworkResource[]> {
    return this.listResources('networks', async () => {
      const networks = await this.docker.listNetworks();

      return networks.map(network => ({
        id: network.Id,
        name: network.Name,
        type: 'network' as const,
        size: 0, // Networks don't have size
        createdAt: network.Created ? new Date(network.Created) : undefined,
        tags: network.Labels ? Object.keys(network.Labels) : [],
        driver: network.Driver,
        connectedContainers: Object.keys(network.Containers || {})
      }));
    });
  }

  /**
   * Remove a container by ID
   */
  async removeContainer(id: string): Promise<void> {
    return this.removeResource('Container', id, () =>
      this.docker.getContainer(id).remove({ force: true })
    );
  }

  /**
   * Remove an image by ID
   */
  async removeImage(id: string): Promise<void> {
    return this.removeResource('Image', id, () =>
      this.docker.getImage(id).remove({ force: true })
    );
  }

  /**
   * Remove a volume by name
   */
  async removeVolume(name: string): Promise<void> {
    return this.removeResource('Volume', name, () =>
      this.docker.getVolume(name).remove()
    );
  }

  /**
   * Remove a network by ID
   */
  async removeNetwork(id: string): Promise<void> {
    return this.removeResource('Network', id, () =>
      this.docker.getNetwork(id).remove()
    );
  }

  /**
   * Run a list operation behind the shared connected-guard + error wrapper.
   */
  private async listResources<T>(label: string, fetch: () => Promise<T>): Promise<T> {
    this.ensureConnected();
    try {
      return await fetch();
    } catch (error) {
      const cleanupError = this.createError('unknown', `Failed to list ${label}`, error);
      throw new Error(cleanupError.message);
    }
  }

  /**
   * Run a remove operation behind the shared connected-guard, mapping the
   * Docker daemon's 404 (not found) and 409 (in use) status codes to typed
   * cleanup errors.
   */
  private async removeResource(kind: string, id: string, remove: () => Promise<unknown>): Promise<void> {
    this.ensureConnected();
    try {
      await remove();
    } catch (error: unknown) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404) {
        const cleanupError = this.createError('resource_not_found', `${kind} ${id} not found`, error);
        throw new Error(cleanupError.message);
      }
      if (statusCode === 409) {
        const cleanupError = this.createError('resource_in_use', `${kind} ${id} is in use`, error);
        throw new Error(cleanupError.message);
      }
      const cleanupError = this.createError('unknown', `Failed to remove ${kind.toLowerCase()} ${id}`, error);
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
  private createError(type: CleanupError['type'], message: string, originalError?: unknown): CleanupError {
    const errorMessage = originalError instanceof Error ? originalError.message : 'Unknown error';
    return {
      type,
      message: `${message}: ${errorMessage}`,
      timestamp: new Date(),
      recoverable: type === 'network' || type === 'resource_not_found'
    };
  }
}
