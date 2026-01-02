import * as cron from 'node-cron';
import { CleanupOrchestrator } from '../orchestrators/CleanupOrchestrator';
import { Report, ScheduleConfig } from '../types';
import { ICleanupScheduler, INotificationService } from '../interfaces';
import winston from 'winston';

/**
 * Scheduler for automated cleanup operations
 */
export class CleanupScheduler implements ICleanupScheduler {
  private orchestrator: CleanupOrchestrator;
  private scheduleConfig: ScheduleConfig;
  private notificationService?: INotificationService;
  private logger: winston.Logger;
  private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();

  constructor(
    orchestrator: CleanupOrchestrator,
    scheduleConfig: ScheduleConfig,
    notificationService?: INotificationService
  ) {
    this.orchestrator = orchestrator;
    this.scheduleConfig = scheduleConfig;
    this.notificationService = notificationService;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'logs/scheduler.log' }),
        new winston.transports.Console()
      ]
    });
  }

  /**
   * Start scheduled cleanup operations
   */
  async startSchedule(): Promise<void> {
    if (!this.scheduleConfig.enabled) {
      this.logger.info('Scheduler is disabled');
      return;
    }

    this.logger.info('Starting cleanup scheduler', {
      cronExpression: this.scheduleConfig.cronExpression,
      dryRun: this.scheduleConfig.dryRun
    });

    // Validate cron expression
    if (!cron.validate(this.scheduleConfig.cronExpression)) {
      throw new Error(`Invalid cron expression: ${this.scheduleConfig.cronExpression}`);
    }

    // Create scheduled task
    const task = cron.schedule(
      this.scheduleConfig.cronExpression,
      async () => {
        await this.executeScheduledCleanup();
      },
      {
        scheduled: false, // Don't start immediately
        timezone: this.scheduleConfig.timezone || 'UTC'
      }
    );

    this.scheduledTasks.set('main', task);

    // Start the task
    task.start();

    this.logger.info('Cleanup scheduler started successfully');

    // Send startup notification
    if (this.notificationService) {
      try {
        await this.notificationService.sendNotification({
          type: 'info',
          title: 'Cleanup Scheduler Started',
          message: `Scheduled cleanup will run: ${this.scheduleConfig.cronExpression}`,
          timestamp: new Date()
        });
      } catch (notificationError) {
        this.logger.warn('Failed to send startup notification', {
          error: notificationError instanceof Error ? notificationError.message : String(notificationError)
        });
      }
    }
  }

  /**
   * Stop scheduled cleanup operations
   */
  async stopSchedule(): Promise<void> {
    this.logger.info('Stopping cleanup scheduler');

    // Stop all scheduled tasks
    for (const [name, task] of this.scheduledTasks) {
      task.stop();
      // Note: destroy() method may not be available in all node-cron versions
      if ('destroy' in task && typeof task.destroy === 'function') {
        (task as any).destroy();
      }
      this.logger.info(`Stopped scheduled task: ${name}`);
    }

    this.scheduledTasks.clear();

    this.logger.info('Cleanup scheduler stopped');

    // Send shutdown notification
    if (this.notificationService) {
      try {
        await this.notificationService.sendNotification({
          type: 'info',
          title: 'Cleanup Scheduler Stopped',
          message: 'Scheduled cleanup operations have been stopped',
          timestamp: new Date()
        });
      } catch (notificationError) {
        this.logger.warn('Failed to send shutdown notification', {
          error: notificationError instanceof Error ? notificationError.message : String(notificationError)
        });
      }
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): { running: boolean; nextRun?: Date; tasksCount: number } {
    const mainTask = this.scheduledTasks.get('main');

    return {
      running: mainTask ? true : false, // Simplified check since getStatus may not exist
      nextRun: mainTask ? this.getNextRunTime() : undefined,
      tasksCount: this.scheduledTasks.size
    };
  }

  /**
   * Execute a one-time scheduled cleanup
   */
  async executeScheduledCleanup(): Promise<Report> {
    const startTime = Date.now();

    this.logger.info('Starting scheduled cleanup execution');

    try {
      // Execute cleanup (dry-run or actual based on config)
      const report = this.scheduleConfig.dryRun
        ? await this.orchestrator.executeDryRun()
        : await this.orchestrator.executeCleanup();

      const executionTime = Date.now() - startTime;

      this.logger.info('Scheduled cleanup completed successfully', {
        mode: report.mode,
        resourcesScanned: report.summary.resourcesScanned,
        resourcesRemoved: report.summary.resourcesRemoved,
        diskSpaceFreed: report.summary.diskSpaceFreed,
        executionTime
      });

      // Send success notification
      if (this.notificationService) {
        try {
          await this.notificationService.sendNotification({
            type: 'success',
            title: 'Scheduled Cleanup Completed',
            message: this.formatSuccessMessage(report),
            timestamp: new Date(),
            data: {
              report: report.summary
            }
          });
        } catch (notificationError) {
          this.logger.warn('Failed to send success notification', {
            error: notificationError instanceof Error ? notificationError.message : String(notificationError)
          });
        }
      }

      return report;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error('Scheduled cleanup failed', {
        error: errorMessage,
        executionTime
      });

      // Send failure notification
      if (this.notificationService) {
        try {
          await this.notificationService.sendNotification({
            type: 'error',
            title: 'Scheduled Cleanup Failed',
            message: `Cleanup failed: ${errorMessage}`,
            timestamp: new Date(),
            data: {
              error: errorMessage,
              executionTime
            }
          });
        } catch (notificationError) {
          this.logger.warn('Failed to send failure notification', {
            error: notificationError instanceof Error ? notificationError.message : String(notificationError)
          });
        }
      }

      throw error;
    }
  }

  /**
   * Update schedule configuration
   */
  async updateSchedule(newConfig: Partial<ScheduleConfig>): Promise<void> {
    this.logger.info('Updating schedule configuration', newConfig);

    // Stop current schedule
    await this.stopSchedule();

    // Update configuration
    this.scheduleConfig = { ...this.scheduleConfig, ...newConfig };

    // Restart with new configuration if enabled
    if (this.scheduleConfig.enabled) {
      await this.startSchedule();
    }

    this.logger.info('Schedule configuration updated successfully');
  }

  /**
   * Add a one-time scheduled cleanup
   */
  async scheduleOneTime(cronExpression: string, taskName: string = 'oneTime'): Promise<void> {
    this.logger.info('Scheduling one-time cleanup', {
      cronExpression,
      taskName
    });

    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    // Create one-time task
    const task = cron.schedule(
      cronExpression,
      async () => {
        try {
          await this.executeScheduledCleanup();

          // Remove task after execution
          this.scheduledTasks.delete(taskName);
          if ('destroy' in task && typeof task.destroy === 'function') {
            (task as any).destroy();
          }

          this.logger.info(`One-time task completed and removed: ${taskName}`);
        } catch (error) {
          this.logger.error(`One-time task failed: ${taskName}`, { error });

          // Still remove the task even if it failed
          this.scheduledTasks.delete(taskName);
          if ('destroy' in task && typeof task.destroy === 'function') {
            (task as any).destroy();
          }
        }
      },
      {
        scheduled: true,
        timezone: this.scheduleConfig.timezone || 'UTC'
      }
    );

    this.scheduledTasks.set(taskName, task);

    this.logger.info(`One-time cleanup scheduled: ${taskName}`);
  }

  /**
   * Get next run time for the main scheduled task
   */
  private getNextRunTime(): Date | undefined {
    const mainTask = this.scheduledTasks.get('main');
    if (!mainTask) return undefined;

    // Parse cron expression to calculate next run
    // This is a simplified implementation - in production you might want to use a more robust cron parser
    try {
      const now = new Date();
      const nextRun = new Date(now.getTime() + 60000); // Simplified: next minute
      return nextRun;
    } catch (error) {
      this.logger.warn('Could not calculate next run time', { error });
      return undefined;
    }
  }

  /**
   * Format success message for notifications
   */
  private formatSuccessMessage(report: Report): string {
    const mode = report.mode === 'dry-run' ? 'Dry-run' : 'Cleanup';
    const spaceFreed = this.formatBytes(report.summary.diskSpaceFreed);

    return `${mode} completed: ${report.summary.resourcesRemoved} resources removed, ${spaceFreed} freed`;
  }

  /**
   * Format bytes to human readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
