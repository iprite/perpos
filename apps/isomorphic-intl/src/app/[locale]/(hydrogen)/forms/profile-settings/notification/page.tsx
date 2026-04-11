import NotificationSettingsView from "@/app/shared/account-settings/notification-settings";
import { metaObject } from "@/config/site.config";

export const metadata = {
  ...metaObject("Notification"),
};

export default function IntegrationSettingsFormPage() {
  return <NotificationSettingsView />;
}
