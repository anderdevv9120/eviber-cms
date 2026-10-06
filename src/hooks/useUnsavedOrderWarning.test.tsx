import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, Link, RouterProvider } from "react-router";
import { App, ConfigProvider } from "antd";
import { useState } from "react";
import "@/test/attribute-fixtures";
import useUnsavedOrderWarning from "./useUnsavedOrderWarning";

function Editor() {
  const [dirty, setDirty] = useState(false);
  useUnsavedOrderWarning(dirty);
  return (
    <>
      <button onClick={() => setDirty(true)}>Change</button>
      <button onClick={() => setDirty(false)}>Discard</button>
      <Link to='/list'>Sidebar link</Link>
    </>
  );
}
const setup = () => {
  const router = createMemoryRouter(
    [
      { path: "/edit", element: <Editor /> },
      { path: "/list", element: <p>List page</p> }
    ],
    {
      initialEntries: ["/list", "/edit"],
      initialIndex: 1
    }
  );
  const view = render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <App component={false}>
        <RouterProvider router={router} />
      </App>
    </ConfigProvider>
  );
  return { router, ...view };
};
describe("unsaved ordering navigation", () => {
  it("blocks links, stays with the draft, then discards and leaves", async () => {
    const { router } = setup();
    fireEvent.click(screen.getByText("Change"));
    fireEvent.click(screen.getByText("Sidebar link"));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Ở lại" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/edit"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByText("Sidebar link"));
    fireEvent.click(await screen.findByRole("button", { name: "Bỏ thay đổi và rời đi" }));
    await screen.findByText("List page");
    expect(router.state.location.pathname).toBe("/list");
  });
  it("blocks browser back and supports cancel then confirm", async () => {
    const { router } = setup();
    fireEvent.click(screen.getByText("Change"));
    act(() => {
      void router.navigate(-1);
    });
    fireEvent.click(await screen.findByRole("button", { name: "Ở lại" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    act(() => {
      void router.navigate(-1);
    });
    fireEvent.click(await screen.findByRole("button", { name: "Bỏ thay đổi và rời đi" }));
    await screen.findByText("List page");
  });
  it("warns only while dirty and cleans up beforeunload on unmount", () => {
    const { unmount } = setup();
    const unload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(false);
    fireEvent.click(screen.getByText("Change"));
    expect(unload()).toBe(true);
    fireEvent.click(screen.getByText("Discard"));
    expect(unload()).toBe(false);
    fireEvent.click(screen.getByText("Change"));
    unmount();
    expect(unload()).toBe(false);
  });
});
