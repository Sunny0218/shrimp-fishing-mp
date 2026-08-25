# CloudBase 自动化

本项目使用 CloudBase CLI 和腾讯云 SDK 管理云开发资源，目标是把集合和权限配置放进代码，避免在控制台逐项手动配置。

## 准备密钥

本地执行云资源初始化需要腾讯云 API 密钥。密钥只放在当前终端环境变量中，不要写入仓库。

```sh
export TENCENTCLOUD_SECRET_ID=你的SecretId
export TENCENTCLOUD_SECRET_KEY=你的SecretKey
```

可选配置：

```sh
export TENCENTCLOUD_REGION=ap-shanghai
export TCB_ENV_ID=cloud1-d0g78pgvq20122192
```

如果不设置 `TCB_ENV_ID`，脚本会读取 `env/.env` 中的 `VITE_WX_CLOUD_ENV_ID`。

## 初始化数据库集合和权限

```sh
node ./scripts/cloudbase-init-database.cjs
```

该命令会读取 `cloudbase/database/collections.json`，自动创建集合，并把每个集合权限设置为 `ADMINONLY`，对应控制台里的「所有用户不可读写」。

也可以使用 package script：

```sh
pnpm run cloud:db:init
```

## 为什么不用 tcb permission set

CloudBase CLI 新版里 `permission set` 已下线，不再执行实际权限修改。数据库集合权限改用腾讯云 TCB API `CreateTable` / `ModifyDatabaseACL`。
