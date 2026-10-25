import { beforeEach, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Form } from "antd";
import "@/test/attribute-fixtures";
import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import { useAppStore } from "@/store/useAppStore";
import ImageField from "./ImageField";

beforeEach(() => useAppStore.getState().setProfile(ownerProfile));

it.each([
  { profile: ownerProfile, saving: true },
  { profile: staffProfile(["CONTENT_HOME_READ"]), saving: false }
])("keeps image actions disabled by form state and authority: %j", ({ profile, saving }) => {
  useAppStore.getState().setProfile(profile);
  render(
    <Form disabled={saving} initialValues={{ image: "/images/draft.jpg" }}>
      <ImageField
        name={["image"]}
        alt='Draft image'
        optional
        uploading={false}
        onUpload={() => {
          throw new Error("Unexpected upload");
        }}
      />
    </Form>
  );
  expect((screen.getByRole("button", { name: /Đổi ảnh/ }) as HTMLButtonElement).disabled).toBe(
    true
  );
  const remove = screen.getByRole("button", { name: "Xoá ảnh" }) as HTMLButtonElement;
  expect(remove.disabled).toBe(true);
  remove.disabled = false;
  fireEvent.click(remove);
  expect(screen.getByAltText("Draft image").getAttribute("src")).toContain("/images/draft.jpg");
});
