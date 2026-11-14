import * as fs from 'fs/promises';
import * as path from 'path';
import { scanDirectory } from '../services/scanner';
import { Classifier } from '../services/classifier';
import { DatabaseService } from '../services/database';
import { FileOrganizer } from '../services/organizer';
import { initSnowflake } from '../utils/snowflake';
import { ClassifiedFile, Config } from '../types';

export interface DesktopConfig extends Omit<Config, 'categories'> {
  categories: {
    categoryA: { name: string; regex: string };
    categoryB: { name: string; regex: string };
    default: string;
  };
}

export interface Progress {
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  stage?: string;
  count?: number;
  total?: number;
}

export interface OrganizeOptions {
  config: DesktopConfig;
  moveFiles: boolean;
  dryRun: boolean;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必须是对象`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max = 4096): string {
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) throw new Error(`${label} 格式无效`);
  return value;
}

function integer(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} 必须是 ${min} 至 ${max} 的整数`);
  }
  return value;
}

function directoryName(value: unknown): string {
  const name = text(value, '分类名称', 120);
  if (!name.trim() || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[ .]$/.test(name) ||
      name === '.' || name === '..' || /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(name)) {
    throw new Error('分类名称必须是安全的单级目录名');
  }
  return name;
}

export function validateConfig(value: unknown): DesktopConfig {
  const raw = record(value, '配置');
  const db = record(raw.db, '数据库配置');
  const snowflake = record(raw.snowflake, '雪花算法配置');
  const paths = record(raw.paths, '目录配置');
  const categories = record(raw.categories, '分类配置');
  const category = (value: unknown) => {
    const rawCategory = record(value, '分类');
    const regex = text(rawCategory.regex, '正则表达式', 1024);
    try { new RegExp(regex, 'i'); } catch { throw new Error('分类正则表达式无效'); }
    return { name: directoryName(rawCategory.name), regex };
  };
  const config: DesktopConfig = {
    db: {
      host: text(db.host, '数据库地址', 255),
      port: integer(db.port, '数据库端口', 1, 65535),
      user: text(db.user, '数据库用户', 255),
      password: text(db.password, '数据库密码'),
      database: text(db.database, '数据库名称', 255),
    },
    snowflake: {
      workerId: integer(snowflake.workerId, '工作节点', 0, 31),
      datacenterId: integer(snowflake.datacenterId, '数据中心', 0, 31),
    },
    paths: { sourceDir: text(paths.sourceDir, '源目录'), targetDir: text(paths.targetDir, '目标目录') },
    categories: { categoryA: category(categories.categoryA), categoryB: category(categories.categoryB), default: directoryName(categories.default) },
  };
  if (!config.db.host.trim() || !config.db.user.trim() || !config.db.database.trim()) throw new Error('数据库地址、用户和名称不能为空');
  return config;
}

function inside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function canonicalDirectory(directory: string): Promise<string> {
  let current = path.resolve(directory);
  const missing: string[] = [];
  for (;;) {
    try {
      const resolved = await fs.realpath(current);
      if (!(await fs.stat(resolved)).isDirectory()) throw new Error('路径不是目录');
      return path.join(resolved, ...missing.reverse());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

export async function validatePaths(config: DesktopConfig): Promise<void> {
  const { sourceDir, targetDir } = config.paths;
  if (!sourceDir.trim() || !targetDir.trim() || !path.isAbsolute(sourceDir) || !path.isAbsolute(targetDir)) {
    throw new Error('请选择源目录和目标目录的绝对路径');
  }
  const source = await fs.realpath(sourceDir);
  if (!(await fs.stat(source)).isDirectory()) throw new Error('源路径不是目录');
  const target = await canonicalDirectory(targetDir);
  if (inside(source, target) || inside(target, source)) throw new Error('源目录和目标目录不能相同或互相包含');
  config.paths = { sourceDir: source, targetDir: target };
}

export async function organizeImagesTask(value: unknown, onProgress: (progress: Progress) => void) {
  const raw = record(value, '整理参数');
  if (typeof raw.moveFiles !== 'boolean' || typeof raw.dryRun !== 'boolean') throw new Error('整理选项必须是布尔值');
  const config = validateConfig(raw.config);
  const { moveFiles, dryRun } = raw;
  await validatePaths(config);
  initSnowflake(config.snowflake.workerId, config.snowflake.datacenterId);
  const db = new DatabaseService(config.db);
  const progress = (type: Progress['type'], message: string, stage?: string, count?: number, total?: number) =>
    onProgress({ type, message, stage, count, total });
  try {
    progress('info', '测试数据库连接', 'database');
    await db.testConnection();
    progress('info', '扫描源目录', 'scan');
    const scannedFiles = await scanDirectory(config.paths.sourceDir);
    progress('success', `扫描完成，找到 ${scannedFiles.length} 个图片文件`, 'scan', scannedFiles.length, scannedFiles.length);
    if (!scannedFiles.length) return { success: true, message: '没有找到图片文件' };
    const classifier = new Classifier(config.categories.categoryA.name, new RegExp(config.categories.categoryA.regex || '(?!)', 'i'),
      config.categories.categoryB.name, new RegExp(config.categories.categoryB.regex || '(?!)', 'i'), config.categories.default);
    const files: ClassifiedFile[] = [];
    const hashes = new Set<string>();
    let duplicates = 0;
    for (let i = 0; i < scannedFiles.length; i++) {
      const file = await classifier.classifyFile(scannedFiles[i]);
      if (hashes.has(file.fileHash) || await db.fileExists(file.fileHash)) duplicates++;
      else { hashes.add(file.fileHash); files.push(file); }
      if (i % 100 === 0 || i + 1 === scannedFiles.length) progress('info', `分类和去重 ${i + 1}/${scannedFiles.length}`, 'classify', i + 1, scannedFiles.length);
    }
    progress('success', `去重完成 - 新文件: ${files.length}, 重复文件: ${duplicates}`, 'deduplicate');
    if (!files.length) return { success: true, message: '没有新文件需要处理' };
    const categoryStats: Record<string, number> = Object.create(null) as Record<string, number>;
    let failed = 0;
    let copied = 0;
    let written = 0;
    let deleted = 0;
    if (dryRun) {
      for (const file of files) categoryStats[file.category] = (categoryStats[file.category] || 0) + 1;
      progress('info', '[试运行] 仅进行扫描和只读查询，不写入文件、数据库或日志', 'preview');
    } else {
      const organizer = new FileOrganizer(config.paths.targetDir);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let destination: string;
        try {
          // 再次检查目录连接，避免已有分类目录通过链接逃逸目标根目录
          const folder = path.join(config.paths.targetDir, file.category, String(file.year), String(file.month).padStart(2, '0'));
          const resolved = await canonicalDirectory(folder);
          if (!inside(config.paths.targetDir, resolved)) throw new Error('目标子目录超出目标根目录');
          destination = await organizer.organizeFile(file);
          copied++;
        } catch {
          failed++;
          progress('warning', `复制失败，已保留源文件: ${file.fileName}`, 'copy');
          continue;
        }
        try {
          // 只写入确认复制成功的文件，记录实际冲突消解后的文件名
          await db.insertFile({ ...file, fileName: path.basename(destination) });
          written++;
          categoryStats[file.category] = (categoryStats[file.category] || 0) + 1;
        } catch {
          failed++;
          progress('warning', `数据库写入失败，已保留源文件和副本: ${file.fileName}`, 'database');
          continue;
        }
        if (moveFiles) {
          try { await organizer.deleteSourceFile(file.filePath); deleted++; }
          catch { failed++; progress('warning', `删除失败，已保留源文件: ${file.fileName}`, 'delete'); }
        }
        if (i % 100 === 0 || i + 1 === files.length) progress('info', `整理 ${i + 1}/${files.length}`, 'organize', i + 1, files.length);
      }
      progress(failed ? 'warning' : 'success', `复制: ${copied}，入库: ${written}，删除: ${deleted}，失败: ${failed}`, 'complete');
    }
    return { success: failed === 0, ...(failed ? { error: `${failed} 项操作失败，详情见进度信息` } : {}),
      summary: { total: scannedFiles.length, newFiles: dryRun ? files.length : written, duplicates, categoryStats } };
  } finally {
    await db.close();
  }
}

export async function getStatsTask(value: unknown) {
  const config = validateConfig(value);
  const db = new DatabaseService(config.db);
  try { await db.testConnection(); return await db.getStats(); }
  finally { await db.close(); }
}
