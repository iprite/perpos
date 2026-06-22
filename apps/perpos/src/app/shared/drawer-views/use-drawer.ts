"use client";

import { atom, useAtom } from "jotai";

export type DrawerPlacements = "left" | "right" | "top" | "bottom";

type DrawerTypes = {
  view: React.ReactNode;
  isOpen: boolean;
  placement?: DrawerPlacements;
  containerClassName?: string;
  /** ความกว้าง panel (px) — ใช้ rizzui customSize เพื่อกำหนดความกว้างจริง (ไม่ใช่แค่ max-w cap) */
  customSize?: number;
};

const drawerAtom = atom<DrawerTypes>({
  isOpen: false,
  view: null,
  placement: "right",
  containerClassName: "",
  customSize: undefined,
});

export function useDrawer() {
  const [state, setState] = useAtom(drawerAtom);

  const openDrawer = ({
    view,
    placement,
    containerClassName,
    customSize,
  }: {
    view: React.ReactNode;
    placement: DrawerPlacements;
    containerClassName?: string;
    customSize?: number;
  }) => {
    setState({
      ...state,
      isOpen: true,
      view,
      placement,
      containerClassName,
      customSize,
    });
  };

  const closeDrawer = () => {
    setState({
      ...state,
      isOpen: false,
    });
  };

  return {
    ...state,
    openDrawer,
    closeDrawer,
  };
}
