import { cn } from "@/utils/cn";
import { SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  name: string;
  className?: string;
}

const SvgIcon = ({ name, className, ...props }: IconProps) => (
  <svg className={cn("cursor-pointer", className)} {...props}>
    <use xlinkHref={`/sprites.svg#icon-${name}`} />
  </svg>
);

export default SvgIcon;
