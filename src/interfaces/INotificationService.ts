/**
 * Notification message interface
 */
export interface NotificationMessage {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  data?: any;
}

/**
 * Interface for notification services
 */
export interface INotificationService {
  /**
   * Send a notification
   */
  sendNotification(message: NotificationMessage): Promise<void>;

  /**
   * Test notification service connectivity
   */
  testConnection(): Promise<boolean>;
}
