import { useEffect, useRef, useState } from "react";
import {
  getAttributeValuesAPI,
  listAttributesAPI,
  type AttributeSummary,
  type AttributeValueSummary
} from "@/services/attributes";
import { getErrorMessage } from "@/utils/getErrorMessage";

// ponytail: one page of 100 attributes; add search/paging when the dictionary outgrows it
const ATTRIBUTE_PAGE_SIZE = 100;

/** Attribute list once, plus each listed attribute's values in dictionary order. */
export function useAttributeCatalog(attributeIds: string[]) {
  const [attributes, setAttributes] = useState<AttributeSummary[]>([]);
  const [values, setValues] = useState<Record<string, AttributeValueSummary[]>>({});
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(new Set<string>());
  const idsKey = attributeIds.join(",");
  useEffect(() => {
    const controller = new AbortController();
    listAttributesAPI({ pageSize: ATTRIBUTE_PAGE_SIZE }, controller.signal).then(
      ({ data }) => setAttributes(data.data),
      (cause: unknown) => {
        if (!controller.signal.aborted) setError(getErrorMessage(cause));
      }
    );
    return () => controller.abort();
  }, []);
  useEffect(() => {
    for (const id of idsKey ? idsKey.split(",") : []) {
      if (requested.current.has(id)) continue;
      requested.current.add(id);
      getAttributeValuesAPI(id).then(
        ({ data }) => setValues(previous => ({ ...previous, [id]: data.values })),
        (cause: unknown) => {
          requested.current.delete(id);
          setError(getErrorMessage(cause));
        }
      );
    }
  }, [idsKey]);
  return { attributes, values, error };
}
