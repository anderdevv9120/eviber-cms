import { Flex, Tabs, Typography } from "antd";
import { useSearchParams } from "react-router";
import { getNotificationScope } from "@/services/notifications";
import { useAppStore } from "@/store/useAppStore";
import { canAccess } from "@/utils/access";
import PersonalSettings from "./PersonalSettings";
import StoreSettings from "./StoreSettings";

export default function NotificationSettings() {
  const profile = useAppStore(state => state.profile);
  const sessionRevision = useAppStore(state => state.sessionRevision);
  const [params, setParams] = useSearchParams();
  const scope = getNotificationScope()?.key;
  if (!profile || !scope || !canAccess(profile, { authenticated: true })) return null;
  const access = JSON.stringify(profile.access);
  const canRead = canAccess(profile, { anyOf: ["NOTIFICATION_SETTINGS_READ"] });
  const active =
    canRead && params.getAll("tab").length === 1 && params.get("tab") === "store"
      ? "store"
      : "personal";
  return (
    <Flex vertical gap={16}>
      <Typography.Title level={2} style={{ margin: 0 }}>
        Cài đặt thông báo
      </Typography.Title>
      <Tabs
        activeKey={active}
        destroyOnHidden
        onChange={tab => setParams(tab === "store" ? { tab } : {})}
        items={[
          {
            key: "personal",
            label: "Cá nhân",
            children: active === "personal" && (
              <PersonalSettings
                key={`${scope}:${sessionRevision}:${access}:personal`}
                scope={scope}
                access={access}
              />
            )
          },
          ...(canRead
            ? [
                {
                  key: "store",
                  label: "Cửa hàng",
                  children: active === "store" && (
                    <StoreSettings
                      key={`${scope}:${sessionRevision}:${access}:store`}
                      scope={scope}
                      access={access}
                      canUpdate={canAccess(profile, { anyOf: ["NOTIFICATION_SETTINGS_UPDATE"] })}
                    />
                  )
                }
              ]
            : [])
        ]}
      />
      <Typography.Paragraph>
        Email: <Typography.Text type='secondary'>Sắp ra mắt</Typography.Text>
      </Typography.Paragraph>
    </Flex>
  );
}
