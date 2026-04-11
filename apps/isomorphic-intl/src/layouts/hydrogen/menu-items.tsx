import { routes } from "@/config/routes";
import {
  PiBellSimpleRingingDuotone,
  PiChartLineUpDuotone,
  PiEnvelopeSimpleOpenDuotone,
  PiFoldersDuotone,
  PiSquaresFourDuotone,
  PiUserDuotone,
  PiUserGearDuotone,
} from "react-icons/pi";

// Note: do not add href in the label object, it is rendering as label
export const menuItems = [
  // label start
  {
    name: "sidebar-menu-overview",
  },
  // label end
  {
    name: "sidebar-menu-file-manager",
    href: "/",
    icon: <PiFoldersDuotone />,
  },

  // label start
  {
    name: "sidebar-menu-widgets",
  },
  // label end
  {
    name: "sidebar-menu-cards",
    href: routes.widgets.cards,
    icon: <PiSquaresFourDuotone />,
  },
  {
    name: "sidebar-menu-charts",
    href: routes.widgets.charts,
    icon: <PiChartLineUpDuotone />,
  },
  // label start
  {
    name: "sidebar-menu-forms",
  },
  // label end
  {
    name: "sidebar-menu-account-settings",
    href: routes.forms.profileSettings,
    icon: <PiUserGearDuotone />,
  },
  {
    name: "sidebar-menu-notification-preference",
    href: routes.forms.notificationPreference,
    icon: <PiBellSimpleRingingDuotone />,
  },
  {
    name: "sidebar-menu-personal-information",
    href: routes.forms.personalInformation,
    icon: <PiUserDuotone />,
  },
  {
    name: "sidebar-menu-newsletter",
    href: routes.forms.newsletter,
    icon: <PiEnvelopeSimpleOpenDuotone />,
  },
];
