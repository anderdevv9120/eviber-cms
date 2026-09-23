import "./index.css";

import { debounce } from "@/utils/debounce";
import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import { InitialConfigType, LexicalComposer } from "@lexical/react/LexicalComposer";
import { $getRoot, LexicalEditor, LexicalNode } from "lexical";
import { SharedHistoryContext } from "./context/SharedHistoryContext";
import { ToolbarContext } from "./context/ToolbarContext";
import InnerEditor from "./InnerEditor";
import RichEditorNodes from "./nodes/RichEditorNodes";
import { TableContext } from "./plugins/TablePlugin";
import RichEditorTheme from "./themes/RichEditorTheme";
import { useCallback } from "react";

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

  const initEditorState = useCallback((editor: LexicalEditor) => {
    editor.update(() => {
      if (!initialHtml) return;

      const parser = new DOMParser();
      const dom = parser.parseFromString(initialHtml, "text/html");
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
