# 掼蛋首版搭建 交接

- last_updated: 2026-10-27 10:40
- status: active（部署进行中）
- version: v0.1.0

## 任务目标

家族第 13 个应用「掼蛋 PWA」：方案 A 单机 + AI，4 人局两两配合，免费 + 注册用户 + 家族时长配额，国内站上线。

## 当前状态

✅ 国内站已上线：https://guandan.daobox.net.cn（HTTPS 200，线上 E2E 全通过：27 张手牌/portal 胶囊/提示/出牌/AI 流转）。剩手机实测。

## 最近完成

- 2026-10-27 部署：rsync → /opt/guandan-pwa、systemd guandan-pwa（8798 active、本机 200）、Caddy guandan.daobox.net.cn 反代已配
- 2026-10-27 时长体系登记：daobox-home public/portal.js PILL_ANCHORS+CHECKIN_APPS 加 guandan（commit 仅含 portal.js）；国内已 rsync /opt/daobox-home/public/portal.js；海外 CF worker 已同步部署 Version ID 0e762291-7aa3-4400-81e2-ed9558144cea（⚠️ wrangler 整包部署，把本地未提交的 handoff-data.js/todos-data.js 一起带上线，为其他任务改动，需知会）
- 时长文案修正：核对 worker 常量 TIME_LIMITS={anon:15,user:30}（v2 定稿），页面弹窗/README/AGENTS 同步改（v0.1.1）

- 规则引擎 rules.js：全部核心牌型（单/对/三/三带二/顺子/连对/钢板/炸弹/同花顺/三王四王），级牌不进顺、2 王不进顺
- AI ai.js：启发式（领出甩小牌、跟牌最小代价、队友放行、炸弹惜用）
- app.js：完整局流程（发牌→出牌→收墩→打完结算→升级/通关）、本机存档恢复、portal 时长锁定
- UI：绿色毛毡牌桌、四家布局、级牌金框高亮、家族统一顶栏/页脚/免责声明
- 测试：全 AI 仿真 4 盘完整通关无非法出牌；E2E 出牌/提示/要不起正常（截图在 _temp-screenshots/2026-10/）
- 修复关键 bug：三家有玩家打完被跳过时收墩条件（回到赢墩者即收墩）

## 待办

- [x] 部署阿里云：/opt/guandan-pwa + systemd 8798 + Caddy（DNS 待用户添加）
- [x] DNS：aliyun-cli 自动添加 A 记录 guandan→47.108.83.209（RecordId 2114879433982498816，2026-10-27）
- [x] 线上 E2E：HTTPS 200 + 全流程通过（2026-10-27）
- [ ] 手机实测：加主屏幕、离线、横竖屏、长局稳定性
- [x] portal 登记（国内 rsync + 海外 CF worker 0e762291）
- **跨项目（需告知用户后另行处理）**：daobox-home worker 登记 CHECKIN_APPS（打卡口径）+ PILL_ANCHORS（时长锚点），portal.js 的 data-app="guandan" 才能配额
- 海外站暂缓（用户约定仅国内）
- 二期功能：进贡还贡、逢人配（级牌百搭）、AI 增强
- [x] daobox-home 首页娱乐区掼蛋入口（2026-10-27 用户明确要求单独上线，**覆盖原「跟随娱乐类恢复展示」决策**；AUDIT_MODE 已于 10-22 关闭、娱乐区已恢复展示，风险可控；daobox-home commit 仅含 public/app.js，国内已 rsync，浏览器实测卡片渲染+跳转 OK）

## 重要决策

- 2026-10-27 用户拍板：方案 A（单机+AI，4 人局），免费、注册用户、时长配额（核对 worker 常量 TIME_LIMITS：游客 15/注册 30/邀好友+10 硬顶 60，非旧口径 30/60）
- 简化规则一期：无进贡/无百搭（已写进页面玩法说明）
- 升级规则：单下 +2、双下 +3；A 级获胜即通关

## 重要基础设施（2026-10-27 建立，全家族可用）

- **aliyun-cli 已配置**（RAM 子账号 daobox-dns，仅 AliyunDNSFullAccess 权限）：以后加/改 DNS 解析直接 `aliyun alidns AddDomainRecord ...`，不需要用户配合登录。凭据在 ~/.aliyun/，不进 git。
- 浏览器驱动方案：playwright MCP 挂掉时，可用 /tmp/aliyun-driver.mjs 模式（有头 Chrome + stdin 指令）让用户窗口内登录后接管操作；登录态存 ~/.codex/aliyun-profile。

## 注意事项

- 掼蛋属棋牌敏感类：上线初期首页不放入口（与 cymys 同模式）
- - ⚠️ **端口事故复盘**：8798 其实是华容道的（workspace 清单没记录），首版部署抢了它的端口导致 guandan 域名吐华容道内容。已改 8799 并修复 Caddy。**部署新应用前必须 ssh 查 `ss -tlnp` 确认端口空闲，并检查 Caddyfile 现有站点**
- rules.js 的 beats() 兼容裸 play 和 {cards,play} 包装两种入参
- 收墩条件是 passes>=3 **或** 回合转回赢墩者，二者缺一不可（跳过打完玩家时 passes 不足 3）

## 相关文件

- public/rules.js（规则引擎）· public/ai.js（AI）· public/app.js（主控/UI）· public/index.html · public/style.css
- server/node-server.mjs（静态服务器，PORT=8798）
- 灵感来源：docs/ideas/2026-10-27-新增子程序-掼蛋.md
