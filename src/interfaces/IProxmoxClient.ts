import { CommandResult, NodeStatus } from '../types';

/**
 * Interface for Proxmox API client
 */
export interface IProxmoxClient {
  /**
   * Authenticate with Proxmox API using token
   */
  authenticate(token: string): Promise<void>;

  /**
   * Execute a command on a Proxmox node
   */
  executeCommand(nodeId: string, command: string): Promise<CommandResult>;

  /**
   * Get status of a Proxmox node
   */
  getNodeStatus(nodeId: string): Promise<NodeStatus>;
}
