import { SunOutlined, MoonOutlined } from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import { useThemeStore } from "@/store/useThemeStore";

const ThemeToggle = () => {
  const mode = useThemeStore(state => state.mode);
  const toggleMode = useThemeStore(state => state.toggleMode);
  const label = mode === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối";

  return (
    <Tooltip title={label}>
      <Button
        type='text'
        shape='circle'
        size='large'
        aria-label={label}
        icon={mode === "dark" ? <SunOutlined /> : <MoonOutlined />}
        onClick={toggleMode}
        className='text-(--ant-color-text-secondary)'
      />
    </Tooltip>
  );
};

export default ThemeToggle;
