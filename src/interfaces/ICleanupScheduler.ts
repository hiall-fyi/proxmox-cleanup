import { Report, ScheduleConfig } from '../types';

/**
 * Interface for cleanup scheduler
 */
export interface ICleanupScheduler {
  /**
   * Start scheduled cleanup operations
   */
  startSchedule(): Promise<void>;

  /**
   * Stop scheduled cleanup operations
   */
  stopSchedule(): Promise<void>;

  /**
   * Get scheduler status
   */
  getStatus(): { running: boolean; nextRun?: Date; tasksCount: number };

  /**
   * Execute a one-time scheduled cleanup
   */
  executeScheduledCleanup(): Promise<Report>;

  /**
   * Update schedule configuration
   */
  updateSchedule(newConfig: Partial<ScheduleConfig>): Promise<void>;

  /**
   * Add a one-time scheduled cleanup
   */
  scheduleOneTime(cronExpression: string, taskName?: string): Promise<void>;
}
