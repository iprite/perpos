import { Suspense } from "react";
import AuthPasswordClient from "./auth-password-client";

export default function AuthPasswordPage() {
  return (
    <div className="w-full">
      <Suspense fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
        </div>
      }>
        <AuthPasswordClient />
      </Suspense>
    </div>
  );
}
