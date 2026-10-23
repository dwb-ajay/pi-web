import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { SidebarMenuSurface, filterSidebarMenuItems, sidebarMenuHasFilter } = await jiti.import("./SidebarMenu.tsx");
const { workspacePickerMenuItems } = await jiti.import("./WorkspaceExplorer.tsx");

const h = React.createElement;

test("Add existing search reaches a session past the first 200", () => {
  const sessions = Array.from({ length: 201 }, (_, index) => ({
    id: `s${String(index).padStart(3, "0")}`,
    cwd: "/repo",
    projectKey: "proj",
    name: `named-${index}`,
    firstMessage: `opening-${index}`,
    modified: new Date(Date.parse("2026-01-01T00:00:00.000Z") + index * 1000).toISOString(),
    messageCount: index + 1,
  }));
  const items = workspacePickerMenuItems(sessions, "proj", ["s200"], (session) => `${session.messageCount} messages`, "Already added");
  assert.equal(items.length, 201);
  assert.equal(sidebarMenuHasFilter(items, 1), true);
  const oldest = filterSidebarMenuItems(items, "opening-0");
  assert.deepEqual(oldest.map((item) => item.id), ["s000"]);
  assert.equal(oldest[0].label, "named-0");
  assert.match(oldest[0].note, /1 messages/);
  const html = renderToStaticMarkup(h(SidebarMenuSurface, {
    sheet: false,
    ariaLabel: "Add existing session",
    items,
    filter: { placeholder: "Search sessions", emptyLabel: "No match", minChoices: 1 },
    filterQuery: "opening-0",
    onActivate: () => {},
    onClose: () => {},
  }));
  assert.match(html, /data-sidebar-menu-filter/);
  assert.match(html, /named-0/);
  assert.doesNotMatch(html, /named-200/);
});
