# 开发

需要 Node.js 24 和 Linux 显示环境。

```sh
npm ci
npm run build
npm start
```

贡献前运行与改动相关的检查：

```sh
npm test
npm run test:desktop
npm run test:lyrics
node tests/live.cjs
```

桌面检查使用临时配置和模拟服务。真实双账号与手机兼容性需另行确认。

```sh
npm run package
npm run package:deb
```

账号与偏好存储在系统应用数据目录的 `CloudTogether-Independent`，退出账号清除本机凭据。凭据在主进程保存，优先使用系统密钥环；不可用时退回仅当前用户可读的文件，并在设置中说明。
