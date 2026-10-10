import { Alert, Flex, Typography } from "antd";
import { CheckCircleFilled, CloseCircleFilled } from "@ant-design/icons";
import type { PublishRequirement } from "@/services/products";
import { publishRequirementLabels } from "./product-list-query";
import { PUBLISH_REQUIREMENTS } from "./product-publish";

interface Props {
  missing: PublishRequirement[];
  serverMissing: PublishRequirement[];
}

export default function PublishChecklist({ missing, serverMissing }: Props) {
  return (
    <Flex vertical gap={4}>
      <Typography.Text strong>Điều kiện đăng bán</Typography.Text>
      {PUBLISH_REQUIREMENTS.map(code => {
        const done = !missing.includes(code);
        return (
          <Flex key={code} gap={8} align='center'>
            {done ? (
              <CheckCircleFilled style={{ color: "#52c41a" }} aria-hidden />
            ) : (
              <CloseCircleFilled style={{ color: "#ff4d4f" }} aria-hidden />
            )}
            <span>{`${done ? "Đã có" : "Thiếu"} ${publishRequirementLabels[code]}`}</span>
          </Flex>
        );
      })}
      {serverMissing.length > 0 && (
        <Alert
          type='error'
          showIcon
          title={`Chưa đăng bán được: thiếu ${serverMissing
            .map(code => publishRequirementLabels[code])
            .join(", ")}`}
        />
      )}
    </Flex>
  );
}
