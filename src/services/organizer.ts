import * as fs from 'fs/promises';
import * as path from 'path';
import { ClassifiedFile } from '../types';
import { logger } from '../utils/logger';

/**
 * 文件整理器类
 */
export class FileOrganizer {
  private targetDir: string;

  constructor(targetDir: string) {
    this.targetDir = targetDir;
  }

  /**
   * 整理文件：移动到目标目录，按分类/年份/月份组织
   */
  async organizeFile(file: ClassifiedFile): Promise<string> {
    // 构建目标路径：目标目录/分类/年份/月份/文件名
    const month = file.month.toString().padStart(2, '0');
    const targetFolder = path.join(
      this.targetDir,
      file.category,
      file.year.toString(),
      month
    );

    // 确保目标文件夹存在
    await fs.mkdir(targetFolder, { recursive: true });

    // 构建目标文件路径
    const targetPath = path.join(targetFolder, file.fileName);

    // 处理文件名冲突
    const finalPath = await this.resolveFileNameConflict(targetPath);

    // 移动文件（如果源文件和目标文件不在同一位置）
    if (file.filePath !== finalPath) {
      await fs.copyFile(file.filePath, finalPath);
      logger.debug(`Organized file: ${file.fileName} -> ${finalPath}`);
    }

    return finalPath;
  }

  /**
   * 批量整理文件
   */
  async organizeFiles(files: ClassifiedFile[]): Promise<{
    success: number;
    failed: number;
    errors: { file: string; error: string }[];
    successfulFiles: ClassifiedFile[];
  }> {
    let success = 0;
    let failed = 0;
    const errors: { file: string; error: string }[] = [];
    const successfulFiles: ClassifiedFile[] = [];

    for (const file of files) {
      try {
        await this.organizeFile(file);
        success++;
        successfulFiles.push(file);
      } catch (error) {
        failed++;
        errors.push({
          file: file.fileName,
          error: (error as Error).message,
        });
        logger.error(`Failed to organize file: ${file.fileName}`, error as Error);
      }
    }

    return { success, failed, errors, successfulFiles };
  }

  /**
   * 解决文件名冲突（如果目标文件已存在，添加后缀）
   */
  private async resolveFileNameConflict(filePath: string): Promise<string> {
    let finalPath = filePath;
    let counter = 1;

    while (await this.fileExists(finalPath)) {
      const parsed = path.parse(filePath);
      finalPath = path.join(parsed.dir, `${parsed.name}_${counter}${parsed.ext}`);
      counter++;
    }

    return finalPath;
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 删除源文件（可选，在确认复制成功后）
   */
  async deleteSourceFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      logger.debug(`Deleted source file: ${filePath}`);
    } catch (error) {
      logger.error(`Failed to delete source file: ${filePath}`, error as Error);
      throw error;
    }
  }
}
