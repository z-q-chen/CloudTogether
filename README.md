<div align="center">
  <img src="assets/icon.svg" width="92" alt="云伴图标" />
  <h1>云伴 · CloudTogether</h1>
  <p>音乐，有人作伴。</p>
  <p>为 Linux 桌面独立编写的网易云音乐客户端。</p>
  <p><a href="https://z-q-chen.github.io/cloudtogether/">产品官网</a> · <a href="https://github.com/z-q-chen/CloudTogether/releases/tag/v0.1.0">下载 0.1.0</a> · <a href="https://z-q-chen.github.io/articles/cloudtogether-010/">首发介绍</a></p>
</div>

![发现音乐](docs/images/discover.webp)

## 从音乐开始

首页直接进入发现，常驻底栏负责播放；右上角头像进入「我的」。推荐、分类歌单、排行榜、新碟、听书和播客都有独立入口。扫码登录后读取账号歌单和喜欢列表，红心操作同步账号，失败时保留原状态并提示。

- **一套播放状态**：底栏和完整播放页共用队列、进度、音量与模式，支持自动联播、单曲循环、随机播放、网易云心动推荐。
- **一起听**：创建、加入、恢复和结束官方房间，共同队列、双向播放控制、断线恢复、双人头像。累计时长读取官方云端的同一对听友统计，按总小时显示；不使用本机计时冒充云端记录。一起听期间禁用个人心动推荐。
- **桌面歌词**：独立置顶小窗，当前句、翻译与下一句随歌曲更新；主窗口最小化后仍更新。支持拖动、缩放、调整字号，记住开关和位置。
- **你的桌面，你的颜色**：夜航、唱片纸、苔原、玫瑰灰、海盐、琥珀六款皮肤，随包提供思源黑体与宋体。
- **完整播放页**：一键展开封面与歌词，支持歌词定位、队列、音量、定时暂停和操作系统全屏。

## 下载与启动

首发提供 **Ubuntu / Linux x86_64** AppImage，Windows 和 macOS 暂无发行包。

1. 从 [GitHub Releases](https://github.com/z-q-chen/CloudTogether/releases/tag/v0.1.0) 下载 `CloudTogether-0.1.0-linux-x64.tar.gz` 并解压。
2. 运行「启动云伴.sh」。启动脚本自动解包 AppImage，不依赖 FUSE，保留标准 Chromium 沙箱。
3. 可选运行「安装到应用菜单.sh」，把图标和入口添加到当前用户的应用菜单，不需要 sudo。

单独使用 AppImage 需要系统支持 FUSE，并赋予执行权限。压缩包与单独 AppImage 使用同一程序。

顶部头像用于登录及账号管理。底栏右侧上箭头展开播放页，「词」打开或关闭桌面歌词。歌词窗右上角 × 关闭，A− / A+ 调整字号。一起听可粘贴手机网易云的邀请链接。

播放音源和音质遵循网易云账号权益与版权限制；不会替换来源或绕过会员限制。

## 首发验证与限制

0.1.0 是首次公开发行，统一此前本地开发版本编号。

核心测试 14 项、打包桌面回归 15 组、桌面歌词独立窗口 5 组、真实公共接口 9 项均通过。真实音源已解码播放；累计一起听统计已用登录账号只读验证。桌面回归使用模拟账号和房间，**真人双账号与手机端互通、账号写入及会员音源尚未完成端到端验收**。一起听目前使用约 2 秒轮询和约 8 秒心跳，网络延迟会影响同步精度。

## 数据与安全

凭据只在主进程持有，界面 IPC 使用白名单与严格参数校验。优先通过系统密钥环加密存储；密钥环不可用时使用仅当前用户可读的 0600 文件，并在设置中说明。界面启用隔离、禁用 Node，开启 renderer sandbox。没有遥测、自建账号或第三方凭据服务器。

配置位于系统应用数据目录的 `CloudTogether-Independent`，升级保留既有账号与偏好。退出账号清除本机凭据。

## 开发

需要 Node.js 24、可用的 Linux 显示环境：

```sh
npm ci
npm run build
npm start
npm test
npm run test:desktop
npm run test:lyrics
node tests/live.cjs
npm run package
```

打包脚本收集主进程依赖闭包，应用运行不依赖开发目录，也不监听本地 API 端口。桌面测试使用独立临时配置，真实公共接口测试使用匿名账号。架构见 [docs/architecture.md](docs/architecture.md)。

## 来源与致谢

应用界面、播放状态、账号桥接、一起听逻辑、桌面歌词和图标独立编写。通用框架和 API 适配层采用开源依赖，没有继承 VutronMusic 等客户端的应用源码。

感谢 [NeteaseCloudMusicApiEnhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced)、原 Binaryify/NeteaseCloudMusicApi 及贡献者。云伴是第三方客户端，与网易云官方无隶属关系。第三方许可及字体 OFL 见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。项目代码采用 [MIT](LICENSE)。音乐与封面版权属于各自权利人。

[打开云伴官网 →](https://z-q-chen.github.io/cloudtogether/)
