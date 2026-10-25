import { useEffect, useState } from "react";
import { listAttributeOptionsAPI, type AttributeOption } from "@/services/attributes";
import { getErrorMessage } from "@/utils/getErrorMessage";

export function useAttributeCatalog(attributeIds: string[], enabled: boolean) {
  const [attributes, setAttributes] = useState<AttributeOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const idsKey = attributeIds.join(",");
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    listAttributeOptionsAPI(idsKey ? idsKey.split(",") : [], controller.signal).then(
      ({ data }) => {
        if (!controller.signal.aborted) {
          setAttributes(data);
          setError(null);
        }
      },
      (cause: unknown) => {
        if (!controller.signal.aborted) setError(getErrorMessage(cause));
      }
    );
    return () => controller.abort();
  }, [idsKey, enabled]);
  return {
    attributes,
    values: Object.fromEntries(attributes.map(attribute => [attribute._id, attribute.values])),
    error
  };
}
