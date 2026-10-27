import { theme, type ThemeConfig } from "antd";

export const BRAND_NAME = "CMS";

export type ThemeMode = "light" | "dark";

const PRIMARY = "#0f766e";

const PALETTE = {
  light: {
    primary: PRIMARY,
    primaryText: PRIMARY,
    onPrimary: "#ffffff",
    layoutBg: "#eceef1",
    panelBg: "#f7f8fa",
    surface: "#ffffff",
    link: PRIMARY,
    primaryBg: "#f0fdfa",
    primaryBgHover: "#ccfbf1",
    border: "#e3e6ea",
    textTertiary: "rgba(0, 0, 0, 0.55)",
    menuText: "#4b5563",
    menuHoverBg: "rgba(255, 255, 255, 0.6)",
    menuActiveBg: "rgba(255, 255, 255, 0.8)",
    menuSelectedBg: "#ffffff",
    menuSelectedText: PRIMARY,
    groupTitle: "#646b76",
    tableHeaderBg: "#eaedf0",
    tableHeaderText: "#4b5563",
    tableSortBg: "#e3e6ea",
    tableRowHoverBg: "#f7f8fa",
    brandDot: "#5eead4"
  },
  dark: {
    primary: "#14b8a6",
    primaryText: "#5eead4",
    onPrimary: "#042f2e",
    layoutBg: "#0c0e10",
    panelBg: "#111417",
    surface: "#171a1d",
    link: "#2dd4bf",
    primaryBg: "#0f2a27",
    primaryBgHover: "#134e48",
    border: "#262b30",
    textTertiary: "rgba(255, 255, 255, 0.55)",
    menuText: "#a1a8b2",
    menuHoverBg: "rgba(255, 255, 255, 0.04)",
    menuActiveBg: "rgba(255, 255, 255, 0.06)",
    menuSelectedBg: "#1d2125",
    menuSelectedText: "#5eead4",
    groupTitle: "#8a929c",
    tableHeaderBg: "#1f2428",
    tableHeaderText: "#c4c9d0",
    tableSortBg: "#262b30",
    tableRowHoverBg: "#1b1f23",
    brandDot: "#f0fdfa"
  }
} as const;

// Chấm trạng thái của logo (Brand + public/favicon.svg) — không có token antd tương ứng
export const getBrandDot = (mode: ThemeMode) => PALETTE[mode].brandDot;

export function getAppTheme(mode: ThemeMode): ThemeConfig {
  const c = PALETTE[mode];
  return {
    algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: c.primary,
      colorPrimaryText: c.primaryText,
      colorLink: c.link,
      colorInfo: c.primary,
      colorPrimaryBg: c.primaryBg,
      colorPrimaryBgHover: c.primaryBgHover,
      colorInfoBg: c.primaryBg,
      borderRadius: 8,
      borderRadiusLG: 12,
      colorBgLayout: c.layoutBg,
      colorBgContainer: c.surface,
      colorBorderSecondary: c.border,
      colorTextTertiary: c.textTertiary,
      fontSizeHeading2: 22,
      fontSizeHeading3: 18,
      fontSizeHeading4: 16,
      fontSizeHeading5: 14,
      lineHeightHeading2: 1.36
    },
    components: {
      Layout: {
        bodyBg: c.panelBg,
        siderBg: "transparent",
        headerBg: c.surface,
        headerHeight: 64,
        headerPadding: "0 24px"
      },
      Menu: {
        itemBg: "transparent",
        subMenuItemBg: "transparent",
        itemColor: c.menuText,
        itemHoverBg: c.menuHoverBg,
        itemSelectedBg: c.menuSelectedBg,
        itemSelectedColor: c.menuSelectedText,
        itemActiveBg: c.menuActiveBg,
        itemHeight: 36,
        itemBorderRadius: 8,
        itemMarginInline: 12,
        itemMarginBlock: 2,
        groupTitleColor: c.groupTitle,
        groupTitleFontSize: 11,
        activeBarBorderWidth: 0,
        collapsedWidth: 68,
        iconSize: 16,
        collapsedIconSize: 16,
        popupBg: c.surface
      },
      Button: {
        primaryColor: c.onPrimary
      },
      Card: {
        headerFontSize: 16
      },
      Table: {
        headerBg: c.tableHeaderBg,
        headerColor: c.tableHeaderText,
        headerSplitColor: "transparent",
        headerSortActiveBg: c.tableSortBg,
        headerSortHoverBg: c.tableSortBg,
        rowHoverBg: c.tableRowHoverBg
      }
    }
  };
}
