import * as fs from 'fs/promises';
import * as path from 'path';
import * as exifParser from 'exif-parser';
import { ScannedFile } from '../types';
import { logger } from '../utils/logger';

// 支持的图片格式
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.heic'];

/**
 * 扫描目录下的所有图片文件
 */
export async function scanDirectory(dirPath: string): Promise<ScannedFile[]> {
  const files: ScannedFile[] = [];

  async function scan(currentPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          // 递归扫描子目录
          await scan(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (IMAGE_EXTENSIONS.includes(ext)) {
            try {
              const fileInfo = await getFileInfo(fullPath);
              files.push(fileInfo);
            } catch (error) {
              logger.warning(`Failed to process file: ${fullPath}`);
              logger.debug((error as Error).message);
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to scan directory: ${currentPath}`, error as Error);
      throw error;
    }
  }

  await scan(dirPath);
  return files;
}

/**
 * 获取文件信息（包括 EXIF 数据）
 */
async function getFileInfo(filePath: string): Promise<ScannedFile> {
  const stats = await fs.stat(filePath);
  const fileName = path.basename(filePath);
  const fileExtension = path.extname(fileName).toLowerCase();

  // 获取文件修改时间
  const modifiedTime = stats.mtime;

  // 尝试读取 EXIF 数据
  let exifDate: Date | undefined;
  try {
    exifDate = await getExifDate(filePath);
  } catch (error) {
    logger.debug(`No EXIF data for file: ${fileName}`);
  }

  return {
    filePath,
    fileName,
    fileSize: BigInt(stats.size),
    fileExtension,
    modifiedTime,
    exifDate,
  };
}

/**
 * 从图片中读取 EXIF 拍摄时间
 */
async function getExifDate(filePath: string): Promise<Date | undefined> {
  try {
    // 读取文件的前 64KB（EXIF 数据通常在文件开头）
    const buffer = Buffer.alloc(65536);
    const fileHandle = await fs.open(filePath, 'r');
    await fileHandle.read(buffer, 0, 65536, 0);
    await fileHandle.close();

    // 解析 EXIF 数据
    const parser = exifParser.create(buffer);
    const result = parser.parse();

    // 优先使用原始拍摄时间
    if (result.tags?.DateTimeOriginal) {
      return new Date(result.tags.DateTimeOriginal * 1000);
    }

    // 备选：数字化时间
    if (result.tags?.CreateDate) {
      return new Date(result.tags.CreateDate * 1000);
    }

    return undefined;
  } catch (error) {
    // 不是所有图片都有 EXIF 数据，这是正常的
    return undefined;
  }
}

/**
 * 获取文件的实际日期（优先使用 EXIF，备选使用修改时间）
 */
export function getFileDate(file: ScannedFile): Date {
  return file.exifDate || file.modifiedTime;
}
