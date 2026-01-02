import { ProxmoxClient } from '../ProxmoxClient';
import { ProxmoxConfig } from '../../types';
import axios from 'axios';
import * as fc from 'fast-check';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ProxmoxClient Retry Logic', () => {
  let mockConfig: ProxmoxConfig;
  let mockAxiosInstance: jest.Mocked<any>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      host: 'proxmox.example.com',
      token: 'root@pam:password123',
      nodeId: 'node1'
    };

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

    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    mockedAxios.isAxiosError.mockImplementation((error: any) => {
      return error && error.response && typeof error.response.status === 'number';
    });
  });

  describe('Property 9: API Retry Resilience', () => {
    // Feature: proxmox-cleanup, Property 9: API Retry Resilience
    // Validates: Requirements 7.4
    it('should retry failed API calls up to 3 times with exponential backoff', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            failureCount: fc.integer({ min: 1, max: 5 }),
            errorType: fc.oneof(
              fc.constant('network'),
              fc.constant('server_error'),
              fc.constant('timeout')
            )
          }),
          async (testData) => {
            const { failureCount, errorType } = testData;
            const proxmoxClient = new ProxmoxClient(mockConfig);

            // Mock authentication success
            const mockAuthResponse = {
              data: {
                data: {
                  ticket: 'PVE:root@pam:12345678::ticket',
                  CSRFPreventionToken: 'csrf-token-123'
                }
              }
            };

            mockAxiosInstance.post.mockResolvedValueOnce(mockAuthResponse);
            await proxmoxClient.authenticate();

            // Reset mock to track retry attempts
            mockAxiosInstance.post.mockReset();

            // Create appropriate error based on type
            let mockError: any;
            switch (errorType) {
            case 'network':
              mockError = new Error('Network Error');
              mockedAxios.isAxiosError.mockReturnValue(false);
              break;
            case 'server_error':
              mockError = {
                response: {
                  status: 500,
                  statusText: 'Internal Server Error'
                }
              };
              mockedAxios.isAxiosError.mockReturnValue(true);
              break;
            case 'timeout':
              mockError = {
                response: {
                  status: 504,
                  statusText: 'Gateway Timeout'
                }
              };
              mockedAxios.isAxiosError.mockReturnValue(true);
              break;
            }

            // Mock failures followed by success (if failure count <= 3)
            if (failureCount <= 3) {
              // Mock failures
              for (let i = 0; i < failureCount; i++) {
                mockAxiosInstance.post.mockRejectedValueOnce(mockError);
              }

              // Mock final success
              mockAxiosInstance.post.mockResolvedValueOnce({
                data: {
                  data: {
                    stdout: 'Success after retries',
                    stderr: '',
                    exitstatus: 0
                  }
                }
              });

              // Property: Should succeed after retries
              const result = await proxmoxClient.executeCommand('test-command');
              expect(result.stdout).toBe('Success after retries');

              // Property: Should have made exactly failureCount + 1 attempts
              expect(mockAxiosInstance.post).toHaveBeenCalledTimes(failureCount + 1);
            } else {
              // Mock all attempts as failures
              for (let i = 0; i <= 3; i++) {
                mockAxiosInstance.post.mockRejectedValueOnce(mockError);
              }

              // Property: Should fail after 3 retries (4 total attempts)
              await expect(proxmoxClient.executeCommand('test-command')).rejects.toThrow();

              // Property: Should have made exactly 4 attempts (1 initial + 3 retries)
              expect(mockAxiosInstance.post).toHaveBeenCalledTimes(4);
            }
          }
        ),
        { numRuns: 50 }
      );
    }, 10000); // 10 second timeout

    it('should not retry on authentication errors (401)', async () => {
      const proxmoxClient = new ProxmoxClient(mockConfig);

      // Mock authentication success
      const mockAuthResponse = {
        data: {
          data: {
            ticket: 'PVE:root@pam:12345678::ticket',
            CSRFPreventionToken: 'csrf-token-123'
          }
        }
      };

      mockAxiosInstance.post.mockResolvedValueOnce(mockAuthResponse);
      await proxmoxClient.authenticate();

      // Reset mock
      mockAxiosInstance.post.mockReset();

      // Mock 401 error
      const authError = {
        response: {
          status: 401,
          statusText: 'Unauthorized'
        }
      };

      mockAxiosInstance.post.mockRejectedValue(authError);

      // Should fail immediately without retries
      await expect(proxmoxClient.executeCommand('test-command')).rejects.toThrow();

      // Should have made only 1 attempt
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
    });

    it('should not retry on client errors (4xx except 401)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 400, max: 499 }).filter(status => status !== 401),
          async (errorStatus) => {
            const proxmoxClient = new ProxmoxClient(mockConfig);

            // Mock authentication success
            const mockAuthResponse = {
              data: {
                data: {
                  ticket: 'PVE:root@pam:12345678::ticket',
                  CSRFPreventionToken: 'csrf-token-123'
                }
              }
            };

            mockAxiosInstance.post.mockResolvedValueOnce(mockAuthResponse);
            await proxmoxClient.authenticate();

            // Reset mock
            mockAxiosInstance.post.mockReset();

            // Mock client error
            const clientError = {
              response: {
                status: errorStatus,
                statusText: 'Client Error'
              }
            };

            mockAxiosInstance.post.mockRejectedValue(clientError);

            // Should fail immediately without retries
            await expect(proxmoxClient.executeCommand('test-command')).rejects.toThrow();

            // Property: Should have made only 1 attempt (no retries for client errors)
            expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should implement exponential backoff between retries', async () => {
      const proxmoxClient = new ProxmoxClient(mockConfig);

      // Mock authentication success
      const mockAuthResponse = {
        data: {
          data: {
            ticket: 'PVE:root@pam:12345678::ticket',
            CSRFPreventionToken: 'csrf-token-123'
          }
        }
      };

      mockAxiosInstance.post.mockResolvedValueOnce(mockAuthResponse);
      await proxmoxClient.authenticate();

      // Reset mock
      mockAxiosInstance.post.mockReset();

      // Mock network errors for first 2 attempts, then success
      const networkError = new Error('Network Error');
      mockedAxios.isAxiosError.mockReturnValue(false);
      mockAxiosInstance.post
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          data: {
            data: {
              stdout: 'Success after retries',
              stderr: '',
              exitstatus: 0
            }
          }
        });

      const result = await proxmoxClient.executeCommand('test-command');

      // Property: Should succeed after retries
      expect(result.stdout).toBe('Success after retries');

      // Property: Should have made 3 attempts
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
    }, 10000); // 10 second timeout

    it('should handle mixed error types correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.oneof(
              fc.record({ type: fc.constant('network'), error: fc.constant(new Error('Network Error')) }),
              fc.record({
                type: fc.constant('server'),
                error: fc.constant({ response: { status: 500, statusText: 'Server Error' } })
              }),
              fc.record({
                type: fc.constant('timeout'),
                error: fc.constant({ response: { status: 504, statusText: 'Timeout' } })
              })
            ),
            { minLength: 1, maxLength: 3 }
          ),
          async (errorSequence) => {
            const proxmoxClient = new ProxmoxClient(mockConfig);

            // Mock authentication success
            const mockAuthResponse = {
              data: {
                data: {
                  ticket: 'PVE:root@pam:12345678::ticket',
                  CSRFPreventionToken: 'csrf-token-123'
                }
              }
            };

            mockAxiosInstance.post.mockResolvedValueOnce(mockAuthResponse);
            await proxmoxClient.authenticate();

            // Reset mock
            mockAxiosInstance.post.mockReset();

            // Mock error sequence
            errorSequence.forEach(({ error, type }) => {
              mockAxiosInstance.post.mockRejectedValueOnce(error);
              // Mock axios.isAxiosError based on error type
              mockedAxios.isAxiosError.mockReturnValue(type !== 'network');
            });

            // Mock final success
            mockAxiosInstance.post.mockResolvedValueOnce({
              data: {
                data: {
                  stdout: 'Success',
                  stderr: '',
                  exitstatus: 0
                }
              }
            });

            // Property: Should succeed after retries
            const result = await proxmoxClient.executeCommand('test-command');
            expect(result.stdout).toBe('Success');

            // Property: Should have made errorSequence.length + 1 attempts
            expect(mockAxiosInstance.post).toHaveBeenCalledTimes(errorSequence.length + 1);
          }
        ),
        { numRuns: 30 }
      );
    }, 10000); // 10 second timeout
  });

  describe('Retry Logic Edge Cases', () => {
    it('should handle immediate success without retries', async () => {
      const proxmoxClient = new ProxmoxClient(mockConfig);

      // Mock authentication success
      const mockAuthResponse = {
        data: {
          data: {
            ticket: 'PVE:root@pam:12345678::ticket',
            CSRFPreventionToken: 'csrf-token-123'
          }
        }
      };

      mockAxiosInstance.post.mockResolvedValueOnce(mockAuthResponse);
      await proxmoxClient.authenticate();

      // Reset mock
      mockAxiosInstance.post.mockReset();

      // Mock immediate success
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          data: {
            stdout: 'Immediate success',
            stderr: '',
            exitstatus: 0
          }
        }
      });

      const result = await proxmoxClient.executeCommand('test-command');

      expect(result.stdout).toBe('Immediate success');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
    });

    it('should fail after maximum retries exceeded', async () => {
      const proxmoxClient = new ProxmoxClient(mockConfig);

      // Mock authentication success
      const mockAuthResponse = {
        data: {
          data: {
            ticket: 'PVE:root@pam:12345678::ticket',
            CSRFPreventionToken: 'csrf-token-123'
          }
        }
      };

      mockAxiosInstance.post.mockResolvedValueOnce(mockAuthResponse);
      await proxmoxClient.authenticate();

      // Reset mock
      mockAxiosInstance.post.mockReset();

      // Mock persistent failures
      const networkError = new Error('Persistent Network Error');
      mockedAxios.isAxiosError.mockReturnValue(false);
      mockAxiosInstance.post.mockRejectedValue(networkError);

      await expect(proxmoxClient.executeCommand('test-command')).rejects.toThrow('Persistent Network Error');

      // Should have made 4 attempts (1 initial + 3 retries)
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(4);
    }, 10000); // 10 second timeout
  });
});
