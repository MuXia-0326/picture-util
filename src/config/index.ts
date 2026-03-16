import * as dotenv from 'dotenv';
import { Config } from '../types';

// 加载环境变量
dotenv.config();

/**
 * 加载配置
 */
export function loadConfig(): Config {
  return {
    db: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'image_organizer',
    },
    snowflake: {
      workerId: parseInt(process.env.SNOWFLAKE_WORKER_ID || '1', 10),
      datacenterId: parseInt(process.env.SNOWFLAKE_DATACENTER_ID || '1', 10),
    },
    paths: {
      sourceDir: process.env.SOURCE_DIR || '',
      targetDir: process.env.TARGET_DIR || '',
    },
    categories: {
      categoryA: {
        name: process.env.CATEGORY_A_NAME || 'CategoryA',
        regex: new RegExp(process.env.CATEGORY_A_REGEX || '', 'i'),
      },
      categoryB: {
        name: process.env.CATEGORY_B_NAME || 'CategoryB',
        regex: new RegExp(process.env.CATEGORY_B_REGEX || '', 'i'),
      },
      default: process.env.DEFAULT_CATEGORY || 'Other',
    },
  };
}

/**
 * 验证配置
 */
export function validateConfig(config: Config): void {
  const errors: string[] = [];

  if (!config.paths.sourceDir) {
    errors.push('SOURCE_DIR is required');
  }

  if (!config.paths.targetDir) {
    errors.push('TARGET_DIR is required');
  }

  if (!config.db.password) {
    errors.push('DB_PASSWORD is required');
  }

  if (!process.env.CATEGORY_A_REGEX) {
    errors.push('CATEGORY_A_REGEX is required');
  }

  if (!process.env.CATEGORY_B_REGEX) {
    errors.push('CATEGORY_B_REGEX is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}
