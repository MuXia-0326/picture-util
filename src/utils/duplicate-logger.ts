import * as fs from 'fs/promises';
import * as path from 'path';
import { ClassifiedFile } from '../types';
import { DatabaseService } from '../services/database';

/**
 * 重复文件日志记录器
 */
export class DuplicateLogger {
  private logDir: string;

  constructor(logDir: string = 'logs') {
    this.logDir = logDir;
  }

  /**
   * 生成重复文件日志
   */
  async generateDuplicateLog(
    duplicates: ClassifiedFile[],
    db: DatabaseService
  ): Promise<string> {
    // 确保日志目录存在
    await fs.mkdir(this.logDir, { recursive: true });

    // 生成日志文件名（包含时间戳）
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const logFilePath = path.join(this.logDir, `duplicates-${timestamp}.log`);

    // 按哈希值分组重复文件
    const duplicatesByHash = new Map<string, ClassifiedFile[]>();
    for (const file of duplicates) {
      if (!duplicatesByHash.has(file.fileHash)) {
        duplicatesByHash.set(file.fileHash, []);
      }
      duplicatesByHash.get(file.fileHash)!.push(file);
    }

    // 生成日志内容
    const logLines: string[] = [];
    logLines.push('='.repeat(80));
    logLines.push('重复文件日志报告');
    logLines.push(`生成时间: ${new Date().toLocaleString('zh-CN')}`);
    logLines.push(`总重复文件数: ${duplicates.length}`);
    logLines.push(`重复哈希组数: ${duplicatesByHash.size}`);
    logLines.push('='.repeat(80));
    logLines.push('');

    let groupIndex = 1;
    for (const [hash, files] of duplicatesByHash) {
      logLines.push(`--- 重复组 ${groupIndex} ---`);
      logLines.push(`哈希值: ${hash}`);
      logLines.push(`重复文件数: ${files.length}`);

      // 查询数据库中是否已存在此哈希的文件
      const existingFile = await db.getFileByHash(hash);
      if (existingFile) {
        logLines.push(`数据库中已存在: ${existingFile.fileName}`);
        logLines.push(`  - 分类: ${existingFile.category}`);
        logLines.push(`  - 大小: ${this.formatFileSize(Number(existingFile.fileSize))}`);
        logLines.push(`  - 修改时间: ${existingFile.modifiedTime.toLocaleString('zh-CN')}`);
        logLines.push(`  - 录入时间: ${existingFile.createdAt.toLocaleString('zh-CN')}`);
      }

      logLines.push('当前扫描到的重复文件:');
      for (const file of files) {
        logLines.push(`  - ${file.fileName}`);
        logLines.push(`    路径: ${file.filePath}`);
        logLines.push(`    分类: ${file.category}`);
        logLines.push(`    大小: ${this.formatFileSize(Number(file.fileSize))}`);
        logLines.push(`    修改时间: ${file.modifiedTime.toLocaleString('zh-CN')}`);
      }

      logLines.push('');
      groupIndex++;
    }

    logLines.push('='.repeat(80));
    logLines.push('日志结束');
    logLines.push('='.repeat(80));

    // 写入日志文件
    await fs.writeFile(logFilePath, logLines.join('\n'), 'utf-8');

    return logFilePath;
  }

  /**
   * 格式化文件大小
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}
