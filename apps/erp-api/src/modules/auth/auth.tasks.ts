import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthService } from './auth.service';

@Injectable()
export class AuthTasksService {
  private readonly logger = new Logger(AuthTasksService.name);

  constructor(private readonly authService: AuthService) {}

  // Run every hour to clean up expired sessions
  @Cron(CronExpression.EVERY_HOUR)
  async handleSessionCleanup() {
    this.logger.log('Running expired session cleanup...');
    try {
      await this.authService.cleanupExpiredSessions();
      this.logger.log('Expired session cleanup completed');
    } catch (error) {
      this.logger.error('Error during session cleanup:', error);
    }
  }
}
