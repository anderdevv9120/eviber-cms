import { beforeEach, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Form } from "antd";
import "@/test/attribute-fixtures";
import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import { useAppStore } from "@/store/useAppStore";
import ImageField from "./ImageField";
import type { PermissionCode } from "@/constants/permissions";

beforeEach(() => useAppStore.getState().setProfile(ownerProfile));

it("uses its screen permission for image actions and rechecks after revocation", async () => {
  useAppStore.getState().setProfile(staffProfile(["STORE_INFO_UPDATE"]));
  const permission = { permission: "STORE_INFO_UPDATE" as PermissionCode };
  render(
    <Form initialValues={{ image: "/images/draft.jpg" }}>
      <ImageField
        {...permission}
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
  const remove = screen.getByRole("button", { name: "Xoá ảnh" }) as HTMLButtonElement;
  expect(remove.disabled).toBe(false);
  await act(async () => useAppStore.getState().setProfile(staffProfile(["CONTENT_HOME_UPDATE"])));
  expect(remove.disabled).toBe(true);
  remove.disabled = false;
  fireEvent.click(remove);
  expect(screen.getByAltText("Draft image").getAttribute("src")).toContain("/images/draft.jpg");
});

it.each([
  { profile: ownerProfile, saving: true },
  { profile: staffProfile(["CONTENT_HOME_READ"]), saving: false }
])("keeps image actions disabled by form state and authority: %j", ({ profile, saving }) => {
  useAppStore.getState().setProfile(profile);
  render(
    <Form disabled={saving} initialValues={{ image: "/images/draft.jpg" }}>
      <ImageField
        permission='CONTENT_HOME_UPDATE'
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
