-- 图片文件整理工具数据库
CREATE DATABASE IF NOT EXISTS `image_organizer` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `image_organizer`;

-- 图片文件表
CREATE TABLE `local_image_files` (
  `id` BIGINT NOT NULL PRIMARY KEY COMMENT '主键ID(雪花算法生成)',
  `file_name` VARCHAR(255) NOT NULL COMMENT '文件名',
  `file_size` BIGINT UNSIGNED NOT NULL COMMENT '文件大小(字节)',
  `file_hash` VARCHAR(64) NOT NULL COMMENT '文件哈希值(用于去重，MD5或SHA256)',
  `category` VARCHAR(50) NOT NULL COMMENT '分类(两个固定分类之一)',
  `modified_time` DATETIME NOT NULL COMMENT '文件修改时间',
  `year` SMALLINT UNSIGNED NOT NULL COMMENT '年份',
  `month` TINYINT UNSIGNED NOT NULL COMMENT '月份(1-12)',
  `file_extension` VARCHAR(20) NOT NULL COMMENT '文件扩展名',
  `created_at` DATETIME NOT NULL COMMENT '记录创建时间',
  `updated_at` DATETIME NOT NULL COMMENT '记录更新时间',

  -- 索引设计
  UNIQUE KEY `uk_file_hash` (`file_hash`),
  KEY `idx_file_name` (`file_name`),
  KEY `idx_category_year_month` (`category`, `year`, `month`),
  KEY `idx_modified_time` (`modified_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='图片文件信息表';
