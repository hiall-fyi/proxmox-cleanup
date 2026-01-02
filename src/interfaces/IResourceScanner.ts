import {
  ContainerResource,
  ImageResource,
  VolumeResource,
  NetworkResource,
  Resource
} from '../types';

/**
 * Interface for resource scanning operations
 */
export interface IResourceScanner {
  /**
   * Scan for unused containers
   */
  scanContainers(): Promise<ContainerResource[]>;

  /**
   * Scan for unused images
   */
  scanImages(): Promise<ImageResource[]>;

  /**
   * Scan for unused volumes
   */
  scanVolumes(): Promise<VolumeResource[]>;

  /**
   * Scan for unused networks
   */
  scanNetworks(): Promise<NetworkResource[]>;

  /**
   * Check if a resource is currently in use
   */
  isResourceInUse(resource: Resource): Promise<boolean>;

  /**
   * Perform cleanup operation with dry-run support
   */
  performCleanup(resources: Resource[]): Promise<{ removed: Resource[], skipped: Resource[], errors: any[] }>;

  /**
   * Get dry-run status
   */
  isDryRun(): boolean;

  /**
   * Set dry-run mode
   */
  setDryRun(dryRun: boolean): void;

  /**
   * Calculate accurate sizes for resources
   */
  calculateResourceSizes(resources: Resource[]): Promise<Resource[]>;

  /**
   * Calculate total size of resources
   */
  calculateTotalSize(resources: Resource[]): Promise<number>;

  /**
   * Sort resources by size in descending order
   */
  sortResourcesBySize(resources: Resource[]): Resource[];

  /**
   * Get disk space before cleanup
   */
  getDiskSpaceBefore(): Promise<number>;

  /**
   * Get disk space after cleanup
   */
  getDiskSpaceAfter(): Promise<number>;

  /**
   * Verify predicted vs actual disk space freed
   */
  verifySpaceFreed(predicted: number, actual: number): boolean;
}
