"use client";

import { Toaster } from "react-hot-toast";

export default function AppToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 2500,
        style: { background: "#1A1A1B", color: "#fff" },
      }}
    />
  );
}

