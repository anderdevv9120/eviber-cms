import "./index.css";

import { debounce } from "@/utils/debounce";
import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import { InitialConfigType, LexicalComposer } from "@lexical/react/LexicalComposer";
import { $getRoot, LexicalEditor } from "lexical";
import { SharedHistoryContext } from "./context/SharedHistoryContext";
import { ToolbarContext } from "./context/ToolbarContext";
import InnerEditor from "./InnerEditor";
import RichEditorNodes from "./nodes/RichEditorNodes";
import { TableContext } from "./plugins/TablePlugin";
import RichEditorTheme from "./themes/RichEditorTheme";
import { useCallback, useRef } from "react";

const initialConfig: InitialConfigType = {
  namespace: "RichEditor",
  nodes: RichEditorNodes,
  onError: (error: Error) => {
    throw error;
  },
  theme: RichEditorTheme
};

type Props = {
  className?: string;
  containerClassName?: string;
  initialHtml?: string;
  onChange?: (html: string) => void;
};

export const RichEditor = ({ onChange, initialHtml, ...props }: Props) => {
  const generateHtml = debounce(
    (editor: LexicalEditor) =>
      editor?.update(() => {
        const html = $generateHtmlFromNodes(editor);
        onChange?.(html);
      }),
    300
  );

  // initialHtml chỉ nạp 1 lần lúc mount — nạp lại theo prop sẽ clear editor giữa lúc đang gõ
  // (dùng controlled với onChange). Cần nạp nội dung khác thì caller đổi `key`.
  const initialHtmlRef = useRef(initialHtml);

  const initEditorState = useCallback((editor: LexicalEditor) => {
    editor.update(() => {
      const html = initialHtmlRef.current;
      if (!html) return;

      const parser = new DOMParser();
      const dom = parser.parseFromString(html, "text/html");
      const nodes = $generateNodesFromDOM(editor, dom);

      const root = $getRoot();
      root.clear();
      root.append(...nodes);
    });
  }, []);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <SharedHistoryContext>
        <TableContext>
          <ToolbarContext>
            <InnerEditor {...props} onMount={initEditorState} onChange={generateHtml} />
          </ToolbarContext>
        </TableContext>
      </SharedHistoryContext>
    </LexicalComposer>
  );
};
