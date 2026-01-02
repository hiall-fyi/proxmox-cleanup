import {
  ContainerResource,
  ImageResource,
  VolumeResource,
  NetworkResource,
  PruneResult
} from '../types';

/**
 * Interface for Docker API client
 */
export interface IDockerClient {
  /**
   * Connect to Docker daemon
   */
  connect(): Promise<void>;

  /**
   * Check if connected to Docker daemon
   */
  isConnected(): boolean;

  /**
   * List all containers (running and stopped)
   */
  listContainers(all: boolean): Promise<ContainerResource[]>;

  /**
   * List all images
   */
  listImages(): Promise<ImageResource[]>;

  /**
   * List all volumes
   */
  listVolumes(): Promise<VolumeResource[]>;

  /**
   * List all networks
   */
  listNetworks(): Promise<NetworkResource[]>;

  /**
   * Remove a container by ID
   */
  removeContainer(id: string): Promise<void>;

  /**
   * Remove an image by ID
   */
  removeImage(id: string): Promise<void>;

  /**
   * Remove a volume by name
   */
  removeVolume(name: string): Promise<void>;

  /**
   * Remove a network by ID
   */
  removeNetwork(id: string): Promise<void>;

  /**
   * Prune unused Docker resources
   */
  pruneSystem(): Promise<PruneResult>;
}
