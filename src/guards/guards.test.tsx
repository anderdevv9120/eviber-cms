import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import AuthenticatedGuard from "./AuthenticatedGuard";
import PublicGuard from "./PublicGuard";
import { ACCESS_TOKEN_KEY } from "@/constants";
import { PATH, PATH_AUTH } from "@/constants/paths";
import { removeCookies, setCookies } from "@/utils/cookies";

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={PATH_AUTH.AUTH} element={<PublicGuard />}>
          <Route path={PATH_AUTH.LOGIN} element={<div>login page</div>} />
        </Route>
        <Route
          path={PATH.DASHBOARD}
          element={
            <AuthenticatedGuard>
              <div>dashboard page</div>
            </AuthenticatedGuard>
          }
        />
        <Route path={PATH.HOME} element={<div>home page</div>} />
      </Routes>
    </MemoryRouter>
  );

describe("route guards", () => {
  afterEach(() => removeCookies(ACCESS_TOKEN_KEY));

  it("không có access token → dashboard chuyển về login", () => {
    renderAt(PATH.DASHBOARD);
    expect(screen.getByText("login page")).toBeTruthy();
  });

  it("có access token → dashboard render, trang login chuyển về home", () => {
    setCookies(ACCESS_TOKEN_KEY, "token");
    renderAt(PATH.DASHBOARD);
    expect(screen.getByText("dashboard page")).toBeTruthy();

    renderAt(PATH_AUTH.LOGIN);
    expect(screen.getByText("home page")).toBeTruthy();
  });
});
