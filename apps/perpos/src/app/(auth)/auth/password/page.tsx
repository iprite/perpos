import { Suspense } from "react";
import AuthPasswordClient from "./auth-password-client";

export default function AuthPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Suspense>
        <AuthPasswordClient />
      </Suspense>
    </div>
  );
}
