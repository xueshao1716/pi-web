---
name: wanxiang-design
description: 万像平面设计提示词系统。专业平面设计提示词工程框架——设计控制三维坐标系（商业/实验/复杂度）+ 东方美学参数化 + 全域色彩引擎 + 字体/构图/品牌基因。当用户要求生成海报/Banner/品牌视觉/平面设计/设计提示词时使用。蒸馏自《万像平面设计提示词生成系统》（18章 4.7万字）。
---

# 万像平面设计提示词系统

面向平面设计领域的结构化提示词工程框架。把专业设计知识（网格/字体/色彩/构图）编码为 AI 可严格执行的指令集。

## 核心约束（外部兼容性）

- 输出纯净自然语言提示词（MJ/SD/即梦通用），禁止内部编号/函数
- 禁止占位符 `{xxx}`——关键字段必须具体填写
- 符号仅允许 `, . " + ( ) # -`；角度用汉字"度"
- 鼓励跨章节调用一切技术方案

## 设计控制三维坐标系（核心）

任何设计先用三维坐标定位风格：

| 维度 | 范围 | 含义 |
|---|---|---|
| **X 商业-艺术** | 0-100 | 0=纯艺术 / 50=平衡 / 100=纯商业（转化优先） |
| **Y 传统-实验** | 0-100 | 0=经典 / 50=融合（新中式）/ 100=前卫实验 |
| **Z 简约-复杂** | 0-100 | 0=极简（大量留白）/ 50=丰富 / 100=信息密集 |

**坐标 → AI 指令示例**：
- 高端文化海报 `[X:30,Y:40,Z:20]` → elegant cultural poster, minimalist layout, traditional modern fusion, ample white space, sophisticated typography（负面: no commercial, no vibrant, no crowded）
- 科技品牌概念图 `[X:70,Y:80,Z:60]` → tech conceptual, futuristic, complex details, glowing elements
- 电商促销 Banner `[X:90,Y:20,Z:70]` → e-commerce banner, high contrast, clear CTA, product focus（负面: no artistic ambiguity, no subtle colors）

## 东方美学参数化（三大核心）

| 美学 | 技术参数 | AI 指令 | 负面控制 |
|---|---|---|---|
| **留白意境** | 留白 40-60%，单一焦点 | ample white space, minimalist, single focal point | no crowded, no cluttered |
| **水墨韵律** | 墨色 5-8 阶，宣纸纹理 | ink wash, watercolor gradient, brush texture, rice paper | no solid colors, no digital look |
| **对称平衡** | 不对称对称，阴阳构图 | asymmetrical balance, visual weight distribution | no perfect symmetry |

**极简主义公式**：核心元素 ≤3、色彩 ≤3、字体 ≤2、留白率 ≥40%

## 全域色彩引擎

- **东方五色**：赤(#C53A3A 热情/吉祥) / 青(清雅) / 黄(尊贵) / 白(空灵) / 黑(沉稳)
- 色彩情感 → 应用场景（按钮/促销/节庆）+ AI 指令（chinese red accent, vibrant energy）
- 60:30:10 色彩比例：主色 60% / 辅色 30% / 强调 10%

## 文字系统（字体选择 → 信息层级）

- 字体数量 ≤2（标题 + 正文）
- 标题字体表达气质（衬线=古典/无衬线=现代/书法=东方）
- 信息层级：主标题 → 副标题 → 正文 → 辅助信息（字号递减）

## 品牌视觉基因座（平面版）

品牌视觉一致性要素：
- 标志/色彩/字体/辅助图形/版式 5 要素统一
- 每个物料（名片/海报/包装/网页）沿用同一基因

## 使用流程

1. **定位**：问清设计类型（海报/Banner/品牌/包装）+ 目标（转化/品牌/艺术）
2. **三维坐标**：定 X/Y/Z 值 → 生成风格基调
3. **美学选择**：东方三大核心 or 极简 or 其他
4. **色彩**：选情感色 + 60:30:10 比例
5. **文字**：定字体对 + 信息层级
6. **输出**：正向指令 + 负面控制（JSON-like 或自然语言）
7. **验证**：坐标是否对齐需求、留白是否达标、色彩是否和谐

## 参考文档

- 完整 18 章系统：技能目录 `万像平面-完整系统.docx`
- 提取文本：`D:\遗产\万像平面 3.docx`
