import { ProxmoxClient } from '../ProxmoxClient';
import { ProxmoxConfig } from '../../types';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ProxmoxClient', () => {
  let proxmoxClient: ProxmoxClient;
  let mockConfig: ProxmoxConfig;
  let mockAxiosInstance: jest.Mocked<any>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock config
    mockConfig = {
      host: 'proxmox.example.com',
      token: 'root@pam:password123',
      nodeId: 'node1'
    };

    // Create mock axios instance
    mockAxiosInstance = {
      post: jest.fn(),
      get: jest.fn(),
      defaults: {
        headers: {
          common: {}
        }
      },
      interceptors: {
        response: {
          use: jest.fn()
        }
      }
    };

    // Mock axios.create to return our mock instance
    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    proxmoxClient = new ProxmoxClient(mockConfig);
  });

  describe('Authentication', () => {
    it('should successfully authenticate with valid credentials', async () => {
      const mockAuthResponse = {
        data: {
          data: {
            ticket: 'PVE:root@pam:12345678::ticket',
            CSRFPreventionToken: 'csrf-token-123'
          }
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockAuthResponse);

      await proxmoxClient.authenticate();

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/access/ticket', {
        username: 'root@pam',
        password: 'password123'
      });

      expect(proxmoxClient.isAuthenticated()).toBe(true);
      expect(mockAxiosInstance.defaults.headers.common['Cookie']).toBe('PVEAuthCookie=PVE:root@pam:12345678::ticket');
      expect(mockAxiosInstance.defaults.headers.common['CSRFPreventionToken']).toBe('csrf-token-123');
    });

    it('should fail authentication with invalid credentials', async () => {
      mockAxiosInstance.post.mockRejectedValue({
        response: {
          status: 401,
          statusText: 'Unauthorized',
          data: {
            errors: ['authentication failure']
          }
        }
      });

      await expect(proxmoxClient.authenticate()).rejects.toThrow();
      expect(proxmoxClient.isAuthenticated()).toBe(false);
    });

    it('should handle network errors during authentication', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Network Error'));

      await expect(proxmoxClient.authenticate()).rejects.toThrow();
      expect(proxmoxClient.isAuthenticated()).toBe(false);
    });

    it('should handle invalid authentication response format', async () => {
      const mockInvalidResponse = {
        data: {
          // Missing 'data' field
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockInvalidResponse);

      await expect(proxmoxClient.authenticate()).rejects.toThrow('Invalid authentication response');
      expect(proxmoxClient.isAuthenticated()).toBe(false);
    });

    it('should parse complex tokens with colons in password', async () => {
      const configWithComplexToken: ProxmoxConfig = {
        host: 'proxmox.example.com',
        token: 'root@pam:pass:word:123',
        nodeId: 'node1'
      };

      const clientWithComplexToken = new ProxmoxClient(configWithComplexToken);

      const mockAuthResponse = {
        data: {
          data: {
            ticket: 'PVE:root@pam:12345678::ticket',
            CSRFPreventionToken: 'csrf-token-123'
          }
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockAuthResponse);

      await clientWithComplexToken.authenticate();

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/access/ticket', {
        username: 'root@pam',
        password: 'pass:word:123'
      });
    });

    it('should throw error for invalid token format', () => {
      const configWithInvalidToken: ProxmoxConfig = {
        host: 'proxmox.example.com',
        token: 'invalid-token-format',
        nodeId: 'node1'
      };

      expect(() => new ProxmoxClient(configWithInvalidToken)).toThrow('Invalid token format');
    });
  });

  describe('Command Execution', () => {
    beforeEach(async () => {
      // Authenticate first
      const mockAuthResponse = {
        data: {
          data: {
            ticket: 'PVE:root@pam:12345678::ticket',
            CSRFPreventionToken: 'csrf-token-123'
          }
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockAuthResponse);
      await proxmoxClient.authenticate();
      jest.clearAllMocks(); // Clear auth call
    });

    it('should execute command successfully', async () => {
      const mockCommandResponse = {
        data: {
          data: {
            stdout: 'Command output',
            stderr: '',
            exitstatus: 0
          }
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockCommandResponse);

      const result = await proxmoxClient.executeCommand('docker ps');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/nodes/node1/execute', {
        command: 'docker ps'
      });

      expect(result).toEqual({
        stdout: 'Command output',
        stderr: '',
        exitCode: 0
      });
    });

    it('should handle command execution errors', async () => {
      const mockCommandResponse = {
        data: {
          data: {
            stdout: '',
            stderr: 'Command not found',
            exitstatus: 127
          }
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockCommandResponse);

      const result = await proxmoxClient.executeCommand('invalid-command');

      expect(result).toEqual({
        stdout: '',
        stderr: 'Command not found',
        exitCode: 127
      });
    });

    it('should throw error when not authenticated', async () => {
      const unauthenticatedClient = new ProxmoxClient(mockConfig);

      await expect(unauthenticatedClient.executeCommand('docker ps')).rejects.toThrow(
        'Proxmox client is not authenticated'
      );
    });
  });

  describe('Node Status', () => {
    beforeEach(async () => {
      // Authenticate first
      const mockAuthResponse = {
        data: {
          data: {
            ticket: 'PVE:root@pam:12345678::ticket',
            CSRFPreventionToken: 'csrf-token-123'
          }
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockAuthResponse);
      await proxmoxClient.authenticate();
      jest.clearAllMocks(); // Clear auth call
    });

    it('should get node status successfully', async () => {
      const mockStatusResponse = {
        data: {
          data: {
            status: 'online',
            uptime: 86400,
            cpu: 0.25,
            memory: {
              used: 4000000000,
              total: 8000000000
            }
          }
        }
      };

      mockAxiosInstance.get.mockResolvedValue(mockStatusResponse);

      const status = await proxmoxClient.getNodeStatus();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/nodes/node1/status');
      expect(status).toEqual({
        status: 'online',
        uptime: 86400,
        cpu: 0.25,
        memory: {
          used: 4000000000,
          total: 8000000000
        }
      });
    });

    it('should handle missing node status data', async () => {
      const mockStatusResponse = {
        data: {} // Missing 'data' field
      };

      mockAxiosInstance.get.mockResolvedValue(mockStatusResponse);

      await expect(proxmoxClient.getNodeStatus()).rejects.toThrow('Invalid node status response');
    });
  });

  describe('Docker Operations', () => {
    beforeEach(async () => {
      // Authenticate first
      const mockAuthResponse = {
        data: {
          data: {
            ticket: 'PVE:root@pam:12345678::ticket',
            CSRFPreventionToken: 'csrf-token-123'
          }
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockAuthResponse);
      await proxmoxClient.authenticate();
      jest.clearAllMocks(); // Clear auth call
    });

    it('should execute Docker cleanup in dry-run mode', async () => {
      const mockCommandResponse = {
        data: {
          data: {
            stdout: 'TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE\nImages          5         2         1.2GB     800MB (66%)',
            stderr: '',
            exitstatus: 0
          }
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockCommandResponse);

      const result = await proxmoxClient.executeDockerCleanup(true);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/nodes/node1/execute', {
        command: 'docker system df'
      });

      expect(result.stdout).toContain('TYPE');
      expect(result.exitCode).toBe(0);
    });

    it('should execute Docker cleanup in actual mode', async () => {
      const mockCommandResponse = {
        data: {
          data: {
            stdout: 'Deleted Images:\nsha256:abc123...\nTotal reclaimed space: 1.2GB',
            stderr: '',
            exitstatus: 0
          }
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockCommandResponse);

      const result = await proxmoxClient.executeDockerCleanup(false);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/nodes/node1/execute', {
        command: 'docker system prune -af --volumes'
      });

      expect(result.stdout).toContain('Deleted Images');
      expect(result.exitCode).toBe(0);
    });

    it('should get Docker system info', async () => {
      const mockCommandResponse = {
        data: {
          data: {
            stdout: 'Images space usage:\nREPOSITORY   TAG       IMAGE ID       CREATED       SIZE',
            stderr: '',
            exitstatus: 0
          }
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockCommandResponse);

      const result = await proxmoxClient.getDockerSystemInfo();

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/nodes/node1/execute', {
        command: 'docker system df -v'
      });

      expect(result.stdout).toContain('Images space usage');
    });
  });

  describe('Error Handling', () => {
    it('should handle axios errors with proper error formatting', async () => {
      const axiosError = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: {
            errors: ['Database connection failed']
          }
        }
      };

      // Mock axios.isAxiosError to return true for our mock error
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockAxiosInstance.post.mockRejectedValue(axiosError);

      await expect(proxmoxClient.authenticate()).rejects.toThrow(
        'Failed to authenticate with Proxmox API (HTTP 500: Internal Server Error) - ["Database connection failed"]'
      );
    });

    it('should handle non-axios errors', async () => {
      const genericError = new Error('Generic error message');

      // Mock axios.isAxiosError to return false for generic errors
      mockedAxios.isAxiosError.mockReturnValue(false);
      mockAxiosInstance.post.mockRejectedValue(genericError);

      await expect(proxmoxClient.authenticate()).rejects.toThrow(
        'Failed to authenticate with Proxmox API: Generic error message'
      );
    });
  });
});
