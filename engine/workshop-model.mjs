export function pickWorkshopModel(ctx, body) {
  const raw = String(body?.model || "").trim();
  const list = typeof ctx.getModelList === "function" ? (ctx.getModelList() || []) : [];
  if (raw.includes("/")) {
    const i = raw.indexOf("/");
    const hit = list.find(m => m.provider === raw.slice(0, i) && m.id === raw.slice(i + 1));
    if (hit) return hit;
  }
  return ctx.defaultModel;
}
