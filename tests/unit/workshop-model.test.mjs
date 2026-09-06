import test from "node:test";
import assert from "node:assert/strict";
import { pickWorkshopModel } from "../../engine/workshop-model.mjs";

test("pickWorkshopModel：body.model 命中列表则用它，否则回落 defaultModel", () => {
  const glm = { provider: "zhipu", id: "glm-5", name: "GLM" };
  const flash = { provider: "sensenova", id: "flash", name: "Flash" };
  const ctx = { defaultModel: glm, getModelList: () => [glm, flash] };
  assert.equal(pickWorkshopModel(ctx, { model: "sensenova/flash" }), flash);
  assert.equal(pickWorkshopModel(ctx, { model: "nope/x" }), glm);
  assert.equal(pickWorkshopModel(ctx, {}), glm);
});
