const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const esbuild = require('esbuild');
const { exec } = require('@yao-pkg/pkg');

async function main() {
  const root = path.resolve(__dirname, '..');
  const rustInfo = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
  const host = /^host: (.+)$/m.exec(rustInfo)?.[1]?.trim();
  if (!host) throw new Error('无法确定 Rust 主机目标');
  const requested = process.env.CARGO_BUILD_TARGET || process.env.TAURI_ENV_TARGET_TRIPLE || host;
  if (requested !== host) throw new Error(`仅支持主机平台打包，目标 ${requested} 与主机 ${host} 不同`);
  const platform = { win32: 'win', linux: 'linux', darwin: 'macos' }[process.platform];
  if (!platform || !['x64', 'arm64'].includes(process.arch)) throw new Error('不支持当前主机平台');
  const outputDir = path.join(root, 'dist', 'desktop');
  const binariesDir = path.join(root, 'src-tauri', 'binaries');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(binariesDir, { recursive: true });
  const worker = path.join(outputDir, 'worker.js');
  const bundled = path.join(outputDir, 'worker.bundle.cjs');
  await esbuild.build({
    entryPoints: [path.join(root, 'src', 'desktop', 'worker.ts')],
    outfile: worker, bundle: true, packages: 'bundle', platform: 'node', format: 'cjs',
    target: 'node22', sourcemap: false, legalComments: 'none',
    define: { 'process.env.DEBUG': '"false"' },
  });
  // 独立入口避免打包器将项目元数据解释为工作进程的打包配置
  await fs.copyFile(worker, bundled);
  const output = path.join(binariesDir, `image-worker-${host}${process.platform === 'win32' ? '.exe' : ''}`);
  await exec([bundled, '--target', `node22-${platform}-${process.arch}`, '--output', output,
    '--no-bytecode', '--public-packages', '*', '--public']);
  console.log(`Sidecar ready: ${path.relative(root, output)}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
