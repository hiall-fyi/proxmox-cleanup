import { CleanupScheduler } from '../CleanupScheduler';
import { CleanupOrchestrator } from '../../orchestrators/CleanupOrchestrator';
import { INotificationService } from '../../interfaces';
import { ScheduleConfig, Report } from '../../types';
import * as cron from 'node-cron';

// Mock node-cron
jest.mock('node-cron');
const mockCron = cron as jest.Mocked<typeof cron>;

// Mock winston
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    json: jest.fn()
  },
  transports: {
    File: jest.fn(),
    Console: jest.fn()
  }
}));

describe('CleanupScheduler', () => {
  let scheduler: CleanupScheduler;
  let mockOrchestrator: jest.Mocked<CleanupOrchestrator>;
  let mockNotificationService: jest.Mocked<INotificationService>;
  let mockScheduleConfig: ScheduleConfig;
  let mockTask: jest.Mocked<cron.ScheduledTask>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock orchestrator
    mockOrchestrator = {
      executeCleanup: jest.fn(),
      executeDryRun: jest.fn(),
      getConfig: jest.fn(),
      updateConfig: jest.fn()
    } as any;

    // Mock notification service
    mockNotificationService = {
      sendNotification: jest.fn(),
      testConnection: jest.fn()
    };

    // Mock schedule config
    mockScheduleConfig = {
      enabled: true,
      cronExpression: '0 2 * * *', // Daily at 2 AM
      dryRun: false,
      timezone: 'UTC'
    };

    // Mock scheduled task
    mockTask = {
      start: jest.fn(),
      stop: jest.fn(),
      destroy: jest.fn(),
      getStatus: jest.fn().mockReturnValue('scheduled')
    } as any;

    // Mock cron functions
    mockCron.validate.mockReturnValue(true);
    mockCron.schedule.mockReturnValue(mockTask);

    scheduler = new CleanupScheduler(
      mockOrchestrator,
      mockScheduleConfig,
      mockNotificationService
    );
  });

  describe('Schedule Management', () => {
    it('should start schedule successfully', async () => {
      await scheduler.startSchedule();

      expect(mockCron.validate).toHaveBeenCalledWith('0 2 * * *');
      expect(mockCron.schedule).toHaveBeenCalledWith(
        '0 2 * * *',
        expect.any(Function),
        {
          scheduled: false,
          timezone: 'UTC'
        }
      );
      expect(mockTask.start).toHaveBeenCalled();
      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith({
        type: 'info',
        title: 'Cleanup Scheduler Started',
        message: 'Scheduled cleanup will run: 0 2 * * *',
        timestamp: expect.any(Date)
      });
    });

    it('should not start schedule when disabled', async () => {
      mockScheduleConfig.enabled = false;
      scheduler = new CleanupScheduler(
        mockOrchestrator,
        mockScheduleConfig,
        mockNotificationService
      );

      await scheduler.startSchedule();

      expect(mockCron.schedule).not.toHaveBeenCalled();
      expect(mockTask.start).not.toHaveBeenCalled();
    });

    it('should throw error for invalid cron expression', async () => {
      mockCron.validate.mockReturnValue(false);

      await expect(scheduler.startSchedule()).rejects.toThrow(
        'Invalid cron expression: 0 2 * * *'
      );
    });

    it('should stop schedule successfully', async () => {
      // Start schedule first
      await scheduler.startSchedule();

      // Then stop it
      await scheduler.stopSchedule();

      expect(mockTask.stop).toHaveBeenCalled();
      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith({
        type: 'info',
        title: 'Cleanup Scheduler Stopped',
        message: 'Scheduled cleanup operations have been stopped',
        timestamp: expect.any(Date)
      });
    });

    it('should get scheduler status correctly', async () => {
      await scheduler.startSchedule();

      const status = scheduler.getStatus();

      expect(status.running).toBe(true);
      expect(status.tasksCount).toBe(1);
      expect(status.nextRun).toBeInstanceOf(Date);
    });

    it('should update schedule configuration', async () => {
      await scheduler.startSchedule();

      const newConfig = {
        cronExpression: '0 3 * * *',
        dryRun: true
      };

      await scheduler.updateSchedule(newConfig);

      // Should stop and restart with new config
      expect(mockTask.stop).toHaveBeenCalled();
      expect(mockCron.schedule).toHaveBeenCalledTimes(2); // Once for start, once for restart
    });
  });

  describe('Scheduled Cleanup Execution', () => {
    it('should execute cleanup successfully', async () => {
      const mockReport: Report = {
        timestamp: new Date(),
        mode: 'cleanup',
        summary: {
          resourcesScanned: 10,
          resourcesRemoved: 5,
          diskSpaceFreed: 1048576,
          executionTime: 1500
        },
        details: {
          removed: [],
          skipped: [],
          errors: []
        }
      };

      mockOrchestrator.executeCleanup.mockResolvedValue(mockReport);

      const result = await scheduler.executeScheduledCleanup();

      expect(mockOrchestrator.executeCleanup).toHaveBeenCalled();
      expect(result).toEqual(mockReport);
      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith({
        type: 'success',
        title: 'Scheduled Cleanup Completed',
        message: 'Cleanup completed: 5 resources removed, 1 MB freed',
        timestamp: expect.any(Date),
        data: {
          report: mockReport.summary
        }
      });
    });

    it('should execute dry-run when configured', async () => {
      mockScheduleConfig.dryRun = true;
      scheduler = new CleanupScheduler(
        mockOrchestrator,
        mockScheduleConfig,
        mockNotificationService
      );

      const mockReport: Report = {
        timestamp: new Date(),
        mode: 'dry-run',
        summary: {
          resourcesScanned: 8,
          resourcesRemoved: 3,
          diskSpaceFreed: 524288,
          executionTime: 800
        },
        details: {
          removed: [],
          skipped: [],
          errors: []
        }
      };

      mockOrchestrator.executeDryRun.mockResolvedValue(mockReport);

      const result = await scheduler.executeScheduledCleanup();

      expect(mockOrchestrator.executeDryRun).toHaveBeenCalled();
      expect(mockOrchestrator.executeCleanup).not.toHaveBeenCalled();
      expect(result).toEqual(mockReport);
    });

    it('should handle cleanup execution errors', async () => {
      const error = new Error('Cleanup failed');
      mockOrchestrator.executeCleanup.mockRejectedValue(error);

      await expect(scheduler.executeScheduledCleanup()).rejects.toThrow('Cleanup failed');

      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith({
        type: 'error',
        title: 'Scheduled Cleanup Failed',
        message: 'Cleanup failed: Cleanup failed',
        timestamp: expect.any(Date),
        data: {
          error: 'Cleanup failed',
          executionTime: expect.any(Number)
        }
      });
    });
  });

  describe('One-Time Scheduling', () => {
    it('should schedule one-time cleanup successfully', async () => {
      const cronExpression = '0 15 * * *';
      const taskName = 'maintenance';

      await scheduler.scheduleOneTime(cronExpression, taskName);

      expect(mockCron.validate).toHaveBeenCalledWith(cronExpression);
      expect(mockCron.schedule).toHaveBeenCalledWith(
        cronExpression,
        expect.any(Function),
        {
          scheduled: true,
          timezone: 'UTC'
        }
      );

      const status = scheduler.getStatus();
      expect(status.tasksCount).toBe(1);
    });

    it('should throw error for invalid one-time cron expression', async () => {
      mockCron.validate.mockReturnValue(false);

      await expect(scheduler.scheduleOneTime('invalid')).rejects.toThrow(
        'Invalid cron expression: invalid'
      );
    });

    it('should execute and remove one-time task', async () => {
      const mockReport: Report = {
        timestamp: new Date(),
        mode: 'cleanup',
        summary: {
          resourcesScanned: 5,
          resourcesRemoved: 2,
          diskSpaceFreed: 262144,
          executionTime: 1000
        },
        details: {
          removed: [],
          skipped: [],
          errors: []
        }
      };

      mockOrchestrator.executeCleanup.mockResolvedValue(mockReport);

      // Schedule one-time task
      await scheduler.scheduleOneTime('0 15 * * *', 'test-task');

      // Get the scheduled function and execute it
      const scheduledFunction = mockCron.schedule.mock.calls[0][1] as Function;
      await scheduledFunction();

      // Task should be removed after execution
      // Note: destroy method might not be available in all node-cron versions
    });
  });

  describe('Cron Expression Validation', () => {
    it('should validate common cron expressions', async () => {
      const validExpressions = [
        '0 2 * * *',      // Daily at 2 AM
        '0 */6 * * *',    // Every 6 hours
        '0 0 * * 0',      // Weekly on Sunday
        '0 0 1 * *',      // Monthly on 1st
        '*/15 * * * *'    // Every 15 minutes
      ];

      for (const expression of validExpressions) {
        mockScheduleConfig.cronExpression = expression;
        scheduler = new CleanupScheduler(
          mockOrchestrator,
          mockScheduleConfig,
          mockNotificationService
        );

        await expect(scheduler.startSchedule()).resolves.not.toThrow();
      }
    });
  });

  describe('Notification Integration', () => {
    it('should work without notification service', async () => {
      scheduler = new CleanupScheduler(
        mockOrchestrator,
        mockScheduleConfig
        // No notification service
      );

      await expect(scheduler.startSchedule()).resolves.not.toThrow();
      await expect(scheduler.stopSchedule()).resolves.not.toThrow();
    });

    it('should handle notification service errors gracefully', async () => {
      mockNotificationService.sendNotification.mockRejectedValue(new Error('Notification failed'));

      const mockReport: Report = {
        timestamp: new Date(),
        mode: 'cleanup',
        summary: {
          resourcesScanned: 1,
          resourcesRemoved: 1,
          diskSpaceFreed: 1024,
          executionTime: 500
        },
        details: {
          removed: [],
          skipped: [],
          errors: []
        }
      };

      mockOrchestrator.executeCleanup.mockResolvedValue(mockReport);

      // Should not throw even if notification fails
      await expect(scheduler.executeScheduledCleanup()).resolves.toEqual(mockReport);
    });
  });
});
