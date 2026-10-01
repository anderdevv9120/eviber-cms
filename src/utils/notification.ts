import { notification } from "antd";
import type { NotificationPlacement } from "antd/es/notification/interface";

interface NotificationOptions {
  placement?: NotificationPlacement;
  duration?: number;
}

const defaultOptions: NotificationOptions = {
  placement: "topRight",
  duration: 2.5
};

export const successNotification = (message: string, options?: NotificationOptions): void => {
  notification.success({
    title: message,
    ...defaultOptions,
    ...options
  });
};

export const errorNotification = (message: string, options?: NotificationOptions): void => {
  notification.error({
    title: message,
    ...defaultOptions,
    ...options
  });
};

export const infoNotification = (message: string, options?: NotificationOptions): void => {
  notification.info({
    title: message,
    ...defaultOptions,
    ...options
  });
};

export const warningNotification = (message: string, options?: NotificationOptions): void => {
  notification.warning({
    title: message,
    ...defaultOptions,
    ...options
  });
};
