/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { JSX } from "react";
import { CAN_USE_DOM } from "@/components/RichEditor/shared/canUseDOM";
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { ClearEditorPlugin } from "@lexical/react/LexicalClearEditorPlugin";
import { ClickableLinkPlugin } from "@lexical/react/LexicalClickableLinkPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HashtagPlugin } from "@lexical/react/LexicalHashtagPlugin";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { TablePlugin } from "@lexical/react/LexicalTablePlugin";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { useEffect, useState } from "react";

import { LexicalEditor } from "lexical";
import { useSharedHistoryContext } from "./context/SharedHistoryContext";
import ActionsPlugin from "./plugins/ActionsPlugin";
import AutoLinkPlugin from "./plugins/AutoLinkPlugin";
import ComponentPickerPlugin from "./plugins/ComponentPickerPlugin";
import DragDropPaste from "./plugins/DragDropPastePlugin";
import DraggableBlockPlugin from "./plugins/DraggableBlockPlugin";
import FloatingLinkEditorPlugin from "./plugins/FloatingLinkEditorPlugin";
import FloatingTextFormatToolbarPlugin from "./plugins/FloatingTextFormatToolbarPlugin";
import ImagesPlugin from "./plugins/ImagesPlugin";
import InlineImagePlugin from "./plugins/InlineImagePlugin";
import { LayoutPlugin } from "./plugins/LayoutPlugin/LayoutPlugin";
import LinkPlugin from "./plugins/LinkPlugin";
import ListMaxIndentLevelPlugin from "./plugins/ListMaxIndentLevelPlugin";
import ShortcutsPlugin from "./plugins/ShortcutsPlugin";
import TableCellResizer from "./plugins/TableCellResizer";
import ToolbarPlugin from "./plugins/ToolbarPlugin";
import ContentEditable from "./ui/ContentEditable";
import { cn } from "@/utils/cn";

type Props = {
  onChange: (editor: LexicalEditor) => void;
  onMount?: (editor: LexicalEditor) => void;
  className?: string;
  containerClassName?: string;
};

export default function InnerEditor({
  onChange,
  onMount,
  className,
  containerClassName
}: Props): JSX.Element {
  const { historyState } = useSharedHistoryContext();
  const isEditable = useLexicalEditable();
  const placeholder = "Enter some text...";
  const [floatingAnchorElem, setFloatingAnchorElem] = useState<HTMLDivElement | null>(null);
  const [isSmallWidthViewport, setIsSmallWidthViewport] = useState<boolean>(false);
  const [editor] = useLexicalComposerContext();
  const [activeEditor, setActiveEditor] = useState(editor);
  const [isLinkEditMode, setIsLinkEditMode] = useState<boolean>(false);

  const onRef = (_floatingAnchorElem: HTMLDivElement) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem);
    }
  };

  useEffect(() => {
    const updateViewPortWidth = () => {
      const isNextSmallWidthViewport =
        CAN_USE_DOM && window.matchMedia("(max-width: 1025px)").matches;

      if (isNextSmallWidthViewport !== isSmallWidthViewport) {
        setIsSmallWidthViewport(isNextSmallWidthViewport);
      }
    };
    updateViewPortWidth();
    window.addEventListener("resize", updateViewPortWidth);

    return () => {
      window.removeEventListener("resize", updateViewPortWidth);
    };
  }, [isSmallWidthViewport]);

  useEffect(() => {
    onMount?.(editor);
  }, [editor, onMount]);

  return (
    <div className={cn("editor-shell", className)}>
      <ToolbarPlugin
        editor={editor}
        activeEditor={activeEditor}
        setActiveEditor={setActiveEditor}
        setIsLinkEditMode={setIsLinkEditMode}
      />
      <ShortcutsPlugin editor={activeEditor} setIsLinkEditMode={setIsLinkEditMode} />
      <div className={cn("editor-container", containerClassName)}>
        <DragDropPaste />
        <AutoFocusPlugin />
        <ClearEditorPlugin />
        <ComponentPickerPlugin />
        <HashtagPlugin />
        <AutoLinkPlugin />
        <HistoryPlugin externalHistoryState={historyState} />
        <RichTextPlugin
          contentEditable={
            <div className='editor-scroller'>
              <div className='editor' ref={onRef}>
                <ContentEditable placeholder={placeholder} />
              </div>
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <ListPlugin />
        <CheckListPlugin />
        <ListMaxIndentLevelPlugin maxDepth={7} />
        <TablePlugin hasCellMerge hasCellBackgroundColor hasHorizontalScroll />
        <TableCellResizer />
        <OnChangePlugin
          ignoreHistoryMergeTagChange
          ignoreSelectionChange
          onChange={(_, editor) => onChange(editor)}
        />
        <ImagesPlugin />
        <InlineImagePlugin />
        <LinkPlugin />
        <ClickableLinkPlugin disabled={isEditable} />
        <HorizontalRulePlugin />
        <TabIndentationPlugin />
        <LayoutPlugin />
        <ActionsPlugin />
        {floatingAnchorElem && !isSmallWidthViewport && (
          <>
            <DraggableBlockPlugin anchorElem={floatingAnchorElem} />
            <FloatingLinkEditorPlugin
              anchorElem={floatingAnchorElem}
              isLinkEditMode={isLinkEditMode}
              setIsLinkEditMode={setIsLinkEditMode}
            />
            <FloatingTextFormatToolbarPlugin
              anchorElem={floatingAnchorElem}
              setIsLinkEditMode={setIsLinkEditMode}
            />
          </>
        )}
      </div>
    </div>
  );
}
