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
});
