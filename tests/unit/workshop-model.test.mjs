import test from "node:test";
import assert from "node:assert/strict";
import { pickWorkshopModel, pickExpandModel, pickFlashTextModel } from "../../engine/workshop-model.mjs";

test("pickWorkshopModel：body.model 命中列表则用它，否则回落 defaultModel", () => {
  const glm = { provider: "zhipu", id: "glm-5", name: "GLM" };
  const flash = { provider: "sensenova", id: "flash", name: "Flash" };
  const ctx = { defaultModel: glm, getModelList: () => [glm, flash] };
  assert.equal(pickWorkshopModel(ctx, { model: "sensenova/flash" }), flash);
  assert.equal(pickWorkshopModel(ctx, { model: "nope/x" }), glm);
  assert.equal(pickWorkshopModel(ctx, {}), glm);
});

test("智能填充未指定模型时优先 flash 文本模型，不偷偷用旗舰", () => {
  const pro = { provider: "agnes", id: "agnes-2.5-pro", name: "Pro", capabilities: { text: true } };
  const flash = { provider: "agnes", id: "agnes-2.5-flash", name: "Flash", capabilities: { text: true } };
  const img = { provider: "agnes", id: "agnes-image-2.1-flash", name: "Image", capabilities: { image: true } };
  const list = [pro, flash, img];
  assert.equal(pickFlashTextModel(list), flash);
  const ctx = { defaultModel: pro, getModelList: () => list };
  assert.equal(pickExpandModel(ctx, {}), flash);
  assert.equal(pickExpandModel(ctx, { model: "agnes/agnes-2.5-pro" }), pro);
});
