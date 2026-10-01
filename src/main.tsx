import React from "react";
import ReactDOM from "react-dom/client";
import { StyleProvider } from "@ant-design/cssinjs";
import App from "./App";
import { ADMIN_API_URL } from "./constants/env";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

if (!ADMIN_API_URL) {
  root.render(
    <p className='p-6 text-red-600'>
      Thiếu cấu hình VITE_ADMIN_API_URL — không thể kết nối máy chủ quản trị.
    </p>
  );
} else {
  root.render(
    <React.StrictMode>
      <StyleProvider layer>
        <App />
      </StyleProvider>
    </React.StrictMode>
  );
}
