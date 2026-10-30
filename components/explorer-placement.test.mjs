import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

// The explorer's React parent must stay the same when placement or the host changes.
const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { createRoot } = await jiti.import("react-dom/client");
const { ExplorerPlacement } = await jiti.import("./explorer-placement.tsx");
const { act } = await jiti.import("react");

const h = React.createElement;

let serial = 0;
function Probe() {
  const [id] = React.useState(() => ++serial);
  const [token, setToken] = React.useState("upload-1");
  return h("button", {
    "data-id": String(id),
    "data-token": token,
    onClick: () => setToken("upload-2"),
  }, token);
}

test("moving the explorer between left and right keeps its state and instance", { skip: typeof document === "undefined" }, async () => {
  const rootEl = document.createElement("div");
  document.body.appendChild(rootEl);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(rootEl);
  const render = (onRight, hostNode) => {
    act(() => {
      root.render(h(ExplorerPlacement, { onRight, host: hostNode }, h(Probe)));
    });
  };
  const probe = () => document.querySelector("[data-id]");

  render(false, null);
  await act(async () => {});
  const id = probe().dataset.id;
  act(() => { probe().click(); });
  assert.equal(probe().dataset.token, "upload-2");
  assert.equal(probe().dataset.id, id);

  render(true, null);
  await act(async () => {});
  assert.equal(probe().dataset.id, id);
  assert.equal(probe().dataset.token, "upload-2");

  render(true, host);
  await act(async () => {});
  assert.equal(host.querySelector("[data-id]").dataset.id, id);
  assert.equal(host.querySelector("[data-id]").dataset.token, "upload-2");

  render(false, host);
  await act(async () => {});
  assert.equal(rootEl.querySelector("[data-id]").dataset.id, id);
  assert.equal(rootEl.querySelector("[data-id]").dataset.token, "upload-2");

  act(() => { root.unmount(); });
  rootEl.remove();
  host.remove();
});
