import chalk from 'chalk';

export enum LogLevel {
  INFO = 'INFO',
  SUCCESS = 'SUCCESS',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG',
}

class Logger {
  private enableDebug = process.env.DEBUG === 'true';

  info(message: string): void {
    console.log(chalk.blue(`[${LogLevel.INFO}]`), message);
  }

  success(message: string): void {
    console.log(chalk.green(`[${LogLevel.SUCCESS}]`), message);
  }

  warning(message: string): void {
    console.log(chalk.yellow(`[${LogLevel.WARNING}]`), message);
  }

  error(message: string, error?: Error): void {
    console.log(chalk.red(`[${LogLevel.ERROR}]`), message);
    if (error && this.enableDebug) {
      console.log(chalk.red(error.stack || error.message));
    }
  }

  debug(message: string): void {
    if (this.enableDebug) {
      console.log(chalk.gray(`[${LogLevel.DEBUG}]`), message);
    }
  }
}

export const logger = new Logger();
