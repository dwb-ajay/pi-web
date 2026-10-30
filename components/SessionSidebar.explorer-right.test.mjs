import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

// Server snapshot of file-explorer placement is right: one files panel, in the hidden home, not a second explorer and not the Files tab.
const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const { SessionSidebar } = await jiti.import("./SessionSidebar.tsx");

const h = React.createElement;

test("right placement keeps Sessions on the left and does not render a second explorer there", () => {
  const html = renderToStaticMarkup(h(I18nProvider, null, h(SessionSidebar, {
    selectedSessionId: null,
    onSelectSession: () => {},
    selectedCwd: "/work/alpha",
  })));
  assert.match(html, /id="session-sidebar-panel-sessions"/);
  assert.equal(html.match(/id="session-sidebar-panel-files"/g)?.length ?? 0, 1);
  assert.doesNotMatch(html, /id="session-sidebar-tab-files"/);
  assert.doesNotMatch(html, /is-files-below/);
});
