# CornerPet

**一只住在桌角的小生命。**

用户可以自己捏一只角色，或把喜欢的照片变成桌角伙伴，再把它带到 macOS 桌面陪伴自己。CornerPet 探索的是一种安静、低打扰、由用户亲手建立情感连接的桌面陪伴体验。

每天打开电脑，桌角总是空着。开场短片讲的是：那里慢慢出现一只小生命；它会发呆、睡觉，偶尔回应你，陪伴从此有了一个不打扰人的位置。用户先亲手创造它，再决定如何让它留下来。

**核心路径：** DIY 3D 或照片本地抠图 → 预览、命名、保存 → 带到 macOS 桌角互动。

## 1. Preview

**先看 21 秒开场故事：** [播放原始短片](docs/assets/story-opening.mp4)。下方动图取自同一段实际录屏。

[![CornerPet 开场故事：空桌角出现一只安静陪伴的小生命](docs/assets/story-opening.gif)](docs/assets/story-opening.mp4)

画面里的小团从一个空桌角出现，先好奇地张望，再短暂入睡，最后留在角落陪你。这是产品想交付的情绪和节奏：有存在感，也允许用户继续专注自己的事。

### 从创建到桌角

![DIY 3D 工作台](docs/assets/diy-studio.png)

| 照片创建入口 | 命名与保存完成页 |
| --- | --- |
| ![照片创建页](docs/assets/photo-creator.png) | ![命名与保存完成页](docs/assets/finish.png) |

DIY 工作台提供六种 3D 基础造型，下面是创建页中的实际选择界面：

![六种 DIY 3D 基础造型](docs/assets/diy-shapes.png)

| 糯米团 | 草莓团 | 小吐司 |
| --- | --- | --- |
| ![糯米团 3D 造型](docs/assets/models/mochi.png) | ![草莓团 3D 造型](docs/assets/models/strawberry.png) | ![小吐司 3D 造型](docs/assets/models/toast.png) |
| 云朵 | 布丁 | 小蘑菇 |
| ![云朵 3D 造型](docs/assets/models/cloud.png) | ![布丁 3D 造型](docs/assets/models/pudding.png) | ![小蘑菇 3D 造型](docs/assets/models/mushroom.png) |

照片路径的这组对比以同一张**合成测试猫照片**为起点。本地抠图是当前产品的实际结果，毛发边缘可手动修整；最右侧是为说明未来风格方向单独制作的**视觉示意**，不是 CornerPet API 或当前 Demo 根据该照片生成的结果。

| 原始照片 | 本地抠图：真实产品结果 | 风格化：独立视觉示意 |
| --- | --- | --- |
| ![合成测试猫原图](docs/assets/cat-original.png) | ![同一照片的本地抠图结果](docs/assets/cat-cutout.png) | ![参考同一合成猫制作的风格化概念图，非产品 API 结果](docs/assets/cat-stylized-illustration.png) |

照片风格化的当前预览是两张**固定的原创 Demo 角色**，与上面的猫照片无生成关系。未配置图片 API 时会默认展示这些示例，并在界面标明来源。预览中的表情按钮可演示开心、困困、发呆、害羞、惊讶等反馈；真实照片经 Seedream 生成对应表情的效果仍待验证。

| 预置 Demo 角色 1 | 预置 Demo 角色 2 |
| --- | --- |
| ![麻薯芽预置角色](public/examples/mochi-sprout.png) | ![绒云预置角色](public/examples/plush-cloud.png) |

下面五张是**同一个预置 Demo 角色在当前产品里点击表情按钮后的角色局部截图**，展示桌宠如何回应用户；它们不代表上传照片已经生成了五种表情。

| 开心 | 困困 | 发呆 |
| --- | --- | --- |
| ![Demo 小伙伴开心表情](docs/assets/expressions/happy.png) | ![Demo 小伙伴困困表情](docs/assets/expressions/sleepy.png) | ![Demo 小伙伴发呆表情](docs/assets/expressions/daydream.png) |
| 害羞 | 惊讶 | |
| ![Demo 小伙伴害羞表情](docs/assets/expressions/shy.png) | ![Demo 小伙伴惊讶表情](docs/assets/expressions/surprised.png) | |

桌面宠物的真实 macOS 场景截图尚待补充；不使用合成桌面效果图代替实机截图。

## 2. Why I built it

桌面上常驻的产品很容易变成新的干扰。CornerPet 从一个产品问题出发：**能否让陪伴存在于日常工作中，同时把控制权留给用户？**

因此，它让用户先参与角色的诞生，再让角色以呼吸、偶尔回应和轻提醒的方式住在桌角。这里展示的是产品原型与设计取舍，不把尚未完成的能力包装成已验证成果。

## 3. Core Experience

- **亲手创造**：选择 3D 形态、材质、颜色、表情和配饰，实时看到变化。
- **带来熟悉的它**：上传照片，在浏览器本地去背景并手动修整，做成保留原貌的 2D 伙伴。
- **留在桌角**：命名、保存、导出 `.cornerpet`，在 macOS 上交给透明置顶的桌宠窗口。
- **安静互动**：点击、拖动和调整大小；闲置、睡眠、回来欢迎及长时间使用提醒由同一状态机驱动。

## 4. Product Flow

```text
选择来处 ── DIY 3D ───────────────┐
          └─ 照片 → 本地抠图 / 预置 Demo ─┤
                                       ↓
                            预览 → 命名 → 本地保存
                                       ↓
                        .cornerpet 导出 / 送往 macOS 桌面
```

照片的“预置 Demo”只演示后续体验；它**不会**读取照片特征来生成角色。

## 5. Key Product Decisions

1. **低打扰优先**：默认轻微呼吸与偶发动作，提醒频率受限制；用户可隐藏或退出。
2. **两条创建路径，一个陪伴体验**：DIY 3D 与照片 2D 共用命名、保存、交接和桌宠互动，避免把照片路径做成孤立的展示页。
3. **本地优先**：基础体验无需账号。照片保留模式在浏览器内抠图；完整角色留在浏览器或用户自己的 Mac。
4. **清楚标注 AI 边界**：预置图明确写作 Demo；真实 AI 生成作为可选实验能力，失败时仍能使用基础体验。

## 6. What I built

这个 0→1 原型包含 Web 创建工作台、两种角色路径、统一角色数据、浏览器本地存储、`.cornerpet` 文件、Web 到 Electron 的本机交接，以及 macOS 透明桌宠窗口。仓库保留实现与测试，产品状态以下表为准。

## 7. AI in CornerPet

| 用途 | 当前实际状态 |
| --- | --- |
| 照片去背景 | 浏览器 Worker 运行 MODNet / U²-NetP；保留原图路径不调用云端图片服务。 |
| 风格化 Demo | 使用本仓库内的两张原创预置 PNG，上传照片不会影响 Demo 结果。 |
| Seedream 风格化 | 已有服务端接口与异步任务代码，需部署者自己的火山方舟 `ARK_API_KEY`；配置后点击创建会自动尝试真实生成，但真实照片效果仍待验收。点击生成时，浏览器先抠图，再把主体发送至服务端和豆包。 |
| 任意照片转可旋转 3D | 未实现。DIY 3D 不等于照片 3D 化。 |

预置 Demo 图与测试猫照片是为此公开候选版重新生成的合成素材，没有参考真实人物肖像。图像生成参与了素材制作；这里不以素材生成证明线上 AI API 已通过验收。

## 8. Current Status

| 状态 | 能力 |
| --- | --- |
| **已完成** | DIY 3D、照片保留原图的 2D 角色、本地抠图、命名与保存、`.cornerpet` 导出、Web → Desktop 交接、桌宠基础互动与状态机。 |
| **Demo** | 照片风格化的预置角色；与上传内容无关。 |
| **Experimental / 待验证** | Seedream 真实 AI 风格化：接口已接入，仍需用真实服务与照片验证结果和部署环境。 |
| **未实现** | 任意照片 → 可旋转 3D 模型。 |

桌面端当前面向 Apple Silicon macOS；可在本机生成未签名 DMG / ZIP，尚无公开下载，也未完成公证或 Intel Mac 验收。

## 9. Try it

**[在线体验 Web 版](https://cornerpet-companion-test.netlify.app/)**：可以直接捏 3D 角色、上传照片做本地抠图，并体验命名、保存与预置风格化角色。当前测试站未接入可用的图片生成 API Key；点击创建后会说明这次使用预置示例，结果与上传照片无关。基础体验无需账号和 Key。

**不填 API Key 本地运行：** 按下方命令启动 Web，选 **DIY**，或选 **照片 → 保留它** 做本地抠图。选 **照片 → 捏成桌角生物** 时，页面默认使用预置 Demo，并明确提示结果并非根据照片生成。

**使用自己的 API Key：** 在仓库根目录把 `.env.example` 复制为 `.env`，填写自己的 `ARK_API_KEY`，重启 `npm run dev` 并刷新网页。进入 **照片 → 捏成桌角生物**，上传照片，点“创建我的桌角生物”：有 Key 会自动尝试真实生成；没有 Key 会在点击后提示当前使用预置示例。页面不要求选择 Demo 或真实模式。这里只检测到服务端是否配置了 Key，不能保证 Key 有效或生成质量；调用可能产生费用，真实生成失败时可以主动改用预置示例。Key 不填在网页里，也不会发送给浏览器。

要体验桌面交接，需要在同一台 Mac 启动 Electron 开发版，浏览器按提示允许打开应用与访问本机连接。

## 10. Run locally

Web 需要 Node.js 22.12+ 和 npm；Electron 桌面端需要 macOS。

```sh
git clone https://github.com/ask6688/cornerpet.git
cd cornerpet
npm ci
npm run dev          # http://127.0.0.1:5173/
npm test
npm run build
npm run desktop      # macOS：构建后启动 Electron 开发版
npm run dist:mac     # 可选：在 Apple Silicon Mac 本机生成未签名 DMG / ZIP
```

只有实验真实生成时才需配置密钥：在仓库根目录运行 `cp .env.example .env`，用编辑器打开 `.env`，将 `ARK_API_KEY=` 后填上自己的火山方舟 Key；`ARK_IMAGE_MODEL` 可留空。保存后重启开发服务器。`.env` 已被 Git 忽略；浏览器只读取“是否可用”的布尔状态，读不到 Key。**在线体验站不提供给访客填写 Key 的入口**；要用自己的 Key，请克隆仓库后在本地配置。公开部署需同时部署 `dist/` 与 `netlify/functions/`，在部署平台的服务端环境变量中配置 Key；若模型权限尚未开通，可设置 `CORNERPET_DEMO_ONLY=true` 暂时让站点只体验预置示例。纯静态部署只提供无 Key 的基础体验。生成的安装文件留在已忽略的 `release/`，目前尚未提供公开下载；它们未签名、未公证，也未做 Intel Mac 验收。

## 11. Tech Stack

React、TypeScript、Three.js / React Three Fiber、Vite、Electron、ONNX Runtime Web；可选的 Netlify Functions + Blobs 与火山方舟 Seedream 用于实验图片生成。

## 12. Roadmap

- 用真实服务和多种授权照片验收 Seedream 输出质量、透明度与表情一致性。
- 决定未签名的 Apple Silicon 安装包如何对外提供，再评估签名／公证与 Intel Mac 适配。
- 继续评估透明窗口空白区域点击穿透与照片 3D 化；后者目前没有可交付方案。
