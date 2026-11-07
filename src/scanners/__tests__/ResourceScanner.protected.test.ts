import { ResourceScanner } from '../ResourceScanner';
import { IDockerClient } from '../../interfaces';
import { ContainerResource, ImageResource, VolumeResource, NetworkResource, Resource } from '../../types';

const base = { size: 0, createdAt: new Date('2020-01-01'), tags: [] as string[] };

const containers: ContainerResource[] = [
  { ...base, id: 'c1', name: 'keep-db', type: 'container', status: 'exited', imageId: 'i0', volumes: [], networks: [] },
  { ...base, id: 'c2', name: 'old-app', type: 'container', status: 'exited', imageId: 'i0', volumes: [], networks: [] }
];
const images: ImageResource[] = [
  { ...base, id: 'i1', name: 'keep-img', type: 'image', repository: 'r', tag: 't', usedByContainers: [] },
  { ...base, id: 'i2', name: 'old-img', type: 'image', repository: 'r', tag: 't', usedByContainers: [] }
];
const volumes: VolumeResource[] = [
  { ...base, id: 'v1', name: 'keep-vol', type: 'volume', mountPoint: '/a', usedByContainers: [] },
  { ...base, id: 'v2', name: 'old-vol', type: 'volume', mountPoint: '/b', usedByContainers: [] }
];
const networks: NetworkResource[] = [
  { ...base, id: 'n1', name: 'keep-net', type: 'network', driver: 'bridge', connectedContainers: [] } as NetworkResource,
  { ...base, id: 'n2', name: 'old-net', type: 'network', driver: 'bridge', connectedContainers: [] } as NetworkResource
];

const client = {
  listContainers: async () => containers,
  listImages: async () => images,
  listVolumes: async () => volumes,
  listNetworks: async () => networks
} as unknown as IDockerClient;

describe('ResourceScanner protected observer', () => {
  it('reports each protected resource once and no unprotected ones', async () => {
    const scanner = new ResourceScanner(client, ['keep-*']);
    const seen: Resource[] = [];
    scanner.setProtectedObserver(r => seen.push(r));

    const results = [
      await scanner.scanContainers(),
      await scanner.scanImages(),
      await scanner.scanVolumes(),
      await scanner.scanNetworks()
    ];

    expect(seen.map(r => r.id).sort()).toEqual(['c1', 'i1', 'n1', 'v1']);
    expect(results.map(r => r.map(x => x.id))).toEqual([['c2'], ['i2'], ['v2'], ['n2']]);
  });

  it('returns the same results with and without an observer', async () => {
    const plain = new ResourceScanner(client, ['keep-*']);
    const observed = new ResourceScanner(client, ['keep-*']);
    observed.setProtectedObserver(() => undefined);

    expect(await observed.scanContainers()).toEqual(await plain.scanContainers());
    expect(await observed.scanImages()).toEqual(await plain.scanImages());
    expect(await observed.scanVolumes()).toEqual(await plain.scanVolumes());
    expect(await observed.scanNetworks()).toEqual(await plain.scanNetworks());
  });

  it('does not call the observer when nothing is protected', async () => {
    const scanner = new ResourceScanner(client, []);
    const cb = jest.fn();
    scanner.setProtectedObserver(cb);
    await scanner.scanContainers();
    expect(cb).not.toHaveBeenCalled();
  });
});
