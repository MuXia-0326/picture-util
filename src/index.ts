import { Command } from 'commander';
import ora from 'ora';
import { loadConfig, validateConfig } from './config';
import { initSnowflake } from './utils/snowflake';
import { logger } from './utils/logger';
import { scanDirectory } from './services/scanner';
import { Classifier } from './services/classifier';
import { DatabaseService } from './services/database';
import { FileOrganizer } from './services/organizer';
import { DuplicateLogger } from './utils/duplicate-logger';
import { ClassifiedFile } from './types';

/**
 * 主程序入口
 */
async function main() {
  const program = new Command();

  program
    .name('image-organizer')
    .description('图片文件整理工具 - 按分类和时间整理图片并记录到MySQL数据库')
    .version('1.0.0');

  program
    .command('organize')
    .description('扫描并整理图片文件')
    .option('-m, --move', '移动文件后删除源文件（默认为复制）', false)
    .option('-d, --dry-run', '试运行模式，不实际移动文件和写入数据库', false)
    .action(async (options) => {
      await organizeImages(options.move, options.dryRun);
    });

  program
    .command('stats')
    .description('查看数据库统计信息')
    .action(async () => {
      await showStats();
    });

  program.parse();
}

/**
 * 整理图片文件
 */
async function organizeImages(moveFiles: boolean, dryRun: boolean) {
  const spinner = ora();

  try {
    // 加载并验证配置
    spinner.start('加载配置...');
    const config = loadConfig();
    validateConfig(config);
    spinner.succeed('配置加载成功');

    // 初始化雪花算法
    initSnowflake(config.snowflake.workerId, config.snowflake.datacenterId);

    // 初始化数据库
    const db = new DatabaseService(config.db);
    spinner.start('测试数据库连接...');
    await db.testConnection();
    spinner.succeed('数据库连接成功');

    // 扫描源目录
    spinner.start(`扫描目录: ${config.paths.sourceDir}`);
    const scannedFiles = await scanDirectory(config.paths.sourceDir);
    spinner.succeed(`扫描完成，找到 ${scannedFiles.length} 个图片文件`);

    if (scannedFiles.length === 0) {
      logger.warning('没有找到图片文件');
      await db.close();
      return;
    }

    // 分类和计算哈希
    spinner.start('分类并计算文件哈希...');
    const classifier = new Classifier(
      config.categories.categoryA.name,
      config.categories.categoryA.regex,
      config.categories.categoryB.name,
      config.categories.categoryB.regex,
      config.categories.default
    );

    const classifiedFiles: ClassifiedFile[] = [];
    for (const file of scannedFiles) {
      const classified = await classifier.classifyFile(file);
      classifiedFiles.push(classified);
    }
    spinner.succeed('分类完成');

    // 去重检查
    spinner.start('检查重复文件...');
    const newFiles: ClassifiedFile[] = [];
    const duplicates: ClassifiedFile[] = [];

    for (const file of classifiedFiles) {
      const exists = await db.fileExists(file.fileHash);
      if (exists) {
        duplicates.push(file);
      } else {
        newFiles.push(file);
      }
    }

    // 检查 newFiles 内部是否有重复的哈希值
    const hashSet = new Set<string>();
    const uniqueNewFiles: ClassifiedFile[] = [];
    const internalDuplicates: ClassifiedFile[] = [];

    for (const file of newFiles) {
      if (hashSet.has(file.fileHash)) {
        internalDuplicates.push(file);
      } else {
        hashSet.add(file.fileHash);
        uniqueNewFiles.push(file);
      }
    }

    if (internalDuplicates.length > 0) {
      logger.warning(`发现 ${internalDuplicates.length} 个源目录内的重复文件(相同哈希):`);
      internalDuplicates.slice(0, 5).forEach((f) => logger.warning(`  - ${f.fileName}`));
      if (internalDuplicates.length > 5) {
        logger.warning(`  ... 以及其他 ${internalDuplicates.length - 5} 个文件`);
      }
      duplicates.push(...internalDuplicates);
    }

    spinner.succeed(
      `去重完成 - 新文件: ${uniqueNewFiles.length}, 重复文件: ${duplicates.length}`
    );

    if (duplicates.length > 0) {
      logger.info(`跳过 ${duplicates.length} 个重复文件:`);
      duplicates.slice(0, 5).forEach((f) => logger.info(`  - ${f.fileName}`));
      if (duplicates.length > 5) {
        logger.info(`  ... 以及其他 ${duplicates.length - 5} 个文件`);
      }

      // 生成重复文件日志
      spinner.start('生成重复文件日志...');
      const duplicateLogger = new DuplicateLogger('logs');
      const logFilePath = await duplicateLogger.generateDuplicateLog(duplicates, db);
      spinner.succeed(`重复文件日志已生成: ${logFilePath}`);
    }

    if (uniqueNewFiles.length === 0) {
      logger.warning('没有新文件需要处理');
      await db.close();
      return;
    }

    // 整理文件
    if (!dryRun) {
      spinner.start('整理文件...');
      const organizer = new FileOrganizer(config.paths.targetDir);
      const result = await organizer.organizeFiles(uniqueNewFiles);
      spinner.succeed(
        `文件整理完成 - 成功: ${result.success}, 失败: ${result.failed}`
      );

      if (result.failed > 0) {
        logger.warning(`${result.failed} 个文件整理失败:`);
        result.errors.forEach((e) => logger.warning(`  - ${e.file}: ${e.error}`));
      }

      // 如果需要删除源文件,只删除成功整理的文件
      if (moveFiles && result.successfulFiles.length > 0) {
        spinner.start('删除源文件...');
        let deleted = 0;
        for (const file of result.successfulFiles) {
          try {
            await organizer.deleteSourceFile(file.filePath);
            deleted++;
          } catch (error) {
            logger.error(`删除源文件失败: ${file.fileName}`, error as Error);
          }
        }
        spinner.succeed(`删除源文件完成 - 删除: ${deleted}`);
      }
    } else {
      logger.info('[试运行] 跳过文件整理');
    }

    // 写入数据库
    if (!dryRun) {
      spinner.start('写入数据库...');
      await db.batchInsertFiles(uniqueNewFiles);
      spinner.succeed(`数据库记录创建完成`);
    } else {
      logger.info('[试运行] 跳过数据库写入');
    }

    // 显示统计
    logger.info('\n--- 处理摘要 ---');
    logger.info(`总计扫描: ${scannedFiles.length} 个文件`);
    logger.info(`新文件: ${uniqueNewFiles.length} 个`);
    logger.info(`重复文件: ${duplicates.length} 个`);

    // 按分类统计
    const categoryStats = uniqueNewFiles.reduce((acc, file) => {
      acc[file.category] = (acc[file.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    logger.info('\n按分类统计:');
    Object.entries(categoryStats).forEach(([category, count]) => {
      logger.info(`  ${category}: ${count} 个文件`);
    });

    await db.close();
    spinner.stop();

    logger.success('\n✓ 整理完成！');
  } catch (error) {
    spinner.fail('处理失败');
    logger.error('发生错误', error as Error);
    console.error('\n完整错误堆栈:');
    console.error(error);
    process.exit(1);
  }
}

/**
 * 显示统计信息
 */
async function showStats() {
  const spinner = ora();

  try {
    spinner.start('加载配置...');
    const config = loadConfig();
    spinner.succeed('配置加载成功');

    const db = new DatabaseService(config.db);
    spinner.start('连接数据库...');
    await db.testConnection();
    spinner.succeed('数据库连接成功');

    spinner.start('获取统计信息...');
    const stats = await db.getStats();
    spinner.succeed('统计信息获取成功');

    logger.info('\n--- 数据库统计 ---');
    logger.info(`总计文件数: ${stats.total}`);
    logger.info('\n按分类统计:');
    stats.byCategory.forEach((item) => {
      logger.info(`  ${item.category}: ${item.count} 个文件`);
    });

    await db.close();
  } catch (error) {
    spinner.fail('获取统计失败');
    logger.error('发生错误', error as Error);
    console.error('\n完整错误堆栈:');
    console.error(error);
    process.exit(1);
  }
}

// 启动程序
main().catch((error) => {
  logger.error('程序异常退出', error);
  process.exit(1);
});
