import { CommandResult, NodeStatus } from '../types';

/**
 * Interface for Proxmox API client
 */
export interface IProxmoxClient {
  /**
   * Authenticate with Proxmox API
   */
  authenticate(): Promise<void>;

  /**
   * Execute a command on a Proxmox node
   */
  executeCommand(command: string): Promise<CommandResult>;

  /**
   * Get status of a Proxmox node
   */
  getNodeStatus(): Promise<NodeStatus>;
}
