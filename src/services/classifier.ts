import { ScannedFile, ClassifiedFile } from '../types';
import { calculateFileHash } from '../utils/hash';
import { getFileDate } from './scanner';
import { logger } from '../utils/logger';

/**
 * 分类器类
 */
export class Classifier {
  private categoryARegex: RegExp;
  private categoryBRegex: RegExp;
  private categoryAName: string;
  private categoryBName: string;
  private defaultCategory: string;

  constructor(
    categoryAName: string,
    categoryARegex: RegExp,
    categoryBName: string,
    categoryBRegex: RegExp,
    defaultCategory: string
  ) {
    this.categoryAName = categoryAName;
    this.categoryARegex = categoryARegex;
    this.categoryBName = categoryBName;
    this.categoryBRegex = categoryBRegex;
    this.defaultCategory = defaultCategory;
  }

  /**
   * 对文件进行分类和哈希计算
   */
  async classifyFile(file: ScannedFile): Promise<ClassifiedFile> {
    // 计算文件哈希
    const fileHash = await calculateFileHash(file.filePath);

    // 根据文件名判断分类
    const category = this.determineCategory(file.fileName);

    // 获取文件日期（优先 EXIF）
    const fileDate = getFileDate(file);
    const year = fileDate.getFullYear();
    const month = fileDate.getMonth() + 1; // JavaScript 月份从 0 开始

    logger.debug(`Classified file: ${file.fileName} -> ${category} (${year}-${month})`);

    return {
      ...file,
      category,
      fileHash,
      year,
      month,
    };
  }

  /**
   * 根据文件名正则匹配判断分类
   */
  private determineCategory(fileName: string): string {
    // 检查是否匹配分类 A
    if (this.categoryARegex.test(fileName)) {
      return this.categoryAName;
    }

    // 检查是否匹配分类 B
    if (this.categoryBRegex.test(fileName)) {
      return this.categoryBName;
    }

    // 无法匹配，使用默认分类
    return this.defaultCategory;
  }
}
