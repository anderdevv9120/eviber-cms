import { useEffect, useMemo } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { ConfigProvider } from "antd";
import viVN from "antd/locale/vi_VN";
import { routes } from "./router";
import { getAppTheme } from "./constants/theme";
import { useThemeStore } from "./store/useThemeStore";

const router = createBrowserRouter(routes);

const App = () => {
  const mode = useThemeStore(state => state.mode);
  const appTheme = useMemo(() => getAppTheme(mode), [mode]);

  // Thanh cuộn, ô input autofill... của trình duyệt theo đúng chế độ sáng/tối; notification tĩnh
  // (utils/notification) render ngoài cây React nên chỉ đọc theme global, không đọc ConfigProvider dưới
  useEffect(() => {
    document.documentElement.style.colorScheme = mode;
    ConfigProvider.config({ theme: appTheme });
  }, [mode, appTheme]);

  return (
    <ConfigProvider theme={appTheme} locale={viVN}>
      <RouterProvider router={router} />
    </ConfigProvider>
  );
};

export default App;
