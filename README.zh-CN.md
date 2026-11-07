# FluentScreen 字幕学习助手

**用你喜欢的视频学习英语。**

[English](README.md) · [安装说明](docs/INSTALL.zh-CN.md) · [作品集文案](PORTFOLIO.md)

FluentScreen 是 **Lancy Zhang** 独立开发的本地优先中英字幕学习工具。它由 Chrome 扩展和 macOS Apple Vision 本地识别助手组成，可以从视频页面获取中文字幕、逐句翻译成英文、按时间保留中英对照记录，并把句子转化为英语学习材料。

## 核心功能

- 支持 YouTube、Bilibili 和 Kubb 视频页面。
- 视频有播放器字幕时优先读取原字幕。
- 对画面硬字幕使用 Mac 本机 Apple Vision OCR。
- 在 Chrome 侧边栏持续显示中英逐句记录。
- 自动去重，并根据播放时间同步当前句。
- 支持句子讲解与本地生词本。
- 已完成的翻译会保留，不会跳到下一句后消失。

## 产品结构

- **Chrome 扩展**：连接视频页面、显示侧边栏、管理台词、翻译和学习功能。
- **FluentScreen Vision**：使用 Apple Vision 在 Mac 本地识别画面中文字幕。
- **DMG 安装程序**：安装本地助手并准备扩展文件夹。由于扩展没有上架 Chrome 商店，Chrome 仍要求用户手动完成一次“加载已解压的扩展程序”。

## 隐私说明

OCR 截图只在用户自己的 Mac 上处理，FluentScreen Vision 不保存截图。台词记录和生词本保存在 Chrome 本地。翻译文本可能会发送到所配置的翻译服务，因此不建议处理含有机密信息的视频。

## 安装

从 Releases 下载 `FluentScreen-1.5.0-macOS.dmg`，然后按照[中文安装说明](docs/INSTALL.zh-CN.md)操作。免费版没有 Apple 开发者签名，macOS 首次打开时可能需要右键安装程序并选择“打开”。

DMG 已包含第三方 OCR 运行文件和中文语言模型。为避免把生成文件和第三方大文件重复放入源码仓库，这些 vendor 资源只随安装包发布；本项目开发的扩展源码、测试、本地助手和打包脚本均在仓库中公开。

## 当前限制

- Apple Vision 画面识别只支持 macOS。
- 广告遮挡、花字、快速切镜和特殊字幕样式会影响识别准确率。
- 非 Chrome 商店扩展必须在 `chrome://extensions` 中手动加载一次。
- 翻译速度与可用性受免费翻译服务及其频率限制影响。

## 技术栈

Chrome Extension Manifest V3、JavaScript、HTML/CSS、Objective-C、Apple Vision、Native Messaging、AppleScript 和 DMG 自动打包。

## 项目状态

作品集发布版 / 持续迭代原型。源代码公开展示，但目前未授予复制或再发布许可。

