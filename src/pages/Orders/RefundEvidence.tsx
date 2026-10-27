import { useEffect, useState } from "react";
import { Image } from "antd";
import { getRefundEvidenceAPI } from "@/services/refunds";

type Loaded = { url: string } | { failed: true };

// Private evidence is fetched with the admin token; the object URLs live only while shown.
export default function RefundEvidence({
  orderId,
  evidenceIds,
  label
}: {
  orderId: string;
  evidenceIds: string[];
  label: string;
}) {
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});
  const idsKey = evidenceIds.join(",");

  useEffect(() => {
    if (!idsKey) return;
    const controller = new AbortController();
    const urls: string[] = [];
    let active = true;
    for (const id of idsKey.split(",")) {
      getRefundEvidenceAPI(orderId, id, controller.signal)
        .then(blob => {
          if (!active) return;
          if (!(blob instanceof Blob)) throw new Error("Evidence response is not an image");
          const url = URL.createObjectURL(blob);
          urls.push(url);
          setLoaded(current => ({ ...current, [id]: { url } }));
        })
        .catch(() => {
          if (active) setLoaded(current => ({ ...current, [id]: { failed: true } }));
        });
    }
    return () => {
      active = false;
      controller.abort();
      urls.forEach(url => URL.revokeObjectURL(url));
      setLoaded({});
    };
  }, [orderId, idsKey]);

  if (!evidenceIds.length) return null;
  return (
    <div className='mt-2 flex flex-wrap gap-2'>
      {evidenceIds.map((id, index) => {
        const position = `${index + 1}/${evidenceIds.length}`;
        const image = loaded[id];
        if (!image) return <span key={id}>Đang tải ảnh bằng chứng {position}</span>;
        if ("failed" in image)
          return <span key={id}>Không tải được ảnh bằng chứng {position}</span>;
        return (
          <Image
            key={id}
            src={image.url}
            alt={`Ảnh bằng chứng ${position} — ${label}`}
            width={120}
            height={120}
            className='object-cover'
          />
        );
      })}
    </div>
  );
}
