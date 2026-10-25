# OUL Studio

**明天，穿得像自己。**

OUL Studio 是一个移动端优先的私人 AI 造型应用。它先理解你的身体参数与真实衣橱，再根据明天的场景、天气与必穿单品，从你真正拥有的衣服里组合多套造型，并用 Google Gemini 生成本人试穿画面。用户左右滑动挑选造型，可以随时把单件衣服设为「不可穿」或「下次必穿」，再重新推荐。

不是电商橱窗，也不是随机拼图。OUL 的核心约束是：**只从你的衣橱出发**。当衣橱无法支撑场景时，它会明确说明缺口，并给出具体的采购建议。

---

## 功能

| 能力 | 实现 |
| --- | --- |
| 账户体系 | 邮箱注册 / 登录、Argon2 密码哈希、JWT、登录限流、修改密码、永久删除账户 |
| 身体档案 | 身高、体重、胸 / 腰 / 臀、裤长、鞋码、身型、肤色倾向、版型偏好、风格偏好、避雷色 |
| 基础照片 | 注册后必须上传一张全身照片，作为 AI 试穿的本人基准；需要登录凭证才能访问 |
| 私人衣橱 | 单品拍照、分类、颜色、材质、正式度、保暖度、季节、风格标签、收藏、备注 |
| AI 衣橱助理 | 上传单品照片后自动识别品类、颜色、材质、正式度、保暖度与风格标签 |
| 天气 | 明日 Open-Meteo 天气；可按城市或浏览器定位获取，也可手动调整 |
| 多套造型 | 每次生成 3 套明显不同的完整穿搭；每套含标题、理由、造型手法、契合度与单品格 |
| 必穿单品 | 可在衣橱或结果页设置；后续推荐强制纳入，冲突时给出提示 |
| 不可穿状态 | 在结果页直接切换单件「可穿 / 不可穿」，然后重新推荐；清洗、借出、换季都能处理 |
| AI 试穿 | Gemini 多图合成：保留用户的脸、身体与肤色，把整套真实单品穿到本人身上 |
| 背景选择 | 纯净影棚，或自定义提示词生成场景背景；生成后也可以单独为某套造型换背景 |
| 左右滑动 | 原生 scroll-snap 手势，移动端顺滑切换多套造型 |
| 场景不合适提示 | 极端天气、户外雷雨、正式场合高温、必穿冲突、衣橱缺口等都会明确提示，并可一键换一组 |
| 采购建议 | 当衣橱缺少关键品类或正式度不足时，给出具体缺口、原因、优先级和购物搜索链接 |
| 历史档案 | 保留每个场景、天气和造型；可回看与删除 |
| PWA | 可安装到主屏幕，离线壳缓存，移动端全屏体验 |

---

## 技术栈

- **后端**：Python 3.13、FastAPI、SQLAlchemy 2、SQLite、Pydantic v2、PyJWT、Argon2、Pillow、`google-genai`
- **前端**：React 19、TypeScript、Vite 8、React Router 7、TanStack Query 5、Lucide、自研 **OUL UI**
- **AI**：Google Gemini
  - 文字规划：`gemini-2.5-flash`
  - 图像合成：`gemini-2.5-flash-image`
- 本地人物抠像：u2netp（onnxruntime，CPU）
- **天气**：Open-Meteo（免费、无需 API Key）

> **关于 `oul-ui`**：交付时 npm registry / PyPI / GitHub 均不存在可安装的 `oul-ui` 包（npm 返回 404）。因此本仓库将 OUL UI 实现为独立 workspace 包：`frontend/packages/oul-ui`，包名就是 `oul-ui`，由应用通过 `import { Button } from 'oul-ui'` 与 `import 'oul-ui/oul.css'` 使用。它不是伪装成第三方库——是一个可独立构建/发布、带自己 package.json 与 README 的移动端设计系统。若你指的是某个私有 `oul-ui` 包，只需把 `package.json` 中的 `file:./packages/oul-ui` 换成该包即可替换。

---

## 项目结构

```text
.
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes/          # auth / users / wardrobe / recommendations / weather / media
│   │   │   └── serializers.py   # 签名媒体 URL 与响应组装
│   │   ├── core/                # 配置、JWT、密码与依赖
│   │   ├── db/                  # SQLAlchemy 模型与会话
│   │   ├── schemas/             # Pydantic 契约
│   │   ├── services/
│   │   │   ├── gemini.py        # Gemini 文本规划 / 单品识别 / 多图试穿
│   │   │   ├── stylist.py       # 确定性造型规划器（Gemini 不可用时兜底）
│   │   │   ├── recommendation_service.py
│   │   │   ├── renderer.py      # AI 试穿 + 本地人物场景合成
│   │   │   ├── local_scene.py   # 人物抠像与提示词驱动背景
│   │   │   ├── storage.py       # 图片校验、压缩、私有媒体、缩略图
│   │   │   └── weather.py       # Open-Meteo
│   │   ├── prompts/             # 造型系统提示词
│   │   ├── assets/
│   │   │   ├── fonts/           # 预览板字体与 OFL 许可证
│   │   │   └── models/          # u2netp 本地人物分割模型
│   │   └── main.py              # FastAPI 入口、CORS、安全头、SPA 托管
│   ├── tests/                   # 20 个 API / 造型 / AI 路径测试
│   ├── requirements.txt
│   └── requirements-dev.txt
├── frontend/
│   ├── packages/oul-ui/         # 独立 workspace UI 包（包名 oul-ui）
│   │   ├── src/                 # Button / Field / Sheet / Switch / CSS
│   │   ├── package.json
│   │   └── README.md
│   ├── public/                  # PWA manifest、图标、Service Worker
│   ├── src/
│   │   ├── app/                 # providers 与路由
│   │   ├── components/          # 品牌、底部导航、图片上传、天气等
│   │   ├── pages/               # 欢迎 / 认证 / 建档 / 首页 / 衣橱 / 造型 / 结果 / 我的
│   │   ├── lib/                 # API client、React Query hooks、类型、工具
│   │   └── styles/              # design tokens 与产品样式
│   ├── package.json
│   └── vite.config.ts
├── Makefile
├── pyproject.toml
└── .env.example
```

---

## 快速开始

### 1. 环境

- Python 3.13+
- Node.js 22+
- 可选：Google AI Studio 的 Gemini API Key

### 2. 安装

```bash
make install
cp .env.example .env

# 生成本地 SECRET_KEY
python - <<'PY'
import secrets
print(secrets.token_urlsafe(48))
PY
# 把输出填进 .env 的 SECRET_KEY

# 可选：开启完整 AI 造型与试穿
# GEMINI_API_KEY=your-google-ai-studio-key
```

### 3. 开发模式

终端一：

```bash
make dev-backend
# http://127.0.0.1:8000
# API docs: http://127.0.0.1:8000/api/docs
```

终端二：

```bash
make dev-frontend
# http://localhost:5173
```

Vite 会把 `/api` 代理到 `127.0.0.1:8000`。

### 4. 单进程生产预览

```bash
make build
.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000
```

打开 `http://127.0.0.1:8000`。FastAPI 会直接托管构建后的前端。

---

## Gemini 配置与降级

`.env`：

```dotenv
GEMINI_API_KEY=...
GEMINI_TEXT_MODEL=gemini-2.5-flash
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
ENABLE_AI_IMAGES=true
```

**没有 API Key 时应用仍然完整可用**：

- 造型由 `services/stylist.py` 的确定性「Atelier」规划器完成。它考虑天气、正式度、保暖度、季节、色彩、身体比例、必穿与不可用状态。
- 「AI 试穿」会降级为真实的造型预览板：先在本机用 u2netp 模型抠出人物，再依据用户选择的背景提示词现场合成场景；背景为「纯净影棚」时会真正生成留白影棚。随后叠加真实单品与 editorial 字体。界面会标注「造型预览」，不会伪装成 AI 换装。
- 配置 Key 后，同样的流程会调用 Gemini 进行更细腻的选款文案，并生成真人试穿图；Gemini 调用失败时仍会自动回退，不会阻断产品使用。

试穿提示词会明确要求：保留用户的脸、发色、肤色与身体比例，不改变身份；完整呈现从头到脚的造型；不添加文字、水印或其他人。自定义背景会与人物保护指令一起传给图像模型。

> 真实 Google 调用需要有效的 `GEMINI_API_KEY`。当前交付环境没有该凭据，所以无法在此环境内生成真实的 Gemini 输出；请求路径已通过 SDK + HTTP mock 测试，填入 Key 后即可开启线上生成。没有 Key 时，背景提示词也不会失效：本地抠像 + 场景合成会真实应用它。

---

## 数据与隐私

- 账户、衣橱、推荐与造型记录存储在本地 SQLite：`data/oul.db`
- 图片存储在 `data/uploads/<user-id>/...`，按用户隔离
- 所有衣物、全身照与生成图通过 `/api/media/...?token=...` 访问，必须携带登录 JWT；跨用户读取返回 `403`
- 上传图片会校验 MIME、大小（默认 12 MB）与像素数，移除 EXIF 后压缩；支持 JPEG / PNG / WebP / HEIC
- 登录接口有 10 分钟窗口的失败次数限制
- 用户可以在「我的 → 账户与隐私 → 删除账户」处输入密码后永久删除账号、衣橱、推荐、全部照片与上传目录
- 生产环境必须：
  - 使用 HTTPS
  - 替换 `SECRET_KEY`
  - 限制 `ALLOWED_ORIGINS`
  - 在反向代理层追加 CSP、速率限制与备份

服务条款与隐私说明是产品内示例文案，正式上线前需经法律审阅。

---

## 主要 API

所有业务接口位于 `/api`，除注册/登录/天气外均需要 `Authorization: Bearer <token>`。

| Method | Path | 说明 |
| --- | --- | --- |
| POST | `/auth/register` | 创建账号 |
| POST | `/auth/login` | 登录 |
| GET | `/auth/me` | 当前会话 |
| GET/PATCH | `/users/me` | 读取 / 更新身体档案 |
| POST | `/users/me/base-photo` | 上传全身基础照片 |
| POST | `/users/me/complete-onboarding` | 校验并完成建档 |
| POST | `/users/me/password` | 修改密码 |
| DELETE | `/users/me` | 永久删除账户与照片 |
| GET/POST | `/wardrobe` | 衣橱列表 / 上传单品 |
| GET/PATCH/DELETE | `/wardrobe/{id}` | 单品详情 / 编辑 / 删除 |
| POST | `/wardrobe/analyze` | AI 识别单品照片 |
| PATCH | `/wardrobe/{id}/availability` | 可穿 / 不可穿 |
| PATCH | `/wardrobe/{id}/force` | 下次必穿 |
| PATCH | `/wardrobe/{id}/favorite` | 收藏 |
| GET | `/weather/tomorrow` | 明日天气 |
| GET | `/weather/geocode` | 城市搜索 |
| POST | `/recommendations` | 生成多套造型 |
| GET | `/recommendations/{id}` | 轮询造型与图片状态 |
| POST | `/recommendations/{id}/reroll` | 应用衣橱变化后重新推荐 |
| POST | `/recommendations/{id}/outfits/{outfit_id}/render` | 更换背景并重绘当前套 |
| GET | `/media/{path}` | 私有图片（需 token） |

`POST /recommendations` 会立即返回一条 `status: "planning"` 的记录：选款与图片生成都在进程内的后台线程中执行，不受 HTTP 请求生命周期影响。因此点击生成后可以立刻跳转到衣橱或首页，生成会继续，完成后前端会在任意页面提醒。前端每 2.2 秒轮询（离开页面也保持轮询），进程重启后会由启动恢复逻辑重新排队未完成的任务。

---

## 测试与检查

```bash
make test
make typecheck
```

测试覆盖：

- 注册 / 登录 / onboarding 校验
- 衣橱 CRUD、收藏、必穿、可穿状态
- 完整推荐流程、强制单品、重新推荐
- 私有媒体鉴权与跨用户隔离
- 后台图片生成、背景重绘
- 缺口采购建议、场景 / 天气警告
- Gemini 正常路径与失败降级
- **Gemini SDK 的真实 HTTP 请求/响应路径**（httpx MockTransport，不需要线上 Key）：多图 inlineData、3:4 imageConfig、响应内联图片解析
- 本地人物场景合成：不同背景提示词产生可见差异，lookboard 渲染也随 prompt 改变
- 账户删除与媒体清理
- 确定性造型规划器的完整性、保暖、雨天、冲突与多样性

当前结果：**20 passed**。

---

## 设计说明

OUL UI 使用「编辑式时装档案」的视觉语言：暖羊皮纸底色、炭黑正文、酸柠檬绿作为行动色、番茄橙作为情绪点；Instrument Serif 用于英文编辑排版，Manrope 与系统中文字体承担信息密度。移动端最大宽度 520px，桌面端以独立应用画框呈现。

主要页面：

- 欢迎 / 注册 / 登录
- 四步建档：身体基础 → 比例 → 风格 → 全身照与天气
- 首页：天气、明日造型入口、衣橱速览、最近造型
- 衣橱：搜索、分类筛选、收藏、必穿、可穿状态
- 单品编辑器：拍照、AI 识别、正式度 / 保暖度、季节 / 风格标签
- 造型表单：场景描述、日期类型、天气、背景、必穿清单
- 结果页：左右滑动、试穿图、换背景、单品状态、警告、采购建议、重新推荐
- 我的：身体档案、衣橱状态、隐私、密码、退出与删除账户

---

## 生产化边界

这套实现是可运行的完整产品，但部署到真实、多用户、高并发环境时还需要：

1. **数据库**：SQLite 适合单节点与本地部署。换 PostgreSQL 时修改 `DATABASE_URL`，并引入 Alembic 管理迁移。
2. **任务队列**：图像生成目前使用进程内的守护线程（单进程、启动时恢复未完成任务）。多副本部署时建议改为 Celery / RQ / Cloud Tasks，并把图片存入对象存储（S3 / R2）与 CDN。
3. **认证**：当前使用 7 天 JWT + localStorage。更高安全要求可改为 HttpOnly refresh cookie + 短期 access token。
4. **图片隐私**：媒体 URL 将 access token 放在查询参数中（只用于 `<img>`）。如需要更严格的审计，可改为短期签名 URL 或 cookie-based media session。
5. **可观测性**：补充 Sentry / OpenTelemetry、结构化日志与指标。
6. **内容安全**：在 Gemini 之外增加更严格的图像与文本审核，以及失败重试、配额与成本监控。

---

## 许可

项目代码由本次实现方提供。字体文件（Manrope、Instrument Serif）遵循 SIL Open Font License，许可证位于 `backend/app/assets/fonts/OFL.txt`。本地人物分割模型 u2netp 来自 rembg / U²-Net，遵循 Apache License 2.0；来源与校验值见 `backend/app/assets/models/README.md`。示例 QA 图片未包含在仓库中。
