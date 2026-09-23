import { useState } from "react";
import { SunFilled, MoonFilled } from "@ant-design/icons";
import { Flex } from "antd";

const ThemeToggle = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  return (
    <Flex className='mr-3'>
      <button onClick={toggleTheme} className='text-2xl focus:outline-none'>
        {isDarkMode ? <MoonFilled /> : <SunFilled />}
      </button>
    </Flex>
  );
};

export default ThemeToggle;
