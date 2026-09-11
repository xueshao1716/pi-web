import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadAndPersistDeck } from "../../engine/workshop-html-deck.mjs";

test("loadAndPersistDeck：缺 deck.json 时从 pages 兜底并持久化清单", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-html-deck-"));
  const pages = path.join(root, "pages");
  fs.mkdirSync(pages);
  fs.writeFileSync(path.join(pages, "page-02.html"), "<body data-page='2'></body>");
  fs.writeFileSync(path.join(pages, "page-01.html"), "<body data-page='1'></body>");
  try {
    const result = loadAndPersistDeck(root, { verb: "对照" });
    assert.equal(result.list.length, 2);
    assert.equal(result.list[0].file, "pages/page-01.html");
    assert.equal(result.deck.verb, "对照");
    assert.ok(fs.existsSync(result.deckPath), "兜底清单必须写回，交付历史才能引用");
    assert.deepEqual(JSON.parse(fs.readFileSync(result.deckPath, "utf8")), result.deck);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("loadAndPersistDeck：坏 deck.json 也能从页面恢复", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-html-deck-"));
  const pages = path.join(root, "pages");
  fs.mkdirSync(pages);
  fs.writeFileSync(path.join(root, "deck.json"), "{broken");
  fs.writeFileSync(path.join(pages, "page-01.html"), "<body data-page='1'></body>");
  try {
    const result = loadAndPersistDeck(root, { verb: "揭示" });
    assert.equal(result.list.length, 1);
    assert.equal(result.deck.verb, "揭示");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
