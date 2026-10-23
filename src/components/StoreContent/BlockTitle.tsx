import type { ReactNode } from "react";
import { Flex, Tag, Typography } from "antd";

interface BlockTitleProps {
  /** Vị trí khối trên trang cửa hàng, đếm từ trên xuống */
  position?: number;
  hint?: string;
  children: ReactNode;
}

export default function BlockTitle({ position, hint, children }: BlockTitleProps) {
  return (
    <Flex align='center' gap={8}>
      {position !== undefined && (
        <Tag color='processing' className='m-0 tabular-nums' aria-label={`Vị trí ${position}`}>
          {position}
        </Tag>
      )}
      <span>{children}</span>
      {hint && (
        <Typography.Text type='secondary' className='text-sm font-normal'>
          {hint}
        </Typography.Text>
      )}
    </Flex>
  );
}
