import { Alert, Flex, Typography } from "antd";
import { CheckCircleFilled, CloseCircleFilled } from "@ant-design/icons";
import type { ComboPublishRequirement } from "@/services/combos";
import { publishRequirementLabels } from "./combo-list-query";
import { COMBO_PUBLISH_REQUIREMENTS } from "./combo-publish";

export default function ComboPublishChecklist({
  missing,
  serverMissing
}: {
  missing: ComboPublishRequirement[];
  serverMissing: ComboPublishRequirement[];
}) {
  return (
    <Flex vertical gap={4}>
      <Typography.Text strong>Điều kiện đăng bán</Typography.Text>
      {COMBO_PUBLISH_REQUIREMENTS.map(code => (
        <Flex key={code} gap={8} align='center'>
          {missing.includes(code) ? (
            <CloseCircleFilled style={{ color: "#ff4d4f" }} aria-hidden />
          ) : (
            <CheckCircleFilled style={{ color: "#52c41a" }} aria-hidden />
          )}
          <span>{`${missing.includes(code) ? "Thiếu" : "Đã có"} ${publishRequirementLabels[code]}`}</span>
        </Flex>
      ))}
      {serverMissing.length > 0 && (
        <Alert
          type='error'
          showIcon
          title={`Chưa đăng bán được: thiếu ${serverMissing.map(code => publishRequirementLabels[code]).join(", ")}`}
        />
      )}
    </Flex>
  );
}
