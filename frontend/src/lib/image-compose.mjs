// 构图格子：按「衣服、背景 × 这套拍法」现写光影，不锁死下拉那几句。

export function composeImageShot(card, story = {}) {
  if (!card) {
    return { lighting: "", mood: "", style: "", shot: "", angle: "", pose: "", bg: "" };
  }
  const mood = card.mood || "";
  const shot = card.shot || "半身特写";
  const angle = card.angle || "平视";
  const pose = card.pose || "";
  const bg = String(story.bg || "").trim() || card.bg || "";
  if (story.lightingLocked && String(story.lighting || "").trim()) {
    return { lighting: story.lighting, mood, style: card.style || "写实", shot, angle, pose, bg };
  }
  const t = `${story.bg || ""} ${story.outfit || ""} ${story.look || ""}`;
  let lighting = card.lighting || "窗边柔光";
  const dramatic = /聚光|单灯|戏剧|高对比/.test(`${card.lighting || ""}${card.name || ""}`);
  if (/宫廷|发冠|古风|珠宝/.test(t)) {
    lighting = dramatic ? "宫廷暖金，戏剧聚光切开轮廓" : "金色侧光，丝绸和珠宝有高光";
  } else if (/霓虹|赛博|金属/.test(t)) {
    lighting = "霓虹冷暖对冲，金属反光";
  } else if (/街|民国|胶片/.test(t)) {
    lighting = dramatic ? `${card.lighting}，街道侧光` : "街道自然光，浅景深";
  }
  const style = /宫廷|发冠|古风/.test(t) && card.style && card.style !== "工笔画"
    ? `${card.style}，古装料子清楚`
    : (card.style || "写实");
  return { lighting, mood, style, shot, angle, pose, bg };
}
