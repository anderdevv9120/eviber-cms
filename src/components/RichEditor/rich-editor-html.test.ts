import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import { $getRoot, createEditor } from "lexical";
import { describe, expect, it } from "vitest";
import RichEditorNodes from "./nodes/RichEditorNodes";

// Same import/export path as RichEditor/index.tsx (initialHtml → nodes, nodes → onChange html)
const roundTrip = (html: string): string => {
  const editor = createEditor({
    nodes: RichEditorNodes,
    onError: error => {
      throw error;
    }
  });
  editor.update(
    () => {
      const nodes = $generateNodesFromDOM(
        editor,
        new DOMParser().parseFromString(html, "text/html")
      );
      $getRoot()
        .clear()
        .append(...nodes);
    },
    { discrete: true }
  );
  return editor.getEditorState().read(() => $generateHtmlFromNodes(editor));
};

describe("RichEditor HTML round trip", () => {
  it("keeps a relative /images/ src as written, not resolved against the CMS origin", () => {
    const html = roundTrip('<p>Mô tả <img src="/images/a.png" alt="a"></p>');
    expect(html).toContain('src="/images/a.png"');
  });

  it("keeps an https src unchanged", () => {
    const html = roundTrip('<p><img src="https://cdn.example/b.jpg" alt="b"></p>');
    expect(html).toContain('src="https://cdn.example/b.jpg"');
  });
});
