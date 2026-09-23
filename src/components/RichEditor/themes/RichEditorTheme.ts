/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { EditorThemeClasses } from "lexical";

import "./RichEditorTheme.css";

const theme: EditorThemeClasses = {
  autocomplete: "RichEditorTheme__autocomplete",
  blockCursor: "RichEditorTheme__blockCursor",
  characterLimit: "RichEditorTheme__characterLimit",
  embedBlock: {
    base: "RichEditorTheme__embedBlock",
    focus: "RichEditorTheme__embedBlockFocus"
  },
  hashtag: "RichEditorTheme__hashtag",
  heading: {
    h1: "RichEditorTheme__h1",
    h2: "RichEditorTheme__h2",
    h3: "RichEditorTheme__h3",
    h4: "RichEditorTheme__h4",
    h5: "RichEditorTheme__h5",
    h6: "RichEditorTheme__h6"
  },
  hr: "RichEditorTheme__hr",
  image: "editor-image",
  indent: "RichEditorTheme__indent",
  inlineImage: "inline-editor-image",
  layoutContainer: "RichEditorTheme__layoutContainer",
  layoutItem: "RichEditorTheme__layoutItem",
  link: "RichEditorTheme__link",
  list: {
    checklist: "RichEditorTheme__checklist",
    listitem: "RichEditorTheme__listItem",
    listitemChecked: "RichEditorTheme__listItemChecked",
    listitemUnchecked: "RichEditorTheme__listItemUnchecked",
    nested: {
      listitem: "RichEditorTheme__nestedListItem"
    },
    olDepth: [
      "RichEditorTheme__ol1",
      "RichEditorTheme__ol2",
      "RichEditorTheme__ol3",
      "RichEditorTheme__ol4",
      "RichEditorTheme__ol5"
    ],
    ul: "RichEditorTheme__ul"
  },
  ltr: "RichEditorTheme__ltr",
  mark: "RichEditorTheme__mark",
  markOverlap: "RichEditorTheme__markOverlap",
  paragraph: "RichEditorTheme__paragraph",
  quote: "RichEditorTheme__quote",
  rtl: "RichEditorTheme__rtl",
  specialText: "RichEditorTheme__specialText",
  tab: "RichEditorTheme__tabNode",
  table: "RichEditorTheme__table",
  tableCell: "RichEditorTheme__tableCell",
  tableCellActionButton: "RichEditorTheme__tableCellActionButton",
  tableCellActionButtonContainer: "RichEditorTheme__tableCellActionButtonContainer",
  tableCellHeader: "RichEditorTheme__tableCellHeader",
  tableCellResizer: "RichEditorTheme__tableCellResizer",
  tableCellSelected: "RichEditorTheme__tableCellSelected",
  tableRowStriping: "RichEditorTheme__tableRowStriping",
  tableScrollableWrapper: "RichEditorTheme__tableScrollableWrapper",
  tableSelected: "RichEditorTheme__tableSelected",
  tableSelection: "RichEditorTheme__tableSelection",
  text: {
    bold: "RichEditorTheme__textBold",
    capitalize: "RichEditorTheme__textCapitalize",
    code: "RichEditorTheme__textCode",
    italic: "RichEditorTheme__textItalic",
    lowercase: "RichEditorTheme__textLowercase",
    strikethrough: "RichEditorTheme__textStrikethrough",
    subscript: "RichEditorTheme__textSubscript",
    superscript: "RichEditorTheme__textSuperscript",
    underline: "RichEditorTheme__textUnderline",
    underlineStrikethrough: "RichEditorTheme__textUnderlineStrikethrough",
    uppercase: "RichEditorTheme__textUppercase"
  }
};

export default theme;
