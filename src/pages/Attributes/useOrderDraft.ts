import { useState } from "react";

const equal = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, index) => id === b[index]);

export default function useOrderDraft(serverIds: readonly string[], serverRevision: number) {
  const [stored, setDraft] = useState(() => ({
    savedIds: [...serverIds],
    expectedRevision: serverRevision,
    valueIds: [...serverIds]
  }));
  // Only the page's successful authoritative reads change these inputs.
  let draft = stored;
  if (stored.expectedRevision !== serverRevision || !equal(stored.savedIds, serverIds)) {
    draft = {
      savedIds: [...serverIds],
      expectedRevision: serverRevision,
      valueIds: [...serverIds]
    };
    setDraft(draft);
  }
  return {
    valueIds: draft.valueIds,
    expectedRevision: draft.expectedRevision,
    dirty: !equal(draft.valueIds, draft.savedIds),
    move(valueId: string, direction: "up" | "down") {
      setDraft(previous => {
        const index = previous.valueIds.indexOf(valueId);
        const destination = index + (direction === "up" ? -1 : 1);
        if (index < 0 || destination < 0 || destination >= previous.valueIds.length)
          return previous;
        const valueIds = [...previous.valueIds];
        [valueIds[index], valueIds[destination]] = [valueIds[destination], valueIds[index]];
        return { ...previous, valueIds };
      });
    },
    moveTo(valueId: string, targetId: string) {
      setDraft(previous => {
        const index = previous.valueIds.indexOf(valueId);
        const destination = previous.valueIds.indexOf(targetId);
        if (index < 0 || destination < 0 || index === destination) return previous;
        const valueIds = [...previous.valueIds];
        valueIds.splice(index, 1);
        valueIds.splice(destination, 0, valueId);
        return { ...previous, valueIds };
      });
    },
    discard() {
      setDraft(previous => ({ ...previous, valueIds: [...previous.savedIds] }));
    }
  };
}
