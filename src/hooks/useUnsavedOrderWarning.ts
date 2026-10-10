import { useEffect } from "react";
import { App } from "antd";
import { useBlocker } from "react-router";

const ORDER_COPY = {
  title: "Thứ tự chưa được lưu",
  content: "Rời trang sẽ bỏ các thay đổi thứ tự chưa lưu."
};

export default function useUnsavedOrderWarning(
  dirty: boolean,
  copy: { title: string; content: string } = ORDER_COPY
): void {
  const blocker = useBlocker(dirty);
  const { modal } = App.useApp();
  const proceed = blocker.state === "blocked" ? blocker.proceed : undefined;
  const reset = blocker.state === "blocked" ? blocker.reset : undefined;
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  useEffect(() => {
    if (!proceed || !reset) return;
    const confirmation = modal.confirm({
      title: copy.title,
      content: copy.content,
      okText: "Bỏ thay đổi và rời đi",
      cancelText: "Ở lại",
      onOk: () => proceed(),
      onCancel: () => reset()
    });
    return () => confirmation.destroy();
  }, [modal, proceed, reset, copy.title, copy.content]);
}
