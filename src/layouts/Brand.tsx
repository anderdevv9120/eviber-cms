import { theme } from "antd";
import { BRAND_NAME, getBrandDot } from "@/constants/theme";
import { useThemeStore } from "@/store/useThemeStore";

interface BrandProps {
  compact?: boolean;
}

// Cùng hình với public/favicon.svg; màu theo token để đổi theo chế độ sáng/tối
const BrandMark = () => {
  const { token } = theme.useToken();
  const mode = useThemeStore(state => state.mode);
  return (
    <svg viewBox='0 0 32 32' className='size-8 shrink-0' aria-hidden>
      <rect width='32' height='32' rx='8' fill={token.colorPrimary} />
      <path
        d='M20 10.6A7.2 7.2 0 1 0 20 21.4'
        fill='none'
        stroke={token.colorBgContainer}
        strokeWidth='3.4'
        strokeLinecap='round'
      />
      <circle cx='22.6' cy='16' r='2.4' fill={getBrandDot(mode)} />
    </svg>
  );
};

const Brand = ({ compact = false }: BrandProps) => {
  const { token } = theme.useToken();
  return (
    <span
      className='flex items-center gap-2.5 whitespace-nowrap text-base font-semibold'
      style={{ color: token.colorPrimaryText }}
    >
      <BrandMark />
      <span
        aria-hidden={compact}
        className={`transition-opacity duration-200 ${compact ? "opacity-0" : "opacity-100"}`}
      >
        {BRAND_NAME}
      </span>
    </span>
  );
};

export default Brand;
