import { notification } from "antd";
import type { NotificationPlacement } from "antd/es/notification/interface";

interface NotificationOptions {
  placement?: NotificationPlacement;
  duration?: number;
}

const defaultOptions: NotificationOptions = {
  placement: "topRight",
  duration: 2.5,
};

export const successNotification = (message: string, options?: NotificationOptions): void => {
  notification.success({
    message,
    ...defaultOptions,
    ...options,
  });
};

export const errorNotification = (message: string, options?: NotificationOptions): void => {
  notification.error({
    message,
    ...defaultOptions,
    ...options,
  });
};

export const infoNotification = (message: string, options?: NotificationOptions): void => {
  notification.info({
    message,
    ...defaultOptions,
    ...options,
  });
};

export const warningNotification = (message: string, options?: NotificationOptions): void => {
  notification.warning({
    message,
    ...defaultOptions,
    ...options,
  });
};
