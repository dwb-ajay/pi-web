import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { createRoot } = await jiti.import("react-dom/client");
const { ExplorerPlacement } = await jiti.import("./explorer-placement.tsx");
const { act } = await jiti.import("react");

const h = React.createElement;
let mounts = 0;
function ExplorerProbe() {
  const [instance] = React.useState(() => ++mounts);
  const [value, setValue] = React.useState("upload pending");
  return h("button", { "data-instance": instance, onClick: () => setValue("upload complete") }, value);
}

test("right-left-right placement moves one live explorer and preserves interaction state", { skip: typeof document === "undefined" }, async () => {
  const left = document.createElement("div");
  const right = document.createElement("div");
  document.body.append(left, right);
  const root = createRoot(left);
  const render = (onRight) => act(() => root.render(h(ExplorerPlacement, { onRight, host: right }, h(ExplorerProbe))));
  const settle = () => act(async () => {});
  const current = () => document.querySelector("[data-instance]");

  render(false);
  await settle();
  const instance = current().dataset.instance;
  act(() => current().click());
  assert.equal(current().textContent, "upload complete");

  render(true);
  await settle();
  assert.equal(right.querySelectorAll("[data-instance]").length, 1);
  assert.equal(left.querySelectorAll("[data-instance]").length, 0);
  assert.equal(right.querySelector("[data-instance]").dataset.instance, instance);
  assert.equal(right.querySelector("[data-instance]").textContent, "upload complete");

  render(false);
  await settle();
  assert.equal(left.querySelectorAll("[data-instance]").length, 1);
  assert.equal(right.querySelectorAll("[data-instance]").length, 0);
  render(true);
  await settle();
  assert.equal(right.querySelectorAll("[data-instance]").length, 1);
  assert.equal(right.querySelector("[data-instance]").dataset.instance, instance);
  assert.equal(mounts, 1);

  act(() => root.unmount());
  left.remove();
  right.remove();
});
