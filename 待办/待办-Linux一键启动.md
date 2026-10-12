# Linux 一键启动

目标：仿照参考脚本，通过指定端口在 Linux 后台启动管理端，无需 Nginx 或 systemd。

方案：首次启动安装完整依赖，每次启动执行现有 `pnpm build`，直接用 Node.js 启动 Vite preview，监听 `0.0.0.0`。`PORT` 默认 5173；沿用现有模型服务代理。PID 和日志放在项目内 `.admin/`，停止时直接管理 Node.js 进程。

1. [x] 核对参考脚本及现有项目 → 验证：确认构建命令、Node.js 要求以及 preview 继承接口代理。
2. [x] 新增 `start-admin.sh`、运行文件忽略规则和脚本 LF 换行规则 → 验证：Bash 语法检查通过；未运行状态、非法端口、非法命令、缺失日志、安装与构建失败退出通过；Vite 端口占用退出通过。
3. [x] 补充 README 的 Linux 使用说明 → 验证：说明端口、代理、依赖、日志及 Windows 换行处理；项目构建与类型检查通过；实际 HTTP 验证页面、SPA 回退、API 路径及认证头代理、健康接口改写通过。

修改范围仅为 `start-admin.sh`、`.gitignore`、`.gitattributes`、README 部署说明与本待办，不改动现有业务代码。

验证限制：当前为 Windows 环境，已用 Git Bash 检查脚本语法和失败分支，并直接启动相同 Node.js/Vite 命令完成 HTTP 验证。Linux 上的 nohup、PID 识别、重复启动、停止与重启生命周期尚未实机验证。
