# 图片整理工具 / Image Organizer

<div align="center">

**一个功能强大的图片文件整理工具，支持命令行和桌面GUI两种模式**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/Electron-39+-blue.svg)](https://www.electronjs.org/)

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

#### 开发模式
```bash
npm run electron:dev
```

#### 构建 EXE 安装程序
```bash
npm run dist
```

安装程序将生成在 `release` 目录中。

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
mossia-setu-util/
├── src/                      # TypeScript 源码
│   ├── config/              # 配置管理
│   ├── services/            # 业务服务
│   │   ├── scanner.ts       # 文件扫描
│   │   ├── classifier.ts    # 文件分类
│   │   ├── database.ts      # 数据库操作
│   │   └── organizer.ts     # 文件整理
│   ├── utils/               # 工具函数
│   │   ├── snowflake.ts     # ID 生成器
│   │   ├── hash.ts          # 哈希计算
│   │   └── logger.ts        # 日志工具
│   ├── types/               # 类型定义
│   └── index.ts             # CLI 入口
├── electron/                # Electron 应用
│   ├── main/                # 主进程
│   │   ├── main.js          # 主入口
│   │   ├── preload.js       # 预加载脚本
│   │   └── organize-task.js # 任务封装
│   ├── renderer/            # 渲染进程（界面）
│   │   ├── index.html       # 主界面
│   │   ├── styles.css       # 样式
│   │   └── renderer.js      # 交互逻辑
│   └── assets/              # 资源文件
│       └── ICON_README.md   # 图标说明
├── dist/                    # 编译输出
├── database/                # 数据库脚本
├── logs/                    # 日志文件
├── release/                 # 构建产物
└── package.json             # 项目配置
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
- 检查网络连接（首次构建需下载 Electron）
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
