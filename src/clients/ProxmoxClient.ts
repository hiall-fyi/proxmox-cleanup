import { ProxmoxConfig, CommandResult, NodeStatus, CleanupError } from '../types';
import { IProxmoxClient } from '../interfaces';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import https from 'https';

/**
 * Proxmox API client implementation
 */
export class ProxmoxClient implements IProxmoxClient {
  private config: ProxmoxConfig;
  private apiClient!: AxiosInstance;
  private authenticated: boolean = false;
  private ticket?: string;
  private csrfToken?: string;

  constructor(config: ProxmoxConfig) {
    this.config = config;
    this.validateToken(config.token);
    this.setupApiClient();
  }

  /**
   * Validate token format
   */
  private validateToken(token: string): void {
    if (!token.includes(':')) {
      throw new Error('Invalid token format');
    }
  }

  /**
   * Authenticate with Proxmox API
   */
  async authenticate(): Promise<void> {
    try {
      const response = await this.apiClient.post('/access/ticket', {
        username: this.extractUsername(this.config.token),
        password: this.extractPassword(this.config.token)
      });

      if (response.data?.data) {
        this.ticket = response.data.data.ticket;
        this.csrfToken = response.data.data.CSRFPreventionToken;

        // Update default headers for authenticated requests
        this.apiClient.defaults.headers.common['Cookie'] = `PVEAuthCookie=${this.ticket}`;
        this.apiClient.defaults.headers.common['CSRFPreventionToken'] = this.csrfToken;

        this.authenticated = true;
      } else {
        throw new Error('Invalid authentication response');
      }
    } catch (error) {
      this.authenticated = false;
      const cleanupError = this.createError('authentication', 'Failed to authenticate with Proxmox API', error);
      throw new Error(cleanupError.message);
    }
  }

  /**
   * Check if client is authenticated
   */
  isAuthenticated(): boolean {
    return this.authenticated;
  }

  /**
   * Execute command on Proxmox node
   */
  async executeCommand(command: string): Promise<CommandResult> {
    this.ensureAuthenticated();

    try {
      const response = await this.retryApiCall(async () => {
        return this.apiClient.post(`/nodes/${this.config.nodeId}/execute`, {
          command
        });
      });

      return {
        stdout: response.data?.data?.stdout || '',
        stderr: response.data?.data?.stderr || '',
        exitCode: response.data?.data?.exitstatus || 0
      };
    } catch (error) {
      const cleanupError = this.createError('unknown', `Failed to execute command: ${command}`, error);
      throw new Error(cleanupError.message);
    }
  }

  /**
   * Get node status
   */
  async getNodeStatus(): Promise<NodeStatus> {
    this.ensureAuthenticated();

    try {
      const response = await this.retryApiCall(async () => {
        return this.apiClient.get(`/nodes/${this.config.nodeId}/status`);
      });

      const data = response.data?.data;
      if (!data) {
        throw new Error('Invalid node status response');
      }

      return {
        status: data.status || 'unknown',
        uptime: data.uptime || 0,
        cpu: data.cpu || 0,
        memory: {
          used: data.memory?.used || 0,
          total: data.memory?.total || 0
        }
      };
    } catch (error) {
      const cleanupError = this.createError('network', 'Failed to get node status', error);
      throw new Error(cleanupError.message);
    }
  }

  /**
   * Execute Docker cleanup command on Proxmox node
   */
  async executeDockerCleanup(dryRun: boolean = false): Promise<CommandResult> {
    const command = dryRun
      ? 'docker system df'
      : 'docker system prune -af --volumes';

    return this.executeCommand(command);
  }

  /**
   * Get Docker system information
   */
  async getDockerSystemInfo(): Promise<CommandResult> {
    return this.executeCommand('docker system df -v');
  }

  /**
   * Setup axios client with SSL configuration
   */
  private setupApiClient(): void {
    this.apiClient = axios.create({
      baseURL: `https://${this.config.host}:8006/api2/json`,
      timeout: 30000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false // Accept self-signed certificates
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add response interceptor for error handling
    this.apiClient.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          this.authenticated = false;
          this.ticket = undefined;
          this.csrfToken = undefined;
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Retry API calls with exponential backoff
   */
  private async retryApiCall<T>(
    apiCall: () => Promise<AxiosResponse<T>>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<AxiosResponse<T>> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        lastError = error;

        // Don't retry on authentication errors
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          throw error;
        }

        // Don't retry on client errors (4xx except 401)
        if (axios.isAxiosError(error) &&
            error.response?.status &&
            error.response.status >= 400 &&
            error.response.status < 500 &&
            error.response.status !== 401) {
          throw error;
        }

        // If this is the last attempt, throw the error
        if (attempt === maxRetries) {
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay = baseDelay * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Create a standardized error object
   */
  private createError(type: CleanupError['type'], message: string, originalError?: any): CleanupError {
    let errorMessage = message;

    if (axios.isAxiosError(originalError)) {
      const status = originalError.response?.status;
      const statusText = originalError.response?.statusText;
      const responseData = originalError.response?.data;

      if (status && statusText) {
        errorMessage += ` (HTTP ${status}: ${statusText})`;
      }

      if (responseData?.errors) {
        errorMessage += ` - ${JSON.stringify(responseData.errors)}`;
      }
    } else if (originalError?.message) {
      errorMessage += `: ${originalError.message}`;
    }

    return {
      type,
      message: errorMessage,
      timestamp: new Date(),
      recoverable: type === 'network' || type === 'authentication'
    };
  }

  /**
   * Sleep for specified milliseconds (can be mocked in tests)
   */
  private sleep(ms: number): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      // In test environment, don't actually sleep to avoid timeouts
      return Promise.resolve();
    }
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extract username from token
   */
  private extractUsername(token: string): string {
    // Token format: username@realm:password or API token format
    if (token.includes(':')) {
      const parts = token.split(':');
      return parts[0];
    }
    throw new Error('Invalid token format');
  }

  /**
   * Extract password from token
   */
  private extractPassword(token: string): string {
    // Token format: username@realm:password or API token format
    if (token.includes(':')) {
      const parts = token.split(':');
      return parts.slice(1).join(':'); // Handle passwords with colons
    }
    throw new Error('Invalid token format');
  }

  /**
   * Ensure client is authenticated before operations
   */
  private ensureAuthenticated(): void {
    if (!this.authenticated) {
      throw new Error('Proxmox client is not authenticated. Call authenticate() first.');
    }
  }
}
