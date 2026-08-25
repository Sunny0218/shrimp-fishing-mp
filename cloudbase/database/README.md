# 云数据库集合配置

本目录用于记录微信云开发数据库集合和权限规则，避免只靠控制台手动配置导致后续遗忘。

## 权限策略

第一版核心业务数据全部走云函数读写，因此集合默认使用 `adminOnly`：

```json
{
  "read": false,
  "write": false
}
```

这代表小程序前端不能直接读写集合，只有云函数和控制台可以操作。

## 初始化集合和演示数据

上传并部署 `cloudfunctions/initDatabase` 后，在微信开发者工具里调用一次云函数即可创建基础集合。云函数目录内也保留了一份 `collections.json`，用于本地调试和云端部署时读取。

集合权限仍建议在微信开发者工具或云开发控制台中设置为「所有用户不可读写」，或者切换到安全规则后填入 `security-rules/admin-only.json`。

如果微信开发者工具打开的是 `dist/dev/mp-weixin`，需要先重新运行小程序编译，确保 `dist/dev/mp-weixin/cloudfunctions/initDatabase/index.js` 已同步最新代码，再从开发者工具上传云函数。调用成功的新版本返回中会包含 `data.debugVersion: "initDatabase-real-seed-20260825"`。

`initDatabase` 还会幂等写入第一版联调需要的演示数据：

- `settings`：默认门店名称、地址、电话、营业时间和公告。
- `packages`：3 个可预约套餐。
- `time_slots`：从当天开始连续 5 天、每天 3 个可预约场次。
- `pricing_rules`：1 条现场计时规则，用于后续管理端现场开单联调。
- `goods`：2 个现场加购商品，用于后续结账联调。

重复调用不会重复插入同一批演示数据；已存在的演示场次会保留 `bookedCount` 和 `status`，避免把已预约测试数据重置掉。
