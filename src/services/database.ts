import mysql from 'mysql2/promise';
import { Config, ClassifiedFile, ImageFile } from '../types';
import { generateId } from '../utils/snowflake';
import { logger } from '../utils/logger';

/**
 * 数据库服务类
 */
export class DatabaseService {
  private pool: mysql.Pool;

  constructor(config: Config['db']) {
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }

  /**
   * 测试数据库连接
   */
  async testConnection(): Promise<void> {
    try {
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      logger.success('Database connection successful');
    } catch (error) {
      logger.error('Database connection failed', error as Error);
      throw error;
    }
  }

  /**
   * 检查文件是否已存在（基于哈希值）
   */
  async fileExists(fileHash: string): Promise<boolean> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      'SELECT id FROM local_image_files WHERE file_hash = ? LIMIT 1',
      [fileHash]
    );
    return rows.length > 0;
  }

  /**
   * 插入文件记录
   */
  async insertFile(file: ClassifiedFile): Promise<bigint> {
    const id = generateId();
    const now = new Date();

    await this.pool.query(
      `INSERT INTO local_image_files
      (id, file_name, file_size, file_hash, category, modified_time, year, month, file_extension, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id.toString(),
        file.fileName,
        file.fileSize.toString(),
        file.fileHash,
        file.category,
        file.modifiedTime,
        file.year,
        file.month,
        file.fileExtension,
        now,
        now,
      ]
    );

    logger.debug(`Inserted file record: ${file.fileName} (ID: ${id})`);
    return id;
  }

  /**
   * 批量插入文件记录
   */
  async batchInsertFiles(files: ClassifiedFile[]): Promise<number> {
    if (files.length === 0) return 0;

    const now = new Date();
    const values = files.map((file) => {
      const id = generateId();
      return [
        id.toString(),
        file.fileName,
        file.fileSize.toString(),
        file.fileHash,
        file.category,
        file.modifiedTime,
        file.year,
        file.month,
        file.fileExtension,
        now,
        now,
      ];
    });

    const [result] = await this.pool.query<mysql.ResultSetHeader>(
      `INSERT INTO local_image_files
      (id, file_name, file_size, file_hash, category, modified_time, year, month, file_extension, created_at, updated_at)
      VALUES ?`,
      [values]
    );

    logger.success(`Batch inserted ${result.affectedRows} file records`);
    return result.affectedRows;
  }

  /**
   * 根据哈希值查询文件
   */
  async getFileByHash(fileHash: string): Promise<ImageFile | null> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      'SELECT * FROM local_image_files WHERE file_hash = ? LIMIT 1',
      [fileHash]
    );

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      id: BigInt(row.id),
      fileName: row.file_name,
      fileSize: BigInt(row.file_size),
      fileHash: row.file_hash,
      category: row.category,
      modifiedTime: row.modified_time,
      year: row.year,
      month: row.month,
      fileExtension: row.file_extension,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{
    total: number;
    byCategory: { category: string; count: number }[];
  }> {
    const [totalRows] = await this.pool.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM local_image_files'
    );

    const [categoryRows] = await this.pool.query<mysql.RowDataPacket[]>(
      'SELECT category, COUNT(*) as count FROM local_image_files GROUP BY category'
    );

    return {
      total: totalRows[0].count,
      byCategory: categoryRows.map((row) => ({
        category: row.category,
        count: row.count,
      })),
    };
  }

  /**
   * 关闭数据库连接池
   */
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Database connection pool closed');
  }
}
