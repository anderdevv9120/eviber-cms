import "@/test/attribute-fixtures";
import { describe, expect, it, vi } from "vitest";
import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import { deferred, response } from "@/test/attribute-fixtures";
import { useAppStore } from "@/store/useAppStore";
import axiosRequest from "@/utils/request";
import { clearSession, saveTokens } from "@/utils/session";
import { refreshProfile } from "./auth";

describe("profile refresh", () => {
  it("reuses permissions until exactly one hour after a successful check", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const adapter = vi.fn(async config => response(config, ownerProfile));
    axiosRequest.defaults.adapter = adapter;
    await refreshProfile();
    clock.mockReturnValue(now + 3_599_999);
    await refreshProfile();
    expect(adapter).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(now + 3_600_000);
    await refreshProfile();
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed profile check", async () => {
    const adapter = vi.fn().mockRejectedValueOnce(new Error("offline"));
    adapter.mockImplementationOnce(async config => response(config, ownerProfile));
    axiosRequest.defaults.adapter = adapter;
    await expect(refreshProfile()).rejects.toThrow("offline");
    await refreshProfile();
    expect(useAppStore.getState().profile).toEqual(ownerProfile);
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  it("does not reuse cached permissions after logout and sign-in", async () => {
    axiosRequest.defaults.adapter = async config => response(config, ownerProfile);
    await refreshProfile();
    clearSession();
    saveTokens({
      accessToken: "new",
      refreshToken: "new-refresh",
      accessExpiresIn: 60000,
      refreshExpiresIn: 60000
    });
    axiosRequest.defaults.adapter = async config => response(config, staffProfile([]));
    await refreshProfile();
    expect(useAppStore.getState().profile?._id).toBe("staff");
  });

  it("does not reuse cached permissions after another tab changes the session", async () => {
    axiosRequest.defaults.adapter = async config => response(config, ownerProfile);
    await refreshProfile();
    const previous = useAppStore.getState();
    clearSession();
    saveTokens({
      accessToken: "other-tab",
      refreshToken: "other-tab-refresh",
      accessExpiresIn: 60000,
      refreshExpiresIn: 60000
    });
    useAppStore.setState({ profile: previous.profile, sessionRevision: previous.sessionRevision });
    axiosRequest.defaults.adapter = async config => response(config, staffProfile([]));
    await refreshProfile();
    expect(useAppStore.getState().profile?._id).toBe("staff");
  });

  it("deduplicates concurrent refreshes", async () => {
    const pending = deferred<typeof ownerProfile>();
    const adapter = vi.fn(async config => response(config, await pending.promise));
    axiosRequest.defaults.adapter = adapter;
    const first = refreshProfile();
    const second = refreshProfile();
    pending.resolve(ownerProfile);
    await Promise.all([first, second]);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().profile?._id).toBe("owner");
  });

  it.each(["logout", "new account"])("ignores a late profile after %s", async change => {
    const pending = deferred<typeof ownerProfile>();
    axiosRequest.defaults.adapter = async config => response(config, await pending.promise);
    const refresh = refreshProfile();
    await Promise.resolve();
    clearSession();
    if (change === "new account") {
      saveTokens({
        accessToken: "new",
        refreshToken: "new-refresh",
        accessExpiresIn: 60000,
        refreshExpiresIn: 60000
      });
      useAppStore.getState().setProfile(staffProfile([]));
    }
    pending.resolve(ownerProfile);
    await refresh;
    expect(useAppStore.getState().profile?._id ?? null).toBe(change === "logout" ? null : "staff");
  });

  it("ignores a profile when cookies belong to an account signed in through another tab", async () => {
    const pending = deferred<typeof ownerProfile>();
    axiosRequest.defaults.adapter = async config => response(config, await pending.promise);
    const refresh = refreshProfile();
    await Promise.resolve();
    const revision = useAppStore.getState().sessionRevision;
    clearSession();
    saveTokens({
      accessToken: "other-tab",
      refreshToken: "other-tab-refresh",
      accessExpiresIn: 60000,
      refreshExpiresIn: 60000
    });
    // Another tab shares cookies, but cannot update this tab's in-memory store.
    useAppStore.setState({ profile: null, sessionRevision: revision });
    pending.resolve(ownerProfile);
    await refresh;
    expect(useAppStore.getState().profile).toBeNull();
  });
});
