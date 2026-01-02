import { DockerClient } from '../DockerClient';
import Docker from 'dockerode';

// Mock dockerode
jest.mock('dockerode');

describe('DockerClient', () => {
  let dockerClient: DockerClient;
  let mockDocker: jest.Mocked<Docker>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock Docker instance
    mockDocker = {
      ping: jest.fn(),
      listContainers: jest.fn(),
      listImages: jest.fn(),
      listVolumes: jest.fn(),
      listNetworks: jest.fn(),
      getContainer: jest.fn(),
      getImage: jest.fn(),
      getVolume: jest.fn(),
      getNetwork: jest.fn(),
      pruneContainers: jest.fn(),
      pruneImages: jest.fn(),
      pruneVolumes: jest.fn(),
      pruneNetworks: jest.fn()
    } as any;

    // Mock Docker constructor
    (Docker as jest.MockedClass<typeof Docker>).mockImplementation(() => mockDocker);

    dockerClient = new DockerClient();
  });

  describe('Connection', () => {
    it('should successfully connect to Docker daemon', async () => {
      mockDocker.ping.mockResolvedValue({} as any);

      await dockerClient.connect();

      expect(mockDocker.ping).toHaveBeenCalled();
      expect(dockerClient.isConnected()).toBe(true);
    });

    it('should fail to connect when Docker daemon is not available', async () => {
      mockDocker.ping.mockRejectedValue(new Error('Connection refused'));

      await expect(dockerClient.connect()).rejects.toThrow();
      expect(dockerClient.isConnected()).toBe(false);
    });

    it('should throw error when operations are called without connection', async () => {
      await expect(dockerClient.listContainers()).rejects.toThrow(
        'Docker client is not connected'
      );
    });
  });

  describe('List Operations', () => {
    beforeEach(async () => {
      mockDocker.ping.mockResolvedValue({} as any);
      await dockerClient.connect();
    });

    it('should list containers successfully', async () => {
      const mockContainers = [
        {
          Id: 'container1',
          Names: ['/test-container'],
          State: 'running',
          Created: Math.floor(Date.now() / 1000),
          ImageID: 'image1',
          Labels: { app: 'test' },
          Mounts: [{ Name: 'volume1', Source: '/data' }]
        }
      ];

      mockDocker.listContainers.mockResolvedValue(mockContainers as any);

      const result = await dockerClient.listContainers(true);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test-container');
      expect(result[0].status).toBe('running');
      expect(result[0].type).toBe('container');
    });

    it('should list images successfully', async () => {
      const mockImages = [
        {
          Id: 'image1',
          RepoTags: ['nginx:latest'],
          Size: 1000000,
          Created: Math.floor(Date.now() / 1000),
          Labels: {}
        }
      ];

      mockDocker.listImages.mockResolvedValue(mockImages as any);

      const result = await dockerClient.listImages();

      expect(result).toHaveLength(1);
      expect(result[0].repository).toBe('nginx');
      expect(result[0].tag).toBe('latest');
      expect(result[0].type).toBe('image');
    });

    it('should list volumes successfully', async () => {
      const mockVolumes = {
        Volumes: [
          {
            Name: 'test-volume',
            Mountpoint: '/var/lib/docker/volumes/test-volume',
            Labels: {}
          }
        ]
      };

      mockDocker.listVolumes.mockResolvedValue(mockVolumes as any);

      const result = await dockerClient.listVolumes();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test-volume');
      expect(result[0].type).toBe('volume');
    });

    it('should list networks successfully', async () => {
      const mockNetworks = [
        {
          Id: 'network1',
          Name: 'bridge',
          Driver: 'bridge',
          Created: new Date().toISOString(),
          Labels: {},
          Containers: {}
        }
      ];

      mockDocker.listNetworks.mockResolvedValue(mockNetworks as any);

      const result = await dockerClient.listNetworks();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('bridge');
      expect(result[0].driver).toBe('bridge');
      expect(result[0].type).toBe('network');
    });
  });

  describe('Remove Operations', () => {
    beforeEach(async () => {
      mockDocker.ping.mockResolvedValue({} as any);
      await dockerClient.connect();
    });

    it('should remove container successfully', async () => {
      const mockContainer = {
        remove: jest.fn().mockResolvedValue({})
      };
      mockDocker.getContainer.mockReturnValue(mockContainer as any);

      await dockerClient.removeContainer('container1');

      expect(mockDocker.getContainer).toHaveBeenCalledWith('container1');
      expect(mockContainer.remove).toHaveBeenCalledWith({ force: true });
    });

    it('should handle container not found error', async () => {
      const mockContainer = {
        remove: jest.fn().mockRejectedValue({ statusCode: 404 })
      };
      mockDocker.getContainer.mockReturnValue(mockContainer as any);

      await expect(dockerClient.removeContainer('nonexistent')).rejects.toThrow();
    });

    it('should remove image successfully', async () => {
      const mockImage = {
        remove: jest.fn().mockResolvedValue({})
      };
      mockDocker.getImage.mockReturnValue(mockImage as any);

      await dockerClient.removeImage('image1');

      expect(mockDocker.getImage).toHaveBeenCalledWith('image1');
      expect(mockImage.remove).toHaveBeenCalledWith({ force: true });
    });

    it('should handle image in use error', async () => {
      const mockImage = {
        remove: jest.fn().mockRejectedValue({ statusCode: 409 })
      };
      mockDocker.getImage.mockReturnValue(mockImage as any);

      await expect(dockerClient.removeImage('image1')).rejects.toThrow();
    });

    it('should remove volume successfully', async () => {
      const mockVolume = {
        remove: jest.fn().mockResolvedValue({})
      };
      mockDocker.getVolume.mockReturnValue(mockVolume as any);

      await dockerClient.removeVolume('volume1');

      expect(mockDocker.getVolume).toHaveBeenCalledWith('volume1');
      expect(mockVolume.remove).toHaveBeenCalled();
    });

    it('should remove network successfully', async () => {
      const mockNetwork = {
        remove: jest.fn().mockResolvedValue({})
      };
      mockDocker.getNetwork.mockReturnValue(mockNetwork as any);

      await dockerClient.removeNetwork('network1');

      expect(mockDocker.getNetwork).toHaveBeenCalledWith('network1');
      expect(mockNetwork.remove).toHaveBeenCalled();
    });
  });

  describe('Prune Operations', () => {
    beforeEach(async () => {
      mockDocker.ping.mockResolvedValue({} as any);
      await dockerClient.connect();
    });

    it('should prune system successfully', async () => {
      mockDocker.pruneContainers.mockResolvedValue({
        ContainersDeleted: ['c1', 'c2'],
        SpaceReclaimed: 1000
      } as any);

      mockDocker.pruneImages.mockResolvedValue({
        ImagesDeleted: ['i1'],
        SpaceReclaimed: 5000
      } as any);

      mockDocker.pruneVolumes.mockResolvedValue({
        VolumesDeleted: ['v1'],
        SpaceReclaimed: 0
      } as any);

      mockDocker.pruneNetworks.mockResolvedValue({
        NetworksDeleted: ['n1'],
        SpaceReclaimed: 0
      } as any);

      const result = await dockerClient.pruneSystem();

      expect(result.containersDeleted).toBe(2);
      expect(result.imagesDeleted).toBe(1);
      expect(result.volumesDeleted).toBe(1);
      expect(result.networksDeleted).toBe(1);
      expect(result.spaceReclaimed).toBe(6000);
    });
  });

  // Feature: proxmox-cleanup, Property 7: Removal Atomicity
  // Validates: Requirements 2.5
  describe('Removal Atomicity', () => {
    beforeEach(async () => {
      mockDocker.ping.mockResolvedValue({} as any);
      await dockerClient.connect();
    });

    it('should continue removing other resources when one removal fails', async () => {
      const mockContainer1 = {
        remove: jest.fn().mockResolvedValue({})
      };
      const mockContainer2 = {
        remove: jest.fn().mockRejectedValue(new Error('Removal failed'))
      };
      const mockContainer3 = {
        remove: jest.fn().mockResolvedValue({})
      };

      mockDocker.getContainer
        .mockReturnValueOnce(mockContainer1 as any)
        .mockReturnValueOnce(mockContainer2 as any)
        .mockReturnValueOnce(mockContainer3 as any);

      // Try to remove three containers, second one fails
      const results = await Promise.allSettled([
        dockerClient.removeContainer('container1'),
        dockerClient.removeContainer('container2'),
        dockerClient.removeContainer('container3')
      ]);

      // Property: First and third removals should succeed
      expect(results[0].status).toBe('fulfilled');
      expect(results[2].status).toBe('fulfilled');

      // Property: Second removal should fail but not affect others
      expect(results[1].status).toBe('rejected');

      // Property: All removal attempts should be made
      expect(mockContainer1.remove).toHaveBeenCalled();
      expect(mockContainer2.remove).toHaveBeenCalled();
      expect(mockContainer3.remove).toHaveBeenCalled();
    });

    it('should handle mixed success and failure scenarios', async () => {
      const mockImage1 = {
        remove: jest.fn().mockResolvedValue({})
      };
      const mockImage2 = {
        remove: jest.fn().mockRejectedValue({ statusCode: 409 }) // In use
      };
      const mockImage3 = {
        remove: jest.fn().mockRejectedValue({ statusCode: 404 }) // Not found
      };

      mockDocker.getImage
        .mockReturnValueOnce(mockImage1 as any)
        .mockReturnValueOnce(mockImage2 as any)
        .mockReturnValueOnce(mockImage3 as any);

      const results = await Promise.allSettled([
        dockerClient.removeImage('image1'),
        dockerClient.removeImage('image2'),
        dockerClient.removeImage('image3')
      ]);

      // Property: Each removal should be attempted independently
      expect(mockImage1.remove).toHaveBeenCalled();
      expect(mockImage2.remove).toHaveBeenCalled();
      expect(mockImage3.remove).toHaveBeenCalled();

      // Property: Success should not be affected by failures
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('rejected');
    });
  });
});
