import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Mesh } from "three";
import { createFishModel } from "../src/fish.ts";
import { FISH_TYPES } from "../src/sessions.ts";

function appearance(model) {
  const hash = createHash("sha256");
  model.group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    for (const name of ["position", "color"]) {
      const attribute = object.geometry.getAttribute(name);
      if (!attribute) continue;
      const values = attribute.array;
      assert.ok(values.every(Number.isFinite), `${model.group.name} ${name} has invalid values`);
      hash.update(new Uint8Array(values.buffer, values.byteOffset, values.byteLength));
    }
  });
  return hash.digest("hex");
}

test("all ten fish have distinct finite geometry and restore the same appearance", () => {
  const appearances = new Set();
  for (const species of FISH_TYPES) {
    const original = createFishModel(species);
    const restored = createFishModel(species);
    try {
      appearances.add(appearance(original));
      assert.equal(appearance(original), appearance(restored), species);
      for (const time of [1, 10000]) {
        original.animate(time, 1);
        restored.animate(time, 1);
        assert.equal(appearance(original), appearance(restored), `${species} animation`);
      }
    } finally {
      original.dispose();
      restored.dispose();
    }
  }
  assert.equal(appearances.size, FISH_TYPES.length);
});
