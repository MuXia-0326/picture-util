import { once } from 'events';
import { format } from 'util';
import { getStatsTask, organizeImagesTask, validateConfig } from './task';

const MAX_REQUEST = 64 * 1024;
const MAX_FRAME = 64 * 1024;
const MAX_OUTPUT = 32 * 1024 * 1024;
let outputBytes = 0;
let diagnosticBytes = 0;
let password = '';
let finished = false;

function redact(message: string): string {
  return password ? message.split(password).join('[已隐藏]') : message;
}

// 核心服务使用控制台日志，协议输出必须保持独立
const diagnostic = (...values: unknown[]) => {
  const message = redact(format(...values)).slice(0, 4096) + '\n';
  diagnosticBytes += Buffer.byteLength(message);
  if (diagnosticBytes <= 1024 * 1024) process.stderr.write(message);
};
console.log = diagnostic;
console.info = diagnostic;
console.warn = diagnostic;
console.error = diagnostic;
console.debug = diagnostic;

function frame(value: unknown): boolean {
  const encoded = JSON.stringify(value, (key, value: unknown) =>
    typeof value === 'string' && (key === 'message' || key === 'error') ? redact(value) : typeof value === 'bigint' ? value.toString() : value) + '\n';
  const bytes = Buffer.byteLength(encoded);
  outputBytes += bytes;
  if (bytes > MAX_FRAME || outputBytes > MAX_OUTPUT) throw new Error('工作进程输出超出协议限制');
  return process.stdout.write(encoded);
}

async function finish(result: unknown): Promise<void> {
  if (finished) return;
  finished = true;
  try {
    if (!frame({ kind: 'result', result })) await once(process.stdout, 'drain');
    process.stdout.end(() => process.exit(0));
  } catch { process.exit(1); }
}

async function execute(bytes: Buffer): Promise<void> {
  try {
    const request = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('请求格式无效');
    const config = request.operation === 'organize' ? request.options?.config : request.config;
    if (typeof config?.db?.password === 'string') password = config.db.password;
    switch (request.operation) {
      case 'validate':
        validateConfig(request.config);
        await finish({ success: true });
        break;
      case 'organize':
        await finish(await organizeImagesTask(request.options, (progress) => { frame({ kind: 'progress', progress }); }));
        break;
      case 'stats':
        await finish({ success: true, stats: await getStatsTask(request.config) });
        break;
      default: throw new Error('未知工作进程操作');
    }
  } catch (error) {
    await finish({ success: false, error: error instanceof Error ? error.message.slice(0, 4096) : '工作进程执行失败' });
  }
}

let input = Buffer.alloc(0);
let received = false;
const inputTimeout = setTimeout(() => { void finish({ success: false, error: '等待请求超时' }); }, 20_000);
process.stdin.on('data', (chunk: Buffer) => {
  if (received) return;
  if (input.length + chunk.length > MAX_REQUEST) {
    received = true;
    clearTimeout(inputTimeout);
    process.stdin.pause();
    void finish({ success: false, error: '请求超出协议限制' });
    return;
  }
  input = Buffer.concat([input, chunk]);
  const newline = input.indexOf(10);
  if (newline < 0) return;
  received = true;
  clearTimeout(inputTimeout);
  process.stdin.pause();
  if (input.subarray(newline + 1).toString('utf8').trim()) {
    void finish({ success: false, error: '只允许一个请求' });
    return;
  }
  void execute(input.subarray(0, newline));
  input = Buffer.alloc(0);
});
process.stdin.on('end', () => {
  if (!received) { clearTimeout(inputTimeout); void finish({ success: false, error: '请求缺少换行结束符' }); }
});
process.stdin.on('error', () => { clearTimeout(inputTimeout); void finish({ success: false, error: '读取请求失败' }); });
process.stdout.on('error', () => process.exit(1));
