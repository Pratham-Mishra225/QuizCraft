import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

const LOGOUT_URL = "/api/auth/logout";

export function useAuth() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Run unconditionally — the browser automatically sends the HttpOnly auth_token
  // cookie with every request (credentials: "include"). If the cookie is absent or
  // the JWT is invalid, the server returns 401 and isAuthenticated will be false.
  const { data: user, isLoading } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      // Treat 401 as an expected unauthenticated state, not an error to retry.
      retryOnMount: false,
    },
  });

  const logout = async () => {
    // Ask the server to clear the HttpOnly cookie. We cannot clear it from JS
    // because document.cookie cannot access HttpOnly cookies.
    try {
      await fetch(LOGOUT_URL, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Best-effort: even if the network call fails, clear the local React Query
      // cache so the UI transitions to the logged-out state.
    }

    // Clear React Query cache so all protected data is removed from memory.
    queryClient.setQueryData(getGetMeQueryKey(), null);
    queryClient.clear();
    setLocation("/auth");
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout,
  };
}