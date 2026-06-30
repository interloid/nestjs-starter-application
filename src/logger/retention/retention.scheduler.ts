import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { resolve } from 'node:path';
import { CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import {
  LOGGER_OPTIONS,
  type LoggerFileOptions,
  type LoggerOptions,
  LoggerService,
} from '../logger.service';
import { cleanupOldLogFiles } from './retention';

const CRON_JOB_NAME = 'log-retention-cleanup';
const DEFAULT_CRON = CronExpression.EVERY_10_HOURS;
const DEFAULT_LOGS_DIRECTORY = './logs';

@Injectable()
export class RetentionScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  constructor(
    @Inject(LOGGER_OPTIONS)
    private readonly options: LoggerOptions,
    private readonly logger: LoggerService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.isRetentionEnabled()) {
      return;
    }
    this.registerCronJob();
    await this.runCleanup();
  }

  onModuleDestroy(): void {
    const exists = this.schedulerRegistry.doesExist('cron', CRON_JOB_NAME);
    if (exists) {
      this.schedulerRegistry.deleteCronJob(CRON_JOB_NAME);
    }
  }

  private registerCronJob(): void {
    const cronExpression = this.resolveCronExpression();
    const retentionDays = this.resolveRetentionDays();

    const job = new CronJob(cronExpression, () => {
      void this.runCleanup();
    });

    this.schedulerRegistry.addCronJob(CRON_JOB_NAME, job);
    job.start();

    this.logger.info('Log retention scheduler registered', {
      cronExpression,
      retentionDays,
    });
  }

  private resolveCronExpression(): string {
    const fileOpts = this.options.file;
    if (fileOpts === undefined) {
      return DEFAULT_CRON;
    }
    if (fileOpts.cleanupCron === undefined) {
      return DEFAULT_CRON;
    }
    return fileOpts.cleanupCron;
  }

  private resolveRetentionDays(): number | undefined {
    const fileOpts = this.options.file;
    if (fileOpts === undefined) {
      return undefined;
    }
    return fileOpts.retentionDays;
  }

  private resolveDirectory(fileOpts: LoggerFileOptions): string {
    if (fileOpts.directory === undefined) {
      return resolve(DEFAULT_LOGS_DIRECTORY);
    }
    return resolve(fileOpts.directory);
  }

  private isRetentionEnabled(): boolean {
    const fileOpts = this.options.file;
    if (fileOpts === undefined) {
      return false;
    }
    if (fileOpts.retentionDays === undefined) {
      return false;
    }
    if (fileOpts.retentionDays <= 0) {
      return false;
    }
    return true;
  }

  private async runCleanup(): Promise<void> {
    const fileOpts = this.options.file as LoggerFileOptions;
    const directory = this.resolveDirectory(fileOpts);
    const days = fileOpts.retentionDays as number;

    try {
      const result = await cleanupOldLogFiles(directory, days);

      this.logger.info('Log retention cleanup complete', {
        directory,
        retentionDays: days,
        scanned: result.scanned,
        deleted: result.deleted,
        errorCount: result.errors.length,
      });

      if (result.errors.length > 0) {
        this.logger.warn('Some log files could not be deleted', {
          errors: result.errors,
        });
      }
    } catch (err) {
      const errorMessage = this.stringifyError(err);
      this.logger.error('Log retention cleanup failed', {
        directory,
        err: errorMessage,
      });
    }
  }

  private stringifyError(err: unknown): string {
    if (err instanceof Error) {
      return err.message;
    }
    return String(err);
  }
}
