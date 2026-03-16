const path = require('path');

// 动态导入 TypeScript 编译后的模块
const { scanDirectory } = require('../../dist/services/scanner');
const { Classifier } = require('../../dist/services/classifier');
const { DatabaseService } = require('../../dist/services/database');
const { FileOrganizer } = require('../../dist/services/organizer');
const { DuplicateLogger } = require('../../dist/utils/duplicate-logger');
const { initSnowflake } = require('../../dist/utils/snowflake');

/**
 * 执行图片整理任务
 */
async function organizeImagesTask(options, onProgress) {
  const { config, moveFiles, dryRun } = options;

  try {
    onProgress({ type: 'info', message: '开始整理任务...' });

    // 初始化雪花算法
    initSnowflake(config.snowflake.workerId, config.snowflake.datacenterId);

    // 初始化数据库
    const db = new DatabaseService(config.db);
    onProgress({ type: 'info', message: '测试数据库连接...' });
    await db.testConnection();
    onProgress({ type: 'success', message: '数据库连接成功' });

    // 扫描源目录
    onProgress({ type: 'info', message: `扫描目录: ${config.paths.sourceDir}` });
    const scannedFiles = await scanDirectory(config.paths.sourceDir);
    onProgress({ type: 'success', message: `扫描完成，找到 ${scannedFiles.length} 个图片文件` });

    if (scannedFiles.length === 0) {
      await db.close();
      return { success: true, message: '没有找到图片文件' };
    }

    // 分类和计算哈希
    onProgress({ type: 'info', message: '分类并计算文件哈希...' });
    const classifier = new Classifier(
      config.categories.categoryA.name,
      new RegExp(config.categories.categoryA.regex, 'i'),
      config.categories.categoryB.name,
      new RegExp(config.categories.categoryB.regex, 'i'),
      config.categories.default
    );

    const classifiedFiles = [];
    for (const file of scannedFiles) {
      const classified = await classifier.classifyFile(file);
      classifiedFiles.push(classified);
    }
    onProgress({ type: 'success', message: '分类完成' });

    // 去重检查
    onProgress({ type: 'info', message: '检查重复文件...' });
    const newFiles = [];
    const duplicates = [];

    for (const file of classifiedFiles) {
      const exists = await db.fileExists(file.fileHash);
      if (exists) {
        duplicates.push(file);
      } else {
        newFiles.push(file);
      }
    }

    // 检查内部重复
    const hashSet = new Set();
    const uniqueNewFiles = [];
    const internalDuplicates = [];

    for (const file of newFiles) {
      if (hashSet.has(file.fileHash)) {
        internalDuplicates.push(file);
      } else {
        hashSet.add(file.fileHash);
        uniqueNewFiles.push(file);
      }
    }

    if (internalDuplicates.length > 0) {
      duplicates.push(...internalDuplicates);
    }

    onProgress({
      type: 'success',
      message: `去重完成 - 新文件: ${uniqueNewFiles.length}, 重复文件: ${duplicates.length}`
    });

    if (duplicates.length > 0) {
      onProgress({ type: 'info', message: '生成重复文件日志...' });
      const duplicateLogger = new DuplicateLogger('logs');
      const logFilePath = await duplicateLogger.generateDuplicateLog(duplicates, db);
      onProgress({ type: 'success', message: `重复文件日志已生成: ${logFilePath}` });
    }

    if (uniqueNewFiles.length === 0) {
      await db.close();
      return { success: true, message: '没有新文件需要处理' };
    }

    // 整理文件
    if (!dryRun) {
      onProgress({ type: 'info', message: '整理文件...' });
      const organizer = new FileOrganizer(config.paths.targetDir);
      const result = await organizer.organizeFiles(uniqueNewFiles);
      onProgress({
        type: 'success',
        message: `文件整理完成 - 成功: ${result.success}, 失败: ${result.failed}`
      });

      if (result.failed > 0) {
        result.errors.forEach((e) => {
          onProgress({ type: 'warning', message: `${e.file}: ${e.error}` });
        });
      }

      // 删除源文件
      if (moveFiles && result.successfulFiles.length > 0) {
        onProgress({ type: 'info', message: '删除源文件...' });
        let deleted = 0;
        for (const file of result.successfulFiles) {
          try {
            await organizer.deleteSourceFile(file.filePath);
            deleted++;
          } catch (error) {
            onProgress({ type: 'error', message: `删除源文件失败: ${file.fileName}` });
          }
        }
        onProgress({ type: 'success', message: `删除源文件完成 - 删除: ${deleted}` });
      }

      // 写入数据库
      onProgress({ type: 'info', message: '写入数据库...' });
      await db.batchInsertFiles(uniqueNewFiles);
      onProgress({ type: 'success', message: '数据库记录创建完成' });
    } else {
      onProgress({ type: 'info', message: '[试运行] 跳过文件整理和数据库写入' });
    }

    // 统计信息
    const categoryStats = uniqueNewFiles.reduce((acc, file) => {
      acc[file.category] = (acc[file.category] || 0) + 1;
      return acc;
    }, {});

    await db.close();

    return {
      success: true,
      summary: {
        total: scannedFiles.length,
        newFiles: uniqueNewFiles.length,
        duplicates: duplicates.length,
        categoryStats
      }
    };
  } catch (error) {
    onProgress({ type: 'error', message: `错误: ${error.message}` });
    throw error;
  }
}

/**
 * 获取统计信息
 */
async function getStatsTask(config) {
  // 使用传入的配置，而不是从 .env 加载
  const db = new DatabaseService(config.db);
  await db.testConnection();

  const stats = await db.getStats();
  await db.close();

  return stats;
}

module.exports = {
  organizeImagesTask,
  getStatsTask
};
