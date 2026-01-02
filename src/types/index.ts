/**
 * Core type definitions for Proxmox Cleanup System
 */

// Resource Types
export type ResourceType = 'container' | 'image' | 'volume' | 'network' | 'cache';

export interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  size: number;
  createdAt: Date;
  lastUsed?: Date;
  tags: string[];
}

export interface ContainerResource extends Resource {
  type: 'container';
  status: 'running' | 'stopped' | 'exited';
  imageId: string;
  volumes: string[];
}

export interface ImageResource extends Resource {
  type: 'image';
  repository: string;
  tag: string;
  usedByContainers: string[];
}

export interface VolumeResource extends Resource {
  type: 'volume';
  mountPoint: string;
  usedByContainers: string[];
}

export interface NetworkResource extends Resource {
  type: 'network';
  driver: string;
  connectedContainers: string[];
}

// Configuration Types
export interface ProxmoxConfig {
  host: string;
  token: string;
  nodeId: string;
}

export interface CleanupOptions {
  dryRun: boolean;
  resourceTypes: ResourceType[];
  protectedPatterns: string[];
  backupEnabled: boolean;
  backupPath: string;
}

export interface ReportingOptions {
  verbose: boolean;
  logPath: string;
}

export interface SchedulingOptions {
  enabled: boolean;
  cron: string;
  notificationEmail?: string;
}

export interface CleanupConfig {
  proxmox: ProxmoxConfig;
  cleanup: CleanupOptions;
  reporting: ReportingOptions;
  scheduling?: ScheduleConfig;
  notifications?: NotificationConfig;
}

// Result Types
export interface ResourceScanResult {
  containers: ContainerResource[];
  images: ImageResource[];
  volumes: VolumeResource[];
  networks: NetworkResource[];
  totalSize: number;
}

export interface CleanupError {
  type: ErrorType;
  resource?: Resource;
  message: string;
  timestamp: Date;
  recoverable: boolean;
}

export type ErrorType =
  | 'authentication'
  | 'network'
  | 'permission'
  | 'resource_in_use'
  | 'resource_not_found'
  | 'filesystem'
  | 'unknown';

export interface CleanupResult {
  removed: Resource[];
  skipped: Resource[];
  errors: CleanupError[];
  diskSpaceFreed: number;
  executionTime: number;
}

// Backup Types
export interface Backup {
  timestamp: Date;
  resources: Resource[];
  metadata: {
    proxmoxHost: string;
    totalSize: number;
    resourceCount: number;
  };
}

export interface BackupResult {
  success: boolean;
  backupPath: string;
  error?: string;
}

// Report Types
export interface Report {
  timestamp: Date;
  mode: 'dry-run' | 'cleanup';
  summary: {
    resourcesScanned: number;
    resourcesRemoved: number;
    diskSpaceFreed: number;
    executionTime: number;
  };
  details: {
    removed: Resource[];
    skipped: Resource[];
    errors: CleanupError[];
  };
}

// API Types
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface NodeStatus {
  status: string;
  uptime: number;
  cpu: number;
  memory: {
    used: number;
    total: number;
  };
}

export interface PruneResult {
  containersDeleted: number;
  imagesDeleted: number;
  volumesDeleted: number;
  networksDeleted: number;
  spaceReclaimed: number;
}
// Scheduling Types
export interface ScheduleConfig {
  enabled: boolean;
  cronExpression: string;
  dryRun: boolean;
  timezone?: string;
  maxRetries?: number;
  retryDelay?: number;
}

// Notification Types
export interface NotificationConfig {
  enabled: boolean;
  onSuccess: boolean;
  onFailure: boolean;
  onStart: boolean;
  webhookUrl?: string;
  emailRecipients?: string[];
  slackChannel?: string;
}
