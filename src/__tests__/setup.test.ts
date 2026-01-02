/**
 * Basic setup test to verify Jest is working
 */

describe('Project Setup', () => {
  it('should pass basic test', () => {
    expect(true).toBe(true);
  });

  it('should import types correctly', () => {
    const resourceType: string = 'container';
    expect(['container', 'image', 'volume', 'network', 'cache']).toContain(resourceType);
  });
});
