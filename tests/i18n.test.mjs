import test from "node:test";
import assert from "node:assert/strict";
import { MESSAGES, resolveLocale, translate } from "../src/i18n.ts";

test("explicit language overrides the browser, while invalid preferences follow supported browser languages", () => {
  assert.equal(resolveLocale("en", ["zh-CN"]), "en");
  assert.equal(resolveLocale("zh-CN", ["en-US"]), "zh-CN");
  assert.equal(resolveLocale(null, ["zh-TW", "en-US"]), "zh-CN");
  assert.equal(resolveLocale(null, ["en-GB", "zh-CN"]), "en");
  assert.equal(resolveLocale("invalid", ["fr-FR", "ZH-hans"]), "zh-CN");
  assert.equal(resolveLocale(null, ["fr-FR"]), "en");
  assert.equal(resolveLocale(null, []), "en");
});

test("both dictionaries cover the same interface and preserve all interpolation values", () => {
  assert.deepEqual(Object.keys(MESSAGES.en).sort(), Object.keys(MESSAGES["zh-CN"]).sort());
  for (const key of Object.keys(MESSAGES.en)) {
    const tokens = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    assert.ok(MESSAGES.en[key].trim(), key);
    assert.ok(MESSAGES["zh-CN"][key].trim(), key);
    assert.deepEqual(tokens(MESSAGES.en[key]), tokens(MESSAGES["zh-CN"][key]), key);
    if (key !== "language") assert.doesNotMatch(MESSAGES.en[key], /\p{Script=Han}/u, key);
  }
});

test("translated counts, statuses and parameters render directly without reinterpreting user text", () => {
  assert.equal(translate("en", "activeSession", { count: 1 }), "1 active session");
  assert.equal(translate("en", "activeSessions", { count: 2 }), "2 active sessions");
  assert.equal(translate("zh-CN", "activeSessions", { count: 2 }), "2 个活跃会话");
  assert.equal(translate("en", "working"), "Working");
  assert.equal(translate("en", "nextGroup", { group: 3, total: 8 }), "Next school · 3 / 8");
  assert.equal(translate("en", "currentCompanion", { name: "西施惠 $& {count}" }), "Current companion: 西施惠 $& {count}");
});
