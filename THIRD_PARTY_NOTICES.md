# 来源与致谢

本版本的 src/、界面样式、图标、唱片插画、构建脚本和测试为此次独立编写。
没有复制 VutronMusic、Vutron、YesPlayMusic 或 music-party 的应用源码。
旧版本保留在原项目目录，新版未覆盖旧文件、账号数据或安装包。

## 网易云接口

- NeteaseCloudMusicApiEnhanced / api-enhanced，使用版本 4.36.1，MIT。
- https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced
- 感谢原项目 Binaryify/NeteaseCloudMusicApi 与后续维护者、贡献者。
- API 依赖的许可原文随依赖文件保留；使用模块的版权属于各自作者。
- 这是第三方接口适配项目，不是网易云提供的官方开发者 SDK。
- 本客户端仅调用自己的账号与网易云音源，不启用解锁、多平台替代源或下载绕过。
- API 包含的可选扩展依赖可能随包存在，客户端 IPC 不开放这些能力。

## 框架与工具

Electron、Vue、Vite、Zod、QRCode、Sharp、Playwright、electron/asar、app-builder-bin 以及它们的依赖分别受其原许可约束。运行包内保留依赖的 LICENSE/COPYING/版权文件与 Electron 的 LICENSES.chromium.html。构建产生的第三方依赖清单记录确切版本。

## 字体

Noto Sans CJK SC 与 Noto Serif CJK SC，SIL Open Font License 1.1。
来自系统安装的 Noto CJK 字体；转换为 WOFF2 并以 CloudSans / CloudSerif 作为应用内部别名，原字体名称与版权元数据保留。
版权与 OFL 原文见 assets/FONT-LICENSE.txt。

测试截图中的测试歌名、账号、封面与合成音频用于 QA；真实截图与真实接口验收记录单独提供。音乐内容版权属于相应权利人。
