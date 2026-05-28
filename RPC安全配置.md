# RPC 安全配置

在线编辑器现在通过 Supabase RPC 读写 `documents`，不再让浏览器直接对表执行 `select / upsert / delete`。

## 部署顺序

1. 先部署当前版本的静态编辑器。
2. 打开 Supabase SQL Editor。
3. 复制 `supabase_rpc_gate.sql` 的内容。
4. 把 `CHANGE_ME_EDITOR_ACCESS_KEY` 替换成新的团队编辑器口令。
5. 执行 SQL。
6. 打开线上编辑器，用新口令登录并确认可以拉取内容。

这个顺序不能反过来。先执行 SQL 会关闭旧版编辑器的直接表访问，导致线上旧页面无法读写。

## 口令轮换

只需要在 Supabase SQL Editor 执行：

```sql
UPDATE public.app_settings
SET value = crypt('NEW_EDITOR_ACCESS_KEY', gen_salt('bf')),
    updated_at = NOW()
WHERE key = 'editor_access_key_hash';
```

执行后，把新口令记录到本机私有备忘文档，不要提交到仓库。

## 权限模型

- 浏览器端只保存 Supabase publishable key。
- 共享编辑器口令由 RPC 函数在数据库端校验。
- `documents` 的匿名直接读写会被 RLS 拒绝。
- 本地同步脚本继续使用 `SUPABASE_SECRET_KEY` 环境变量，绕过 RLS 做受控同步。
