import { INotificationService, NotificationMessage } from '../interfaces';
import { NotificationConfig } from '../types';
import axios from 'axios';
import winston from 'winston';

/**
 * Simple notification service implementation
 * Supports webhook notifications (can be extended for email, Slack, etc.)
 */
export class NotificationService implements INotificationService {
  private config: NotificationConfig;
  private logger: winston.Logger;

  constructor(config: NotificationConfig) {
    this.config = config;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'logs/notifications.log' }),
        new winston.transports.Console()
      ]
    });
  }

  /**
   * Send a notification
   */
  async sendNotification(message: NotificationMessage): Promise<void> {
    if (!this.config.enabled) {
      this.logger.debug('Notifications disabled, skipping', { message });
      return;
    }

    // Check if we should send this type of notification
    if (!this.shouldSendNotification(message.type)) {
      this.logger.debug('Notification type disabled, skipping', {
        type: message.type,
        title: message.title
      });
      return;
    }

    this.logger.info('Sending notification', {
      type: message.type,
      title: message.title
    });

    try {
      // Send webhook notification if configured
      if (this.config.webhookUrl) {
        await this.sendWebhookNotification(message);
      }

      // Send email notification if configured
      if (this.config.emailRecipients && this.config.emailRecipients.length > 0) {
        await this.sendEmailNotification(message);
      }

      // Send Slack notification if configured
      if (this.config.slackChannel) {
        await this.sendSlackNotification(message);
      }

      this.logger.info('Notification sent successfully', {
        type: message.type,
        title: message.title
      });

    } catch (error) {
      this.logger.error('Failed to send notification', {
        error: error instanceof Error ? error.message : String(error),
        message: message.title
      });

      // Don't throw error - notification failures shouldn't break cleanup
    }
  }

  /**
   * Test notification service connectivity
   */
  async testConnection(): Promise<boolean> {
    this.logger.info('Testing notification service connectivity');

    try {
      const testMessage: NotificationMessage = {
        type: 'info',
        title: 'Test Notification',
        message: 'This is a test notification from Proxmox Cleanup System',
        timestamp: new Date()
      };

      await this.sendNotification(testMessage);

      this.logger.info('Notification service test successful');
      return true;

    } catch (error) {
      this.logger.error('Notification service test failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Check if we should send notification based on type and config
   */
  private shouldSendNotification(type: NotificationMessage['type']): boolean {
    switch (type) {
    case 'success':
      return this.config.onSuccess;
    case 'error':
      return this.config.onFailure;
    case 'info':
      return this.config.onStart;
    case 'warning':
      return true; // Always send warnings
    default:
      return false;
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(message: NotificationMessage): Promise<void> {
    if (!this.config.webhookUrl) return;

    const payload = {
      type: message.type,
      title: message.title,
      message: message.message,
      timestamp: message.timestamp.toISOString(),
      data: message.data,
      source: 'proxmox-cleanup'
    };

    await axios.post(this.config.webhookUrl, payload, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Proxmox-Cleanup/1.0.0'
      }
    });

    this.logger.debug('Webhook notification sent', {
      url: this.config.webhookUrl,
      type: message.type
    });
  }

  /**
   * Send email notification (placeholder implementation)
   */
  private async sendEmailNotification(message: NotificationMessage): Promise<void> {
    // This is a placeholder - in a real implementation you would integrate
    // with an email service like SendGrid, AWS SES, or SMTP
    this.logger.info('Email notification would be sent', {
      recipients: this.config.emailRecipients,
      subject: message.title,
      type: message.type
    });

    // For now, just log the email content
    this.logger.debug('Email content', {
      to: this.config.emailRecipients,
      subject: `[${message.type.toUpperCase()}] ${message.title}`,
      body: `${message.message}\n\nTimestamp: ${message.timestamp.toISOString()}${
        message.data ? `\n\nData: ${JSON.stringify(message.data, null, 2)}` : ''
      }`
    });
  }

  /**
   * Send Slack notification (placeholder implementation)
   */
  private async sendSlackNotification(message: NotificationMessage): Promise<void> {
    // This is a placeholder - in a real implementation you would integrate
    // with Slack's webhook API or Bot API
    this.logger.info('Slack notification would be sent', {
      channel: this.config.slackChannel,
      title: message.title,
      type: message.type
    });

    // For now, just log the Slack message content
    const emoji = this.getSlackEmoji(message.type);
    const slackMessage = {
      channel: this.config.slackChannel,
      text: `${emoji} *${message.title}*`,
      attachments: [
        {
          color: this.getSlackColor(message.type),
          text: message.message,
          ts: Math.floor(message.timestamp.getTime() / 1000)
        }
      ]
    };

    this.logger.debug('Slack message content', slackMessage);
  }

  /**
   * Get Slack emoji for message type
   */
  private getSlackEmoji(type: NotificationMessage['type']): string {
    const emojis = {
      success: ':white_check_mark:',
      error: ':x:',
      warning: ':warning:',
      info: ':information_source:'
    };
    return emojis[type] || ':speech_balloon:';
  }

  /**
   * Get Slack color for message type
   */
  private getSlackColor(type: NotificationMessage['type']): string {
    const colors = {
      success: 'good',
      error: 'danger',
      warning: 'warning',
      info: '#36a64f'
    };
    return colors[type] || '#36a64f';
  }
}
