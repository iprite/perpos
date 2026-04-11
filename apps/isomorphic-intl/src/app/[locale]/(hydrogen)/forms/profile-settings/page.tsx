import PersonalInfoView from "@/app/shared/account-settings/personal-info";
import { metaObject } from "@/config/site.config";

export const metadata = {
  ...metaObject("Profile Settings"),
};

// const pageHeader = {
//   title: 'text-account-settings',
//   breadcrumb: [
//     {
//       href: routes.eCommerce.dashboard,
//       name: 'text-ecommerce',
//     },
//     {
//       href: routes.forms.profileSettings,
//       name: 'text-form',
//     },
//     {
//       name: 'text-account-settings',
//     },
//   ],
// };

export default function ProfileSettingsFormPage() {
  return <PersonalInfoView />;
}
