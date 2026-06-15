import { Resource } from '../types';

/**
 * Utility class for filtering resources based on protection patterns
 */
export class ResourceFilter {
  private protectedPatterns: string[];

  constructor(protectedPatterns: string[] = []) {
    this.protectedPatterns = protectedPatterns;
  }

  /**
   * Check if a resource is protected by any pattern
   * Supports:
   * - Exact name match
   * - Wildcard patterns (e.g., "my-app-*")
   * - Tag match (e.g., "tag:production")
   * - ID match
   */
  isProtected(resource: Resource): boolean {
    if (this.protectedPatterns.length === 0) {
      return false;
    }

    return this.protectedPatterns.some(pattern => {
      // Tag-based protection
      if (pattern.startsWith('tag:')) {
        const tagName = pattern.substring(4);
        return resource.tags.includes(tagName);
      }

      // ID-based protection
      if (pattern.startsWith('id:')) {
        const id = pattern.substring(3);
        return resource.id === id;
      }

      // Wildcard pattern matching
      if (pattern.includes('*')) {
        const regex = this.wildcardToRegex(pattern);
        return regex.test(resource.name);
      }

      // Exact name match
      return resource.name === pattern;
    });
  }

  /**
   * Filter out protected resources from a list
   */
  filterProtected<T extends Resource>(resources: T[]): T[] {
    return resources.filter(resource => !this.isProtected(resource));
  }

  /**
   * Get list of protected resources from a list
   */
  getProtected<T extends Resource>(resources: T[]): T[] {
    return resources.filter(resource => this.isProtected(resource));
  }

  /**
   * Convert wildcard pattern to regex
   * Supports * as wildcard
   */
  private wildcardToRegex(pattern: string): RegExp {
    // Escape special regex characters except *
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    // Replace * with .*
    const regexPattern = escaped.replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`);
  }
}
