import * as fc from 'fast-check';
import { ResourceFilter } from '../ResourceFilter';
import { Resource } from '../../types';

// Feature: proxmox-cleanup, Property 5: Protected Resource Exclusion
// Validates: Requirements 9.1, 9.2

describe('ResourceFilter Property Tests', () => {
  it('should never include protected resources in filtered results', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          // Generate resources
          fc.array(
            fc.record({
              id: fc.hexaString({ minLength: 12, maxLength: 64 }),
              name: fc.string({ minLength: 1, maxLength: 20 }),
              type: fc.constantFrom('container', 'image', 'volume', 'network'),
              size: fc.nat(),
              createdAt: fc.date(),
              tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 })
            }),
            { minLength: 5, maxLength: 20 }
          ),
          // Generate protection patterns
          fc.array(
            fc.string({ minLength: 1, maxLength: 20 }),
            { minLength: 1, maxLength: 5 }
          )
        ),
        async ([resources, patterns]) => {
          const filter = new ResourceFilter(patterns);
          const filtered = filter.filterProtected(resources as Resource[]);

          // Property: No filtered resource should match any protection pattern
          const allSafe = filtered.every(resource => !filter.isProtected(resource));

          // Property: All protected resources should be excluded from filtered results
          const protectedResources = filter.getProtected(resources as Resource[]);
          const noProtectedInFiltered = protectedResources.every(
            protectedResource => !filtered.some(r => r.id === protectedResource.id)
          );

          expect(allSafe).toBe(true);
          expect(noProtectedInFiltered).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should correctly match wildcard patterns', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          prefix: fc.string({ minLength: 1, maxLength: 10 }),
          suffix: fc.string({ minLength: 1, maxLength: 10 }),
          middle: fc.string({ minLength: 1, maxLength: 10 })
        }),
        async ({ prefix, suffix, middle }) => {
          const pattern = `${prefix}*`;
          const matchingName = `${prefix}${middle}`;
          const nonMatchingName = `${suffix}${middle}`;

          const filter = new ResourceFilter([pattern]);

          const matchingResource: Resource = {
            id: '123',
            name: matchingName,
            type: 'container',
            size: 100,
            createdAt: new Date(),
            tags: []
          };

          const nonMatchingResource: Resource = {
            id: '456',
            name: nonMatchingName,
            type: 'container',
            size: 100,
            createdAt: new Date(),
            tags: []
          };

          // Property: Resources matching wildcard pattern should be protected
          expect(filter.isProtected(matchingResource)).toBe(true);

          // Property: Resources not matching wildcard pattern should not be protected
          if (!nonMatchingName.startsWith(prefix)) {
            expect(filter.isProtected(nonMatchingResource)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should correctly match tag-based protection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 5 })
        ),
        async ([protectedTag, otherTags]) => {
          const pattern = `tag:${protectedTag}`;
          const filter = new ResourceFilter([pattern]);

          const resourceWithTag: Resource = {
            id: '123',
            name: 'test-resource',
            type: 'container',
            size: 100,
            createdAt: new Date(),
            tags: [protectedTag, ...otherTags]
          };

          const resourceWithoutTag: Resource = {
            id: '456',
            name: 'test-resource-2',
            type: 'container',
            size: 100,
            createdAt: new Date(),
            tags: otherTags.filter(t => t !== protectedTag)
          };

          // Property: Resources with protected tag should be protected
          expect(filter.isProtected(resourceWithTag)).toBe(true);

          // Property: Resources without protected tag should not be protected
          if (!otherTags.includes(protectedTag)) {
            expect(filter.isProtected(resourceWithoutTag)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should correctly match ID-based protection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.hexaString({ minLength: 12, maxLength: 64 }),
        async (protectedId) => {
          const pattern = `id:${protectedId}`;
          const filter = new ResourceFilter([pattern]);

          const resourceWithId: Resource = {
            id: protectedId,
            name: 'test-resource',
            type: 'container',
            size: 100,
            createdAt: new Date(),
            tags: []
          };

          const resourceWithDifferentId: Resource = {
            id: 'different-id-123',
            name: 'test-resource-2',
            type: 'container',
            size: 100,
            createdAt: new Date(),
            tags: []
          };

          // Property: Resource with protected ID should be protected
          expect(filter.isProtected(resourceWithId)).toBe(true);

          // Property: Resource with different ID should not be protected
          expect(filter.isProtected(resourceWithDifferentId)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: proxmox-cleanup, Property 6: Resource Type Filtering
  // Validates: Requirements 5.1, 5.3
  describe('Resource Type Filtering', () => {
    it('should only include specified resource types when filtering', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            // Generate mixed resource types
            fc.array(
              fc.record({
                id: fc.hexaString({ minLength: 12, maxLength: 64 }),
                name: fc.string({ minLength: 1, maxLength: 20 }),
                type: fc.constantFrom('container', 'image', 'volume', 'network'),
                size: fc.nat(),
                createdAt: fc.date(),
                tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 })
              }),
              { minLength: 10, maxLength: 30 }
            ),
            // Generate allowed types (1-3 types)
            fc.subarray(['container', 'image', 'volume', 'network'] as const, { minLength: 1, maxLength: 3 })
          ),
          async ([resources, allowedTypes]) => {
            const filter = new ResourceFilter([], allowedTypes);
            const filtered = filter.filterProtected(resources as Resource[]);

            // Property: All filtered resources should be of allowed types
            const allAllowedTypes = filtered.every(resource =>
              allowedTypes.includes(resource.type as any)
            );

            // Property: No filtered resource should be of disallowed types
            const disallowedTypes = (['container', 'image', 'volume', 'network'] as const)
              .filter(t => !allowedTypes.includes(t));
            const noDisallowedTypes = filtered.every(resource =>
              !disallowedTypes.includes(resource.type as any)
            );

            expect(allAllowedTypes).toBe(true);
            expect(noDisallowedTypes).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include all types when no type filter is specified', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.hexaString({ minLength: 12, maxLength: 64 }),
              name: fc.string({ minLength: 1, maxLength: 20 }),
              type: fc.constantFrom('container', 'image', 'volume', 'network'),
              size: fc.nat(),
              createdAt: fc.date(),
              tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 })
            }),
            { minLength: 10, maxLength: 30 }
          ),
          async (resources) => {
            // No type filter specified (empty array)
            const filter = new ResourceFilter([], []);
            const filtered = filter.filterProtected(resources as Resource[]);

            // Property: All resources should be included (no type filtering)
            expect(filtered.length).toBe(resources.length);

            // Property: All resource types should be present in result
            const inputTypes = new Set(resources.map(r => r.type as string));
            const outputTypes = new Set(filtered.map(r => r.type as string));

            inputTypes.forEach(inputType => {
              if (resources.some(r => r.type === inputType)) {
                expect(outputTypes.has(inputType)).toBe(true);
              }
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly combine type filtering with protection patterns', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.array(
              fc.record({
                id: fc.hexaString({ minLength: 12, maxLength: 64 }),
                name: fc.string({ minLength: 1, maxLength: 20 }),
                type: fc.constantFrom('container', 'image', 'volume', 'network'),
                size: fc.nat(),
                createdAt: fc.date(),
                tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 })
              }),
              { minLength: 10, maxLength: 30 }
            ),
            fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
            fc.subarray(['container', 'image', 'volume', 'network'] as const, { minLength: 1, maxLength: 2 })
          ),
          async ([resources, protectionPatterns, allowedTypes]) => {
            const filter = new ResourceFilter(protectionPatterns, allowedTypes);
            const filtered = filter.filterProtected(resources as Resource[]);

            // Property: All filtered resources should be of allowed types
            const allAllowedTypes = filtered.every(resource =>
              allowedTypes.includes(resource.type as any)
            );

            // Property: No filtered resource should be protected
            const noneProtected = filtered.every(resource => !filter.isProtected(resource));

            expect(allAllowedTypes).toBe(true);
            expect(noneProtected).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
