"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useModal } from "@/app/shared/modal-views/use-modal";
import { Modal } from "@core/modal-views/modal";

export default function GlobalModal() {
  const { isOpen, view, closeModal, customSize, size } = useModal();
  const pathname = usePathname();
  useEffect(() => {
    closeModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <Modal
      size={size}
      isOpen={isOpen}
      onClose={closeModal}
      customSize={customSize}
      containerClassName="bg-transparent shadow-none"
      overlayClassName="bg-black/55 backdrop-blur-md"
      className="z-[9999] [&_.pointer-events-none]:overflow-visible"
    >
      {view}
    </Modal>
  );
}
