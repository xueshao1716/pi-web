# -*- coding: utf-8 -*-
"""
UI 视觉分析脚本 (audit-desktop.png / audit-mobile.png)
使用 PIL + numpy 分析像素分布、颜色、亮度、饱和度、区域占比，输出结构化报告。
"""
import os
import sys
import json
from collections import Counter

from PIL import Image

try:
    import numpy as np
    HAS_NUMPY = True
except Exception:
    HAS_NUMPY = False

SHOTS = r"D:\pi-web\frontend\shots"
OUT_TXT = os.path.join(SHOTS, "ui-analysis.txt")

IMAGES = ["audit-desktop.png", "audit-mobile.png"]


def analyze_image(path):
    img = Image.open(path)
    # 强制转换为 RGB，统一分析空间
    img = img.convert("RGB")
    W, H = img.size
    mode = Image.open(path).mode  # 原始模式

    info = {"file": os.path.basename(path), "width": W, "height": H,
            "mode": mode, "format": Image.open(path).format,
            "aspect": round(W / H, 3)}

    if HAS_NUMPY:
        arr = np.asarray(img).astype(np.float32)  # H x W x 3
    else:
        arr = None

    # ---------- 颜色量化：取前 10 主色 ----------
    q = img.quantize(colors=10, method=Image.MEDIANCUT)
    pal = q.getpalette()
    counts = sorted(q.getcolors(), reverse=True)
    total_px = W * H
    top_colors = []
    for count, idx in counts[:10]:
        r, g, b = pal[idx * 3], pal[idx * 3 + 1], pal[idx * 3 + 2]
        pct = round(count / total_px * 100, 2)
        top_colors.append({"rgb": [r, g, b], "hex": "#%02X%02X%02X" % (r, g, b),
                           "pct": pct})
    info["top_colors"] = top_colors

    # ---------- 像素级统计：亮度 / 饱和度 ----------
    if HAS_NUMPY:
        r = arr[..., 0]
        g = arr[..., 1]
        b = arr[..., 2]
        # 感知亮度 (ITU-R BT.601)
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        # 饱和度：HSV 中的 S (相对值，暗色偏高，需配合彩色度解读)
        mx = np.max(arr, axis=2)
        mn = np.min(arr, axis=2)
        sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
        # 感知彩色度 (Hasler-Süsstrunk)：衡量"看起来多鲜艳"
        rg = r - g
        yb = 0.5 * (r + g) - b
        colorfulness = float(np.sqrt(rg.std() ** 2 + yb.std() ** 2)
                             + 0.3 * np.sqrt(rg.mean() ** 2 + yb.mean() ** 2))
    else:
        colorfulness = None
        lum_list = []
        sat_list = []
        for y in range(0, H, 4):
            for x in range(0, W, 4):
                pr, pg, pb = img.getpixel((x, y))
                lum_list.append(0.299 * pr + 0.587 * pg + 0.114 * pb)
                mx = max(pr, pg, pb)
                mn = min(pr, pg, pb)
                sat_list.append((mx - mn) / mx if mx > 0 else 0)
        lum = np.array(lum_list)
        sat = np.array(sat_list)

    # 亮度分布
    dark = float((lum < 64).mean() * 100)
    mid = float(((lum >= 64) & (lum < 192)).mean() * 100)
    bright = float((lum >= 192).mean() * 100)
    avg_lum = float(lum.mean())
    info["brightness"] = {"avg_luminance": round(avg_lum, 1),
                          "dark_pct": round(dark, 2),
                          "mid_pct": round(mid, 2),
                          "bright_pct": round(bright, 2)}

    # 饱和度分布
    low_s = float((sat < 0.2).mean() * 100)
    med_s = float(((sat >= 0.2) & (sat < 0.6)).mean() * 100)
    high_s = float((sat >= 0.6).mean() * 100)
    avg_sat = float(sat.mean())
    # 有效彩色占比：既不算太暗、又是彩色 (可见的彩色区域)
    visible_color = float(((lum >= 64) & (sat >= 0.2)).mean() * 100)
    info["saturation"] = {
        "avg_saturation": round(avg_sat, 2),
        "low_pct": round(low_s, 2),
        "mid_pct": round(med_s, 2),
        "high_pct": round(high_s, 2),
        "colorfulness": (round(colorfulness, 2) if colorfulness is not None else None),
        "visible_color_pct": round(visible_color, 2),
    }

    # ---------- 区域占比 ----------
    def region_stats(region_pixels):
        """region_pixels: Nx3 numpy array"""
        pr = region_pixels[:, 0]
        pg = region_pixels[:, 1]
        pb = region_pixels[:, 2]
        avg = [round(float(pr.mean()), 1), round(float(pg.mean()), 1),
               round(float(pb.mean()), 1)]
        lum_r = 0.299 * pr + 0.587 * pg + 0.114 * pb
        avg_l = round(float(lum_r.mean()), 1)
        mx = np.max(region_pixels, axis=1)
        mn = np.min(region_pixels, axis=1)
        sat_r = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
        avg_s = round(float(sat_r.mean()), 2)
        return {"avg_rgb": avg,
                "hex": "#%02X%02X%02X" % tuple(int(v) for v in avg),
                "avg_luminance": avg_l, "avg_saturation": avg_s}

    if HAS_NUMPY:
        regions = {}
        # 水平三等分（上/中/下）
        h3 = H // 3
        for name, y0, y1 in [("top", 0, h3), ("middle", h3, 2 * h3), ("bottom", 2 * h3, H)]:
            regions[name] = region_stats(arr.reshape(-1, 3)[y0 * W * 3 // 3:y1 * W * 3 // 3] if False else arr[y0:y1].reshape(-1, 3))
        # 垂直三等分（左/中/右）
        w3 = W // 3
        for name, x0, x1 in [("left", 0, w3), ("center", w3, 2 * w3), ("right", 2 * w3, W)]:
            regions[name] = region_stats(arr[:, x0:x1].reshape(-1, 3))
        info["regions"] = regions

    return info


def main():
    lines = []
    lines.append("=" * 64)
    lines.append("UI 视觉分析报告 — 小语 · AI 工作台截图")
    lines.append("生成时间口径: PIL 像素级统计 (numpy=%s)" % HAS_NUMPY)
    lines.append("=" * 64)

    summary = []
    for name in IMAGES:
        path = os.path.join(SHOTS, name)
        info = analyze_image(path)
        summary.append(info)

        lines.append("")
        lines.append("#" * 64)
        lines.append("## %s" % name)
        lines.append("#" * 64)

        # 1. 基本信息
        lines.append("")
        lines.append("## 1. 基本信息")
        lines.append("- 尺寸: %d x %d px" % (info["width"], info["height"]))
        lines.append("- 模式: %s | 格式: %s | 宽高比: %.3f" %
                     (info["mode"], info["format"], info["aspect"]))

        # 2. 主色分布
        lines.append("")
        lines.append("## 2. 主要颜色分布 (Top 10 主色)")
        for i, c in enumerate(info["top_colors"], 1):
            lines.append("%2d. %s  RGB(%3d,%3d,%3d)  占比 %5.2f%%"
                         % (i, c["hex"], *c["rgb"], c["pct"]))

        # 3. 亮度分布
        b = info["brightness"]
        lines.append("")
        lines.append("## 3. 亮度分布")
        lines.append("- 平均亮度: %.1f / 255" % b["avg_luminance"])
        lines.append("- 暗色 (<64):   %5.2f%%" % b["dark_pct"])
        lines.append("- 中间 (64-191): %5.2f%%" % b["mid_pct"])
        lines.append("- 亮色 (>=192): %5.2f%%" % b["bright_pct"])
        dominant = max([("暗色", b["dark_pct"]), ("中间", b["mid_pct"]),
                        ("亮色", b["bright_pct"])], key=lambda x: x[1])
        lines.append("- 主导: %s (%.2f%%)" % dominant)

        # 4. 饱和度
        s = info["saturation"]
        lines.append("")
        lines.append("## 4. 颜色饱和度")
        lines.append("- 平均HSV饱和度: %.2f  (暗色由于相对色差大，此值会偏高)" % s["avg_saturation"])
        lines.append("- 低饱和 (<0.2):  %5.2f%%" % s["low_pct"])
        lines.append("- 中饱和 (0.2-0.6): %5.2f%%" % s["mid_pct"])
        lines.append("- 高饱和 (>=0.6): %5.2f%%" % s["high_pct"])
        cf = s.get("colorfulness")
        cf_txt = ("%.2f" % cf) if cf is not None else "N/A"
        lines.append("- 感知彩色度 (Hasler-Süsstrunk): %s  (值越高越鲜艳)" % cf_txt)
        lines.append("- 可见彩色区域占比 (亮度>=64 且 饱和>=0.2): %5.2f%%" % s["visible_color_pct"])
        cfv = s["colorfulness"]
        if cf is not None and cf < 30:
            style = "低彩度(灰黑主导)的克制深色风格"
        elif cf is not None and cf < 55:
            style = "中等彩度，深色底+彩色强调点缀"
        else:
            style = "高彩度/鲜艳"
        lines.append("- 整体风格: %s" % style)

        # 5. 区域占比
        lines.append("")
        lines.append("## 5. 区域颜色占比")
        lines.append("### 水平三等分 (上/中/下)")
        for k, lab in [("top", "上 1/3"), ("middle", "中 1/3"), ("bottom", "下 1/3")]:
            r = info["regions"][k]
            lines.append("- %s: 均色 %s  亮度 %.1f  饱和度 %.2f"
                         % (lab, r["hex"], r["avg_luminance"], r["avg_saturation"]))
        lines.append("### 垂直三等分 (左/中/右)")
        for k, lab in [("left", "左 1/3"), ("center", "中 1/3"), ("right", "右 1/3")]:
            r = info["regions"][k]
            lines.append("- %s: 均色 %s  亮度 %.1f  饱和度 %.2f"
                         % (lab, r["hex"], r["avg_luminance"], r["avg_saturation"]))

    # 结构对比
    des = summary[0]
    mob = summary[1]
    lines.append("")
    lines.append("#" * 64)
    lines.append("## 6. 结构 / 布局分析")
    lines.append("#" * 64)
    lines.append("")
    lines.append("### 6.1 桌面版 (audit-desktop.png)")
    lines.append("- 三栏布局: 左侧图标导航条 + 备用会话列表面板 + 右侧主内容区。")
    lines.append("- 顶部: 标题/模型选择器/右上操作按钮。")
    lines.append("- 底层: 暗色输入框，含占位符 '%s' 与 '发送/换行' 提示。" %
                 "给小语发消息...")
    lines.append("- 主内容区中央为品牌标识 (语 徽标) 与标题 '%s'、副标题 '%s'。" %
                 ("小语 · AI 工作台", "基于 pi 引擎的 AI 工作伙伴"))
    lines.append("")
    lines.append("### 6.2 移动版 (audit-mobile.png)")
    lines.append("- 单列纵向布局: 顶部模型选择器 + 中央欢迎区 + 底部输入框 + 底部标签栏。")
    lines.append("- 底部 Tab 栏: 对话 / 会话 / 资产 / 任务 / 设置。")
    lines.append("- 主内容区中央为品牌标识 (语 徽标) 与标题、副标题。")
    lines.append("")
    lines.append("### 6.3 共同视觉特征")
    lines.append("- 均为深色主题 (Dark mode)，背景近黑蓝灰。")
    lines.append("- 主品牌色为蓝紫色 (语 徽标)，用于强调/标识。")
    lines.append("- 高占比中性灰黑 + 少量高饱和强调色的 '极简深色' 风格。")
    lines.append("- 大面积留白（负空间），信息密度集中在小区域。")

    lines.append("")
    lines.append("=" * 64)
    lines.append("报告结束")
    lines.append("=" * 64)

    report = "\n".join(lines)
    with open(OUT_TXT, "w", encoding="utf-8") as f:
        f.write(report)
    print(report)
    print("\n[SAVED] " + OUT_TXT)


if __name__ == "__main__":
    main()
