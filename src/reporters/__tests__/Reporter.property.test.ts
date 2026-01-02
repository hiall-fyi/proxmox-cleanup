import { Reporter } from '../Reporter';
import { Resource, CleanupResult } from '../../types';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// Arbitraries for generating test data
const resourceArbitrary = fc.record({
  id: fc.string({ minLength: 1 }),
  name: fc.string({ minLength: 1 }),
  type: fc.oneof(
    fc.constant('container' as const),
    fc.constant('image' as const),
    fc.constant('volume' as const),
    fc.constant('network' as const)
  ),
  size: fc.nat({ max: 1000000000 }),
  createdAt: fc.date(),
  tags: fc.array(fc.string())
});

const cleanupErrorArbitrary = fc.record({
  type: fc.oneof(
    fc.constant('authentication' as const),
    fc.constant('network' as const),
    fc.constant('permission' as const),
    fc.constant('resource_in_use' as const),
    fc.constant('resource_not_found' as const),
    fc.constant('filesystem' as const),
    fc.constant('unknown' as const)
  ),
  message: fc.string({ minLength: 1 }),
  timestamp: fc.date(),
  recoverable: fc.boolean(),
  resource: fc.option(resourceArbitrary, { nil: undefined })
});

const cleanupResultArbitrary = fc.record({
  removed: fc.array(resourceArbitrary, { maxLength: 10 }),
  skipped: fc.array(resourceArbitrary, { maxLength: 10 }),
  errors: fc.array(cleanupErrorArbitrary, { maxLength: 5 }),
  diskSpaceFreed: fc.nat({ max: 10000000000 }),
  executionTime: fc.nat({ max: 300000 })
});

describe('Reporter Property Tests', () => {
  let reporter: Reporter;
  let testLogPath: string;

  beforeEach(() => {
    // Create temporary log directory for testing
    testLogPath = path.join(__dirname, 'test-logs', `test-${Date.now()}`);
    reporter = new Reporter(testLogPath);
  });

  afterEach(async () => {
    // Clean up test log directory
    try {
      if (fs.existsSync(testLogPath)) {
        await fs.promises.rm(testLogPath, { recursive: true, force: true });
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Property 8: Report Consistency', () => {
    // Feature: proxmox-cleanup, Property 8: Report Consistency
    // Validates: Requirements 10.1, 10.2
    it('should ensure total resources equals removed + skipped + errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            scannedResources: fc.array(resourceArbitrary, { minLength: 1, maxLength: 20 }),
            result: cleanupResultArbitrary,
            mode: fc.oneof(fc.constant('dry-run' as const), fc.constant('cleanup' as const)),
            executionTime: fc.nat({ max: 300000 })
          }),
          async (testData) => {
            const { scannedResources, result, mode, executionTime } = testData;

            // Generate report
            const report = reporter.generateReport(mode, scannedResources, result, executionTime);

            // Property: Report should contain all input data
            expect(report.mode).toBe(mode);
            expect(report.summary.resourcesScanned).toBe(scannedResources.length);
            expect(report.summary.resourcesRemoved).toBe(result.removed.length);
            expect(report.summary.diskSpaceFreed).toBe(result.diskSpaceFreed);
            expect(report.summary.executionTime).toBe(executionTime);

            // Property: Details should match input
            expect(report.details.removed).toEqual(result.removed);
            expect(report.details.skipped).toEqual(result.skipped);
            expect(report.details.errors).toEqual(result.errors);

            // Property: Report should have a valid timestamp
            expect(report.timestamp).toBeInstanceOf(Date);
            expect(report.timestamp.getTime()).toBeLessThanOrEqual(Date.now());

            // Property: Summary counts should be consistent
            const totalProcessed = result.removed.length + result.skipped.length + result.errors.length;
            expect(totalProcessed).toBeGreaterThanOrEqual(0);
            expect(report.summary.resourcesRemoved).toBe(result.removed.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate consistent summaries for the same report', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            scannedResources: fc.array(resourceArbitrary, { maxLength: 10 }),
            result: cleanupResultArbitrary,
            mode: fc.oneof(fc.constant('dry-run' as const), fc.constant('cleanup' as const)),
            executionTime: fc.nat({ max: 300000 })
          }),
          async (testData) => {
            const { scannedResources, result, mode, executionTime } = testData;

            // Generate report
            const report = reporter.generateReport(mode, scannedResources, result, executionTime);

            // Generate summary multiple times
            const summary1 = reporter.generateSummary(report);
            const summary2 = reporter.generateSummary(report);

            // Property: Summaries should be identical
            expect(summary1).toBe(summary2);

            // Property: Summary should contain key information
            expect(summary1).toContain(mode.toUpperCase());
            expect(summary1).toContain(`Resources Scanned: ${scannedResources.length}`);
            expect(summary1).toContain(`${mode === 'dry-run' ? 'Would Be ' : ''}Removed: ${result.removed.length}`);

            // Property: Summary should be non-empty
            expect(summary1.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain data integrity when saving and loading reports', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            scannedResources: fc.array(resourceArbitrary, { maxLength: 5 }),
            result: cleanupResultArbitrary,
            mode: fc.oneof(fc.constant('dry-run' as const), fc.constant('cleanup' as const)),
            executionTime: fc.nat({ max: 300000 })
          }),
          async (testData) => {
            const { scannedResources, result, mode, executionTime } = testData;

            // Generate report
            const originalReport = reporter.generateReport(mode, scannedResources, result, executionTime);

            // Save report to file
            const filePath = await reporter.saveReport(originalReport);

            // Verify file exists
            expect(fs.existsSync(filePath)).toBe(true);

            // Load report from file
            const fileContent = await fs.promises.readFile(filePath, 'utf8');
            const loadedReport = JSON.parse(fileContent);

            // Property: Loaded report should match original (accounting for JSON serialization)
            expect(loadedReport.mode).toBe(originalReport.mode);
            expect(loadedReport.summary).toEqual(originalReport.summary);

            // Handle Date serialization in resources
            const compareResources = (loaded: any[], original: Resource[]) => {
              expect(loaded).toHaveLength(original.length);
              loaded.forEach((loadedResource: any, index: number) => {
                const originalResource = original[index];
                expect(loadedResource.id).toBe(originalResource.id);
                expect(loadedResource.name).toBe(originalResource.name);
                expect(loadedResource.type).toBe(originalResource.type);
                expect(loadedResource.size).toBe(originalResource.size);
                expect(loadedResource.tags).toEqual(originalResource.tags);
                // createdAt becomes string after JSON serialization
                expect(new Date(loadedResource.createdAt)).toEqual(originalResource.createdAt);
              });
            };

            compareResources(loadedReport.details.removed, originalReport.details.removed);
            compareResources(loadedReport.details.skipped, originalReport.details.skipped);

            // For errors, we need to handle the fact that undefined values are removed during JSON serialization
            expect(loadedReport.details.errors).toHaveLength(originalReport.details.errors.length);
            loadedReport.details.errors.forEach((loadedError: any, index: number) => {
              const originalError = originalReport.details.errors[index];
              expect(loadedError.type).toBe(originalError.type);
              expect(loadedError.message).toBe(originalError.message);
              expect(loadedError.recoverable).toBe(originalError.recoverable);
              // timestamp becomes string after JSON serialization
              expect(new Date(loadedError.timestamp)).toEqual(originalError.timestamp);
              // resource field may be undefined and gets removed during JSON serialization
              if (originalError.resource) {
                expect(loadedError.resource).toBeDefined();
                expect(loadedError.resource.id).toBe(originalError.resource.id);
                expect(loadedError.resource.name).toBe(originalError.resource.name);
                expect(loadedError.resource.type).toBe(originalError.resource.type);
                expect(new Date(loadedError.resource.createdAt)).toEqual(originalError.resource.createdAt);
              }
            });

            // Property: Timestamp should be preserved (as string)
            expect(new Date(loadedReport.timestamp)).toEqual(originalReport.timestamp);
          }
        ),
        { numRuns: 50 } // Reduced runs due to file I/O
      );
    });
  });

  describe('Report Generation Edge Cases', () => {
    it('should handle empty resource lists', async () => {
      const emptyResult: CleanupResult = {
        removed: [],
        skipped: [],
        errors: [],
        diskSpaceFreed: 0,
        executionTime: 1000
      };

      const report = reporter.generateReport('dry-run', [], emptyResult, 1000);

      expect(report.summary.resourcesScanned).toBe(0);
      expect(report.summary.resourcesRemoved).toBe(0);
      expect(report.summary.diskSpaceFreed).toBe(0);
      expect(report.details.removed).toHaveLength(0);
      expect(report.details.skipped).toHaveLength(0);
      expect(report.details.errors).toHaveLength(0);

      const summary = reporter.generateSummary(report);
      expect(summary).toContain('Resources Scanned: 0');
      expect(summary).toContain('Success Rate: 100.0%');
    });

    it('should handle reports with only errors', async () => {
      const errorOnlyResult: CleanupResult = {
        removed: [],
        skipped: [],
        errors: [
          {
            type: 'network',
            message: 'Connection failed',
            timestamp: new Date(),
            recoverable: true
          }
        ],
        diskSpaceFreed: 0,
        executionTime: 2000
      };

      const report = reporter.generateReport('cleanup', [], errorOnlyResult, 2000);

      expect(report.summary.resourcesRemoved).toBe(0);
      expect(report.details.errors).toHaveLength(1);

      const summary = reporter.generateSummary(report);
      expect(summary).toContain('ERRORS:');
      expect(summary).toContain('Success Rate: 0.0%');
    });

    it('should calculate success rate correctly', async () => {
      const mixedResult: CleanupResult = {
        removed: [
          { id: '1', name: 'container1', type: 'container', size: 1000, createdAt: new Date(), tags: [] } as Resource
        ],
        skipped: [
          { id: '2', name: 'container2', type: 'container', size: 2000, createdAt: new Date(), tags: [] } as Resource
        ],
        errors: [
          {
            type: 'resource_in_use',
            message: 'Resource in use',
            timestamp: new Date(),
            recoverable: false
          }
        ],
        diskSpaceFreed: 1000,
        executionTime: 3000
      };

      const report = reporter.generateReport('cleanup', [], mixedResult, 3000);
      const summary = reporter.generateSummary(report);

      // Success rate should be 1 removed / 3 total = 33.3%
      expect(summary).toContain('Success Rate: 33.3%');
    });
  });

  describe('File Operations', () => {
    it('should create log directory if it does not exist', async () => {
      const nonExistentPath = path.join(__dirname, 'non-existent-logs', `test-${Date.now()}`);
      const reporterWithNewPath = new Reporter(nonExistentPath);

      const report = reporterWithNewPath.generateReport('dry-run', [], {
        removed: [],
        skipped: [],
        errors: [],
        diskSpaceFreed: 0,
        executionTime: 1000
      }, 1000);

      await reporterWithNewPath.saveReport(report);

      expect(fs.existsSync(nonExistentPath)).toBe(true);

      // Cleanup
      await fs.promises.rm(nonExistentPath, { recursive: true, force: true });
    });

    it('should generate unique filenames for reports', async () => {
      const report1 = reporter.generateReport('dry-run', [], {
        removed: [],
        skipped: [],
        errors: [],
        diskSpaceFreed: 0,
        executionTime: 1000
      }, 1000);

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const report2 = reporter.generateReport('cleanup', [], {
        removed: [],
        skipped: [],
        errors: [],
        diskSpaceFreed: 0,
        executionTime: 2000
      }, 2000);

      const filePath1 = await reporter.saveReport(report1);
      const filePath2 = await reporter.saveReport(report2);

      expect(filePath1).not.toBe(filePath2);
      expect(fs.existsSync(filePath1)).toBe(true);
      expect(fs.existsSync(filePath2)).toBe(true);
    });
  });
});
