/**
 * Interface for Proxmox API client
 */
export interface IProxmoxClient {
  /**
   * Authenticate with Proxmox API
   */
  authenticate(): Promise<void>;

  /**
   * Check whether the client has authenticated
   */
  isAuthenticated(): boolean;
}
