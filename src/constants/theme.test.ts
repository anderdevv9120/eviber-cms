import { theme } from "antd";
import { describe, expect, it } from "vitest";
import { getAppTheme } from "./theme";

describe("CMS heading hierarchy", () => {
  it.each(["light", "dark"] as const)("keeps section headings smaller in %s mode", mode => {
    const token = theme.getDesignToken(getAppTheme(mode));
    expect(Number(token.fontSizeHeading2)).toBeGreaterThan(Number(token.fontSizeHeading3));
    expect(Number(token.fontSizeHeading3)).toBeGreaterThan(Number(token.fontSizeHeading4));
    expect(Number(token.fontSizeHeading4)).toBeGreaterThan(Number(token.fontSizeHeading5));
  });
});
