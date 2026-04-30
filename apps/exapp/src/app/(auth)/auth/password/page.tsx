import React, { Suspense } from "react";

import AuthPasswordClient from "./auth-password-client";

export default function AuthPasswordPage() {
  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-lg rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">กำลังโหลด...</div>}>
      <AuthPasswordClient />
    </Suspense>
  );
}

