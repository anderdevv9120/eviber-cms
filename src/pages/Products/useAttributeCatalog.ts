import { useEffect, useRef, useState } from "react";
import { listAttributeOptionsAPI, type AttributeOption } from "@/services/attributes";
import { getErrorMessage } from "@/utils/getErrorMessage";

export function useAttributeCatalog(attributeIds: string[], enabled: boolean) {
  const [catalog, setCatalog] = useState<{
    enabled: boolean;
    attributes: AttributeOption[] | null;
    error: string | null;
  }>({ enabled, attributes: null, error: null });
  const loaded = useRef<AttributeOption[] | null>(null);
  if (catalog.enabled !== enabled) setCatalog({ enabled, attributes: null, error: null });
  const idsKey = attributeIds.join(",");
  useEffect(() => {
    if (!enabled) {
      loaded.current = null;
      return;
    }
    const ids = idsKey ? idsKey.split(",") : [];
    const cached = loaded.current;
    if (cached && ids.every(id => cached.some(row => row._id === id))) return;
    const controller = new AbortController();
    listAttributeOptionsAPI(ids, controller.signal).then(
      ({ data }) => {
        if (!controller.signal.aborted) {
          loaded.current = data;
          setCatalog({ enabled, attributes: data, error: null });
        }
      },
      (cause: unknown) => {
        if (!controller.signal.aborted)
          setCatalog(current => ({ ...current, error: getErrorMessage(cause) }));
      }
    );
    return () => controller.abort();
  }, [idsKey, enabled]);
  const attributes = enabled ? (catalog.attributes ?? []) : [];
  return {
    attributes,
    values: Object.fromEntries(attributes.map(attribute => [attribute._id, attribute.values])),
    error: enabled ? catalog.error : null
  };
}
