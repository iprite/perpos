"use client";

import { Toaster } from "react-hot-toast";

export default function AppToaster() {
  return (
    <Toaster
      position="top-right"
      containerStyle={{ top: 76 }} // ต่ำกว่า sticky header
      toastOptions={{
        duration: 2500,
        style: { background: "#1A1A1B", color: "#fff" }, // ink (gray-900) — PERPOS palette
        success: { iconTheme: { primary: "#48CFAD", secondary: "#fff" } }, // MINT (positive) — วงเขียว เช็กขาว
        error: { iconTheme: { primary: "#D8334A", secondary: "#fff" } }, // RUBY (negative)
      }}
    />
  );
}

