import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

export function useAuth() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? localStorage.getItem("quiz_token") : null;

  const { data: user, isLoading, error } = useGetMe({
    query: {
      enabled: !!token,
      queryKey: getGetMeQueryKey(),
      retry: false,
    },
  });

  const logout = () => {
    localStorage.removeItem("quiz_token");
    queryClient.setQueryData(getGetMeQueryKey(), null);
    setLocation("/auth");
  };

  return {
    user,
    isLoading: isLoading && !!token,
    isAuthenticated: !!user,
    logout,
  };
}