# pi-web 技能清单

> 技能 = 可复用的专业指令包。左侧 ⚡ 技能面板即可查看/引用。

- **内置技能**：4 个（随仓库自带，clone 即用）
- **用户技能**：78 个（位于 `~/.agents/skills/`，按需安装）

## 内置技能（随仓库）

| 技能 | 用途 |
|---|---|
| `image-generation` | 图片生成。使用配置的图像模型（如 Agnes / 阿里云百炼 / MiniMax-M3）生成图片。当用户要求画图、生成图 |
| `session-export-redacted` | 导出会话时自动脱敏。将当前会话导出为 HTML/JSONL 时，自动擦除 API Key、令牌、密码等敏感信息，适合分享 |
| `voice-transcribe` | 语音转文字。将音频文件（wav/mp3/m4a）转为文字稿。当用户上传录音、语音消息、会议录音并要求转文字时使用。 |
| `web-search` | 网页搜索。使用 Brave Search API 搜索网页内容。需要环境变量 BRAVE_API_KEY（可选，无 ke |

## 用户技能（参考清单）

> 以下技能需自行安装到 `~/.agents/skills/`（或通过技能市场安装）。

| # | 技能名 | 用途 |
|---|--------|------|
| 1 | `PDF Processing Pro` | Production-ready PDF processing with forms, tables, OCR, validation, a |
| 2 | `agent-team` | 统一管理多智能体角色的团队协作框架，支持智能体动态组合、灵活协作和扩展新角色。智能体本质上是"角色定义"，可以根据任务需求灵活组建团队，实现 |
| 3 | `agentkit-multimedia-shopping` | 基于ByteDance agentkit-samples多媒体用例的小省导购员数字人带货视频生成技能，整合多模态内容生成能力（图像、视频、音 |
| 4 | `article-illustrator` | 分析文章内容，在需要视觉辅助理解的位置生成插画。配图可以是信息补充、概念具象化，或引导读者想象。当用户要求"给文章配图"、"为文章生成插图" |
| 5 | `baoyu-format-markdown` | Formats plain text or markdown files with frontmatter, titles, summari |
| 6 | `baoyu-post-to-wechat` | Posts content to WeChat Official Account (微信公众号) via API or Chrome CDP |
| 7 | `baoyu-post-to-x` | Posts content and articles to X (Twitter). Supports regular posts with |
| 8 | `baoyu-url-to-markdown` | Fetch any URL and convert to markdown using Chrome CDP. Supports two m |
| 9 | `bedtime-story` | 为3-12岁儿童提供温馨亲切的睡前寓言故事和成语典故讲解。支持用户唤醒后提供故事列表选择，或直接讲解指定故事/成语。讲解时保持亲切温馨的语气 |
| 10 | `brainstorming` | You MUST use this before any creative work - creating features, buildi |
| 11 | `chrome-automation` | Connect to and control Google Chrome browser using agent-browser with  |
| 12 | `content-creation-publisher` | 内容创作与发布全流程技能，整合网页采集、Markdown格式化、智能配图、多平台发布（微信公众号、X/Twitter）功能，实现从内容获取到 |
| 13 | `content-research-writer` | Assists in writing high-quality content by conducting research, adding |
| 14 | `contract-review` | Contract review skill that adds comment-based issue annotations withou |
| 15 | `data-storytelling` | Transform data into compelling narratives using visualization, context |
| 16 | `digital-avatar-shopping-video` | 小省导购员多智能体数字人口播带货视频生成系统，以"小省导购员"为核心人设，打造专业购物助手+数字人口播带货视频一体化服务。涵盖五大智能体（小 |
| 17 | `dispatching-parallel-agents` | Use when facing 2+ independent tasks that can be worked on without sha |
| 18 | `dream-video-prompt-generator` | 小省导购员数字人带货版即梦视频提示词生成系统，基于四大智能体协同（提示词生成师、质量管控师、知识库运维师、跨环节适配师），按照"主体+运动+ |
| 19 | `ecommerce-copywriter` | 电商图片文案创作技能，支持多品类产品的吸引性文案生成，适用于电商平台的商品营销推广 |
| 20 | `ecommerce-full-pipeline` | 跨境电商全链路自动化工具。集成1688采集、智能清洗、多平台上架（微信小店/Shopify/TikTok）、推广方案（关键词/竞品分析/广告 |
| 21 | `ecommerce-video-marketing` | 电商视频营销创作技能，支持多品类商品的营销视频脚本生成，包含6阶段创作流程、智能体提示词框架、8种商品类型模板，适用于电商平台、社交媒体、品 |
| 22 | `executing-plans` | Use when you have a written implementation plan to execute in a separa |
| 23 | `find-skills` | 场景驱动+关键词双模式技能发现工具。当用户用自然语言描述场景/需求（如"我想做一个海报""帮我分析股票"），或明确说"安装技能/find s |
| 24 | `finishing-a-development-branch` | Use when implementation is complete, all tests pass, and you need to d |
| 25 | `frontend-design` | Create distinctive, production-grade frontend interfaces with high des |
| 26 | `gzh-design` | 微信公众号文章排版引擎，将 Markdown 转换为可直接粘贴到公众号编辑器的 HTML。主题风格从 references/theme-in |
| 27 | `historical-interview-scripts` | 生成历史名人现代访谈短视频文案，通过古今反差与网络热梗的爆笑结合，创作具有传播力的虚构趣味内容 |
| 28 | `historical-science-video-prod` | 自动化生成历史科学类3分钟科普短视频的全流程素材包，包含口播文案、分镜脚本、Veo2提示词、人物形象规范等，适配即梦平台视频生成。 |
| 29 | `huashu-design` | 花叔Design——用HTML做高保真原型、交互Demo、幻灯片、动画、设计变体探索+设计方向顾问+专家评审。根据任务embody对应专家（ |
| 30 | `img2threejs` | Turn an object or character reference image into a quality-gated, anim |
| 31 | `infinitetalk` | 音频驱动的稀疏帧视频配音工具，支持音频驱动的 Video-to-Video 和 Image-to-Video 生成，实现精准的唇形、头部、身 |
| 32 | `infinitetalk-shopping-avatar` | 专为InfiniteTalk项目设计的小省导购员数字人带货提示词生成技能，基于四大智能体协同（提示词生成师、质量管控师、知识库运维师、跨环节 |
| 33 | `intelligent-content-system` | 智能内容创作与发布全流程系统。根据用户需求自动识别场景，
编排调用网页采集、智能配图、小红书图文生成、热点内容创作、多平台发布等技能，
实现 |
| 34 | `json-canvas` | Create and edit JSON Canvas files (.canvas) with nodes, edges, groups, |
| 35 | `law-to-markdown` | 将法条/规范文件（.txt/.docx/.pdf）转为 Markdown。适用于用户要求“法条转 markdown”“pdf/docx 转  |
| 36 | `media-processor` | 提供基于 FFmpeg 和 ImageMagick 的多媒体处理能力，支持视频和图像的格式转换、分辨率调整、压缩等操作 |
| 37 | `moltbook` | AI Agent的社交网络. 发布帖子、评论、点赞和创建社区。当用户明确要求时才会使用，否则不会使用。 |
| 38 | `multi-agent-meeting` | 模拟多个AI智能体协作开会并进行决策讨论的场景。适用于需要从多个专业角度分析问题、进行辩论和达成共识的场景，如项目决策、技术方案评审、商业策 |
| 39 | `nanobanana-ppt-visualizer` | PPT 视觉增强工具，支持多种风格渲染、交互式播放器生成和视频合成。可与 ppt-generator Skill 协同工作，实现从内容规划到 |
| 40 | `obsidian-bases` | Create and edit Obsidian Bases (.base files) with views, filters, form |
| 41 | `obsidian-markdown` | Create and edit Obsidian Flavored Markdown with wikilinks, embeds, cal |
| 42 | `paper-analysis-assistant` | 根据arXiv论文网址自动下载PDF并进行多维度分析，包括文本提取、词频分析、语音播报、播客对话生成、交互式网页、PPT、总结图和引用分析 |
| 43 | `pet-commerce-creator` | 萌宠带货短视频全流程创作技能，基于COZE视频大模型API，支持萌宠剧情/好物测评/品种科普/宠品带货等全类型创作，覆盖爆款解析反推、知识库 |
| 44 | `poetry-music-visual` | 为古诗词提供配图与配乐的全流程创作指导；支持深度解析诗词意境、生成画面描述、提供配乐创作蓝图（Suno格式）；适用于诗词可视化、MV创作、文 |
| 45 | `pop-up-book-illustration` | 生成3D纸艺弹出书风格插画，具备立体层次感、明亮温暖色调，适用于科技、教育、品牌展示等场景 |
| 46 | `ppt-generator` | 基于七角色协作的智能 PPT 生成与优化工具。支持主题生成、模板推荐、内容填充、AI 智能配图、文本润色和 PPTX 文件生成。适用于学术汇 |
| 47 | `ppt-roadshow-generator` | PPT 路演视频全流程生成器，支持品牌风格学习、智能配音、音效音乐、字幕和一键视频合成。可一次性生成 15-100 页风格统一的完整路演视频 |
| 48 | `pptx-generator` | 将 JSON 格式的 PPT 内容转换为标准的 .pptx 文件。使用 python-pptx 库，支持多种布局、图表、表格和样式。与 pp |
| 49 | `product-manager-toolkit` | Comprehensive toolkit for product managers including RICE prioritizati |
| 50 | `product-marketing-copywriter` | 产品营销文案创作技能，支持多品类产品的吸引性营销文案生成，适用于产品推广、品牌营销、销售转化 |
| 51 | `product-video-creator` | 多智能体协同的商品视频创作流水线，支持从商品信息到成视频的全流程创作：文案生成、故事策划、脚本创作、分镜设计、图片生成、字幕创作、音效推荐及 |
| 52 | `qwen3-asr-assistant` | 智能语音转文字助手，基于 Qwen3-ASR 模型，支持实时语音识别和智能文本改写。可以将录音转换为文字，并一键改写成邮件、笔记、社交媒体文 |
| 53 | `qwen3-tts-local` | 真正的本地语音合成服务，使用 Edge-TTS 引擎，零依赖、零配置、完全离线可用，支持多语言和多种音色 |
| 54 | `receiving-code-review` | Use when receiving code review feedback, before implementing suggestio |
| 55 | `remotion-video-enhancer` | 视频转场与动画增强工具，提取 Remotion 的动画理念，提供高级视频转场效果和 Framer Motion 交互式动画。可与 ppt-g |
| 56 | `requesting-code-review` | Use when completing tasks, implementing major features, or before merg |
| 57 | `skillhub-preference` | Prefer `skillhub` for skill discovery/install/update, then fallback to |
| 58 | `stock-analysis` | 股票个股分析，实时获取价格涨跌幅，计算技术指标和支撑位，识别缺口并判断支撑压力，智能预测未来3天走势并给出操作建议 |
| 59 | `subagent-driven-development` | Use when executing implementation plans with independent tasks in the  |
| 60 | `systematic-debugging` | Use when encountering any bug, test failure, or unexpected behavior, b |
| 61 | `tailored-resume-generator` | Analyzes job descriptions and generates tailored resumes that highligh |
| 62 | `test-driven-development` | Use when implementing any feature or bugfix, before writing implementa |
| 63 | `three-body-video-creator` | 《三体》赛道AI视频创作工具,提供结构化的多智能体协作流程、素材生成与视频合成,涵盖选题深化、视觉设计、音频生成、视频制作全流程 |
| 64 | `tts-voice-synthesis` | 智能语音合成服务，支持音色克隆、拟人化语义适配配音、流式实时生成、多语言与方言支持，提供 1.7B/0.6B 双模型选择 |
| 65 | `using-git-worktrees` | Use when starting feature work that needs isolation from current works |
| 66 | `using-superpowers` | Use when starting any conversation - establishes how to find and use s |
| 67 | `verification-before-completion` | Use when about to claim work is complete, fixed, or passing, before co |
| 68 | `video-creation-pro` | 10大智能体协同的商品视频创作系统，全流程质量闭环（创作→质检→反馈迭代），强制使用COZE视频大模型API进行视频合成，彻底移除本地依赖包 |
| 69 | `video-creation-suite` | 完整的视频创作套件，支持原创创作、视频二创、视频分析三种模式，集成Coze Bot API、Edge-TTS、Suno API，涵盖多智能体 |
| 70 | `video-frame-extractor` | 视频反推工具,支持视频抽帧、视觉模型分析、提示词生成,适用于视频创作参考、内容提取、场景分析 |
| 71 | `video-transcript-downloader` | Download videos, audio, subtitles, and clean paragraph-style transcrip |
| 72 | `viral-video-copywriting` | 专业的爆款短视频文案创作工具。通过对标抖音爆款视频，智能提取视频内容，深度拆解爆款因素，并结合用户需求创作出符合爆款规律的新文案。适用于短视 |
| 73 | `web-design-analyzer` | 分析网页截图，提取设计系统（Design System）并生成结构化数据和可用的 AI Coding Prompt。适用于 UI/UX 设计 |
| 74 | `web-to-app` | 将任意网页转换为桌面应用，支持 macOS/Windows/Linux 三大平台。使用 Rust + Tauri 技术栈，生成的应用体积小（ |
| 75 | `wechat-hotspot-publisher` | 智能采集热点话题，10分制筛选优质选题，AI生成爆款内容（标题/封面/标签/图片/HTML排版），支持素材上传和草稿箱发布，一键发布到微信公 |
| 76 | `writing-plans` | Use when you have a spec or requirements for a multi-step task, before |
| 77 | `writing-skills` | Use when creating new skills, editing existing skills, or verifying sk |
| 78 | `xiaohongshu-makeup` | 小红书美妆内容创作技能，支持笔记生成、笔记优化、文生图描述创作；适用于美妆护肤产品的内容创作、测评和营销推广 |
