/**
 * 图片文件信息接口
 */
export interface ImageFile {
  id: bigint;
  fileName: string;
  fileSize: bigint;
  fileHash: string;
  category: string;
  modifiedTime: Date;
  year: number;
  month: number;
  fileExtension: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 文件扫描结果
 */
export interface ScannedFile {
  filePath: string;
  fileName: string;
  fileSize: bigint;
  fileExtension: string;
  modifiedTime: Date;
  exifDate?: Date; // EXIF 拍摄时间（可选）
}

/**
 * 分类结果
 */
export interface ClassifiedFile extends ScannedFile {
  category: string;
  fileHash: string;
  year: number;
  month: number;
}

/**
 * 配置接口
 */
export interface Config {
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  snowflake: {
    workerId: number;
    datacenterId: number;
  };
  paths: {
    sourceDir: string;
    targetDir: string;
  };
  categories: {
    categoryA: {
      name: string;
      regex: RegExp;
    };
    categoryB: {
      name: string;
      regex: RegExp;
    };
    default: string;
  };
}
