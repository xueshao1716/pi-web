# 元枢连续创作编排设计

## 目标

为元枢增加一套统一的故事项目与创作编排层，让连续剧情的小说、图片和视频共享同一份可控状态。系统采用“分镜时间线 + 节点侧栏”的交互：时间线负责叙事节奏，侧栏负责当前镜头的输入、参数、模型和版本。

第一阶段的成功标准：

- 新建故事项目后，可以维护角色、场景、道具、服装、风格和剧情规则。
- 每个镜头可以引用这些实体，并记录提示词、模型、参数、seed、输入资产、输出资产和版本。
- 图片、视频和小说输出都从同一镜头状态生成；重新生成只影响选中的镜头版本。
- 上游模型不支持参考图、关键帧或 seed 时，系统明确展示降级原因，不伪装成保持一致。
- 用户可以从任意镜头继续、重跑、比较版本，且历史记录可追溯。

## 范围与边界

### 纳入

1. 故事项目与 Story Bible。
2. 角色、场景、道具、服装、风格和规则实体。
3. 分镜时间线与镜头详情侧栏。
4. 图片、视频、小说的统一生成记录。
5. 资产引用、版本、seed、模型能力和降级信息。
6. 单镜头重跑、从镜头继续、前后版本对比。
7. 适配现有媒体接口，并为 ComfyUI 工作流导入/导出预留接口。

### 暂不纳入

- 完整复制 ComfyUI 的自由画布和插件生态。
- 自动无审阅地生成整部长篇小说或整部视频。
- 强制所有模型使用同一种参考图、seed 或参数。
- 云端协作、多人权限和计费。

小说输出必须处于可控范围：按章节/场景/段落生成，继承 Story Bible 的角色与世界规则，并在提交下一段前保留用户可编辑的中间稿。

## 现状与接入点

- 前端已有 `WorkshopView`、`NovelStudioView`、`VideoGeneratePanel`、`GeneratePanel` 和资产组件，可作为呈现层接入点。
- 后端已有 `engine/media-api.mjs`、`video-request.mjs`、`workshop-novel*.mjs`、`gallery-core.mjs` 和媒体通道工具，可复用现有模型调用与产物入库逻辑。
- 现有生成请求主要以单条 prompt 为中心，缺少跨镜头的状态、血缘和能力协商；新增编排层应包在现有调用之上，避免破坏当前聊天出图和视频流程。

## 核心数据模型

数据以 JSON 文件落在工作空间的项目目录，使用原子写入；后续若规模增长再迁移 SQLite。每个对象带 `id`、`createdAt`、`updatedAt` 和 `version`。

```ts
type StoryProject = {
  id: string;
  title: string;
  logline?: string;
  bible: StoryBible;
  scenes: Scene[];
  activeSceneId?: string;
  createdAt: string;
  updatedAt: string;
};

type StoryBible = {
  characters: Character[];
  locations: Location[];
  props: Prop[];
  wardrobe: Wardrobe[];
  style: StyleProfile;
  rules: ContinuityRule[];
};

type Scene = {
  id: string;
  index: number;
  title: string;
  summary: string;
  beats: Beat[];
  stateBefore?: Record<string, string>;
  stateAfter?: Record<string, string>;
  outputs: GenerationRun[];
};

type Beat = {
  id: string;
  kind: "novel" | "image" | "video";
  prompt: string;
  references: AssetRef[];
  inheritFromBeatId?: string;
  activeRunId?: string;
};

type GenerationRun = {
  id: string;
  beatId: string;
  kind: Beat["kind"];
  model: { provider: string; id: string };
  capabilities: { reference: boolean; keyframe: boolean; seed: boolean };
  params: Record<string, unknown>;
  seed?: number;
  inputAssets: AssetRef[];
  outputAssets: AssetRef[];
  status: "queued" | "running" | "succeeded" | "failed" | "degraded";
  degradation?: string[];
  error?: string;
  parentRunId?: string;
  createdAt: string;
  finishedAt?: string;
};
```

`AssetRef` 只保存资产 id、用途和裁切/权重等轻量信息，不复制大文件。生成结果继续进入现有资产库，并在元数据中写入 `projectId`、`sceneId`、`beatId` 和 `runId`，形成可追溯血缘。

## 系统架构

### 1. Story Orchestrator

新增编排模块负责：读取项目状态、解析镜头继承、合并 Story Bible、选择输出适配器、创建 GenerationRun、持久化状态和发出进度事件。它不直接实现模型协议。

### 2. Capability Adapter

为 image、video、novel 各提供适配器，统一输入为：

```ts
{ project, scene, beat, inheritedState, model, signal }
```

适配器返回标准化的请求、能力说明和结果。能力协商顺序为：

1. 原生参考图/关键帧/seed。
2. 平台支持的等价参数。
3. 明确降级：把关键实体摘要注入 prompt，并在 run 上写入 `degradation`。

### 3. Existing Media Gateway

复用 `media-api.mjs` 的图像和视频调用，复用小说工坊的段落生成；统一由 Orchestrator 负责上下文和版本，不改变聊天中的快捷生成行为。

### 4. Frontend Story Workbench

新增工作台页面或在现有 Workshop 路由中增加模式：

- 顶部：项目标题、Story Bible 状态、保存/导出。
- 中部：横向分镜时间线，镜头卡片显示类型、缩略图、状态和版本。
- 右侧：当前镜头节点链，分为“继承输入 → 提示词 → 模型参数 → 输出版本”。节点采用卡片式折叠，不做自由拖拽画布。
- 移动端：时间线可横向滚动，节点侧栏改为底部抽屉，避免常驻悬浮遮挡。

## 数据流

1. 用户创建项目并填写 Story Bible。
2. 新增镜头，选择输出类型（小说/图片/视频）并引用角色、场景等实体。
3. Orchestrator 解析继承链，生成标准化上下文和能力需求。
4. Adapter 调用现有模型通道；运行状态通过现有 SSE/事件总线回传。
5. 结果入资产库，写回 GenerationRun 和镜头 activeRunId。
6. 用户可编辑提示词、替换参考资产、固定 seed 后单镜头重跑；新 run 通过 parentRunId 关联旧版本。
7. “从此处继续”复制当前镜头后的继承状态，创建新的后续镜头，不覆盖原时间线。

## 错误与降级

- 模型不支持某项能力：继续执行，但在侧栏显示“已降级”和具体原因。
- 参考资产失效或路径不存在：阻止提交并给出替换入口。
- 生成任务超时：保留 `running` 记录，允许恢复轮询或安全重试；不重复扣除已创建的任务。
- 部分输出成功：每个输出单独记录，镜头状态显示部分完成。
- 项目文件损坏：从最近一次原子快照恢复，并保留损坏文件供诊断。
- 小说生成越过规则：先标记为草稿并显示触发的规则，不能自动发布到成稿。

## 测试与验收

### 后端单元测试

- 继承链按顺序合并，循环引用被拒绝。
- Story Bible 更新只影响新 run，旧 run 保持不可变。
- 适配器在 reference/keyframe/seed 不支持时返回准确降级信息。
- 重跑和从此处继续产生新的 run id，并正确设置 parentRunId。
- 生成失败、超时和部分成功的状态转换可恢复。

### 前端契约测试

- 时间线按 `scene.index` 和更新时间稳定排序。
- 当前镜头侧栏展示输入、参数、输出和版本；移动端使用抽屉。
- 版本对比、单镜头重跑、从此处继续按钮可见且可触达。
- 资产引用缺失时显示阻止原因，不提交空请求。

### 集成验收

用一个包含 3 个镜头的示例项目验证：同一角色和场景在小说、图片、视频三类 beat 中都能被引用；至少模拟一个不支持参考图的模型并正确显示降级；重跑第二镜头后第一镜头产物和元数据不变。

## 分阶段交付

### 阶段一：状态与编排骨架

项目/Story Bible/Scene/Beat/Run 数据结构、存储、API、能力适配接口和工作台壳。

### 阶段二：连续图片与小说

角色/场景资产锁定、图片参考链、小说段落继承、版本对比和移动端抽屉。

### 阶段三：连续视频

关键帧/参考图适配、镜头队列、单镜头恢复、批量执行和结果拼接入口。

### 阶段四：ComfyUI 桥接

导入/导出受控工作流 JSON；仅把 ComfyUI 作为可选执行器，元枢仍持有项目状态、权限和产物血缘。

## 非目标与风险控制

自由节点画布会显著增加移动端复杂度，因此推迟到阶段四评估。模型能力差异无法由 UI 完全消除，必须把降级状态作为一等数据展示。所有生成均可回滚到旧 run，避免“重跑覆盖历史”。
