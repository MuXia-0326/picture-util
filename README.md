# PhotoHarbor · 照片港湾

<div align="center">

<img src="web/assets/photoharbor.svg" width="96" height="96" alt="PhotoHarbor Logo">

**给每一张照片一个有序的港湾，支持命令行和桌面 GUI 两种模式**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![Tauri](https://img.shields.io/badge/Tauri-2-blue.svg)](https://v2.tauri.app/)

</div>

## ✨ 功能特性

### 核心功能
- 🖼️ **智能扫描** - 自动扫描指定目录下的所有图片文件
- 📅 **时间识别** - 读取 EXIF 数据获取拍摄时间（备选文件修改时间）
- 🏷️ **自动分类** - 基于正则表达式的灵活分类规则
- 📁 **目录整理** - 按年份+月份自动创建目录结构
- 🔍 **智能去重** - 基于文件哈希值的重复检测
- 💾 **数据库记录** - 完整的文件信息存储到 MySQL
- 🆔 **唯一标识** - 使用雪花算法生成分布式唯一ID

### 双模式支持
- 💻 **命令行模式** - 适合自动化脚本和批处理
- 🖥️ **桌面GUI模式** - 可视化配置界面，操作更直观

## 📦 快速开始

### 安装依赖

```bash
npm install
```

### 数据库初始化

```bash
mysql -u root -p < database/init.sql
```

## 🚀 使用方式

### 方式一：桌面应用（推荐）

#### 环境要求

- 开发机：Node.js 22+、Rust 1.90+（推荐 stable）和 Cargo
- Windows：安装 Visual Studio Build Tools，启用“使用 C++ 的桌面开发”和 Windows SDK
- 运行时：Windows 10/11 + WebView2，安装程序会在缺少 WebView2 时引导安装
- 已安装的应用无需额外安装 Node.js，图片处理进程会随安装程序打包

#### 开发模式

```bash
npm run desktop:dev
```

Tauri 会先打包图片处理 sidecar，再打开本地工作台；首次构建需要下载 Rust crates 和 Node 打包运行时。

#### 构建 EXE 安装程序

```bash
npm run desktop:build
# 兼容入口
npm run dist
```

安装程序输出到 `src-tauri/target/release/bundle/nsis/`，文件名使用 `PhotoHarbor_<版本>_x64-setup.exe`，安装及卸载界面统一使用英文。仅构建未安装应用可运行 `npm run pack`。

默认按当前用户安装，无需管理员权限，默认安装文件夹为 `%LOCALAPPDATA%\PhotoHarbor`，快捷方式与应用名称均为 `PhotoHarbor`。安装文件夹名称为英文，但 Windows 用户名可能包含中文；需要完整英文路径时，可在安装时选择例如 `D:\Apps\PhotoHarbor`。PhotoHarbor 后续升级会沿用此前选择的安装位置。由旧中文名称版本迁移时，请先备份配置，再卸载旧版并安装 PhotoHarbor，避免两套程序与快捷方式并存；卸载旧版时不要选择删除应用数据；应用配置目录保持不变，不主动删除历史配置。

品牌名称取自 Photo + Harbor，意为「照片港湾」。应用图标、安装图标和页面 Logo 使用同一套照片与港湾图形，矢量源文件位于 `web/assets/photoharbor.svg`，可通过 `python scripts/generate-icons.py` 使用 Pillow 重新生成图标。

#### 桌面工作台

1. 选择源目录和目标目录，目录不能相同或互相包含
2. 配置分类名称、正则表达式和 MySQL 连接
3. 默认使用复制模式并开启试运行，先检查任务日志再关闭试运行执行
4. 移动模式会在复制并成功记录数据库后删除源文件，需要二次确认
5. 统计页面按需读取数据库，不显示模拟数据

配置保存在 Tauri 应用配置目录（Windows 为 `%APPDATA%\com.imageorganizer.app\config.json`），首次启动仅在新配置不存在时尝试导入旧 Electron 配置；已有配置损坏时会报告错误，不会静默覆盖。密码仍保存在本地配置文件中，请妥善保护当前系统账户。命令行模式继续使用 `.env`，与桌面配置相互独立。

桌面采用 Tauri 2 + 系统 WebView，Rust 负责配置、原生目录对话框和受限任务调用；图片处理使用独立打包的 Node sidecar，复用 TypeScript 服务，不在页面开放任意文件或 Shell 权限。


### 方式二：命令行模式

#### 配置环境变量
复制 `.env.example` 为 `.env` 并修改配置：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_DATABASE=image_organizer

# 路径配置
SOURCE_DIR=D:\Pictures\source
TARGET_DIR=D:\Pictures\organized

# 分类配置
CATEGORY_A_NAME=风景照片
CATEGORY_A_REGEX=^IMG_.*
CATEGORY_B_NAME=人物照片
CATEGORY_B_REGEX=^DSC_.*
DEFAULT_CATEGORY=其他照片

# 雪花算法配置
SNOWFLAKE_WORKER_ID=1
SNOWFLAKE_DATACENTER_ID=1
```

#### 运行命令

```bash
# 整理图片（复制模式）
npm run organize

# 整理图片（移动模式，会删除源文件）
npm run organize:move

# 试运行（不实际操作）
npm run organize:dry

# 查看统计信息
npm run stats
```

## 📁 项目结构

```
picture-util/
├── src/                      # TypeScript 服务与 CLI
│   ├── desktop/              # 桌面任务与 stdin/stdout 协议
│   ├── config/               # CLI 环境变量配置
│   ├── services/             # 扫描、分类、数据库、文件整理
│   ├── utils/                # ID、哈希与日志
│   └── index.ts              # CLI 入口
├── web/                      # 原生 HTML/CSS/JS 桌面工作台
├── src-tauri/                # Tauri Rust 入口与权限配置
├── scripts/                  # 独立处理进程打包与品牌图标生成
├── database/                 # 数据库初始化脚本
├── dist/                     # TypeScript 与 sidecar 中间产物
└── package.json              # CLI 与桌面构建命令
```

## 🎯 分类规则

支持使用正则表达式进行灵活的文件分类：

### 示例配置

```env
# 匹配以 IMG_ 开头的文件
CATEGORY_A_REGEX=^IMG_.*

# 匹配包含日期格式的文件
CATEGORY_B_REGEX=\d{8}_.*

# 匹配特定相机型号
CATEGORY_A_REGEX=^(DSC|DSCN).*
```

### 常用正则表达式

| 需求 | 正则表达式 | 说明 |
|------|-----------|------|
| 以 IMG 开头 | `^IMG_.*` | 匹配 IMG_0001.jpg |
| 包含日期 | `^\d{8}_.*` | 匹配 20240115_photo.jpg |
| 特定扩展名 | `.*\.(jpg\|jpeg\|png)$` | 匹配 jpg/jpeg/png |
| 相机型号 | `^(DSC\|DSCN).*` | 匹配尼康相机文件 |

## 🛠️ 开发

### 编译 TypeScript

```bash
npm run build
```

### 监听模式

```bash
npm run watch
```

### 清理构建

```bash
npm run clean
```

## ⚙️ 配置说明

### 数据库配置
- `DB_HOST` - 数据库主机地址
- `DB_PORT` - 数据库端口（默认 3306）
- `DB_USER` - 数据库用户名
- `DB_PASSWORD` - 数据库密码
- `DB_DATABASE` - 数据库名称

### 路径配置
- `SOURCE_DIR` - 源图片目录（待整理）
- `TARGET_DIR` - 目标目录（整理后存放）

### 分类配置
- `CATEGORY_A_NAME` - 分类 A 的名称
- `CATEGORY_A_REGEX` - 分类 A 的匹配规则
- `CATEGORY_B_NAME` - 分类 B 的名称
- `CATEGORY_B_REGEX` - 分类 B 的匹配规则
- `DEFAULT_CATEGORY` - 默认分类名称

### 雪花算法配置
- `SNOWFLAKE_WORKER_ID` - 工作节点 ID (0-31)
- `SNOWFLAKE_DATACENTER_ID` - 数据中心 ID (0-31)

## 🐛 常见问题

### 数据库连接失败
- 检查 MySQL 服务是否运行
- 确认数据库配置信息正确
- 确保数据库用户有足够权限

### 找不到图片文件
- 确认源目录路径正确
- 检查目录读取权限
- 支持的格式：jpg, jpeg, png, gif, bmp, webp

### 构建 EXE 失败
- 确保已安装所有依赖
- 检查 Rust、MSVC 和 Windows SDK 是否安装完整
- 检查网络连接（首次构建需下载 Rust crates 和 sidecar 运行时）
- 尝试删除 `node_modules` 后重新安装

## 📄 许可证

[MIT License](LICENSE)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📮 联系方式

如有问题或建议，请提交 Issue。

---

<div align="center">
Made with ❤️ by Your Team
</div>
