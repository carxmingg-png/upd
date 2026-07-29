import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { setUnauthorizedHandler } from "@/lib/api-client";

type Role = "admin" | "user" | null;

const LS_TOKEN = "carx_token";
const LS_ROLE = "carx_role";

interface AuthState {
  role: Role;
  token: string | null;
  restoring: boolean;
  setAuth: (role: Role, token: string) => void;
  clearAuth: () => void;
}

const AuthContext = createContext<AuthState>({
  role: null,
  token: null,
  restoring: true,
  setAuth: () => {},
  clearAuth: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>(null);
  const [token, setToken] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAuth = useCallback(() => {
    setRole(null);
    setToken(null);
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_ROLE);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Register global 401 interceptor — fires on any API call returning 401
  useEffect(() => {
    setUnauthorizedHandler(() => {
      // Only clear if we have an active user session (not admin)
      const storedRole = localStorage.getItem(LS_ROLE);
      if (storedRole === "user") {
        clearAuth();
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [clearAuth]);

  // Validate stored session on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(LS_TOKEN);
    const storedRole = localStorage.getItem(LS_ROLE) as Role;
    if (storedToken && storedRole) {
      fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: storedToken }),
      })
        .then((r) => r.json())
        .then((d: { role?: string; token?: string }) => {
          if (d.role && d.token) {
            setRole(d.role as Role);
            setToken(d.token);
          } else {
            localStorage.removeItem(LS_TOKEN);
            localStorage.removeItem(LS_ROLE);
          }
        })
        .catch(() => {
          localStorage.removeItem(LS_TOKEN);
          localStorage.removeItem(LS_ROLE);
        })
        .finally(() => setRestoring(false));
    } else {
      setRestoring(false);
    }
  }, []);

  // Periodic session check every 60 seconds for user sessions
  useEffect(() => {
    if (role !== "user" || !token) return;

    const check = () => {
      fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
        .then((r) => {
          if (!r.ok) clearAuth();
          return r.json();
        })
        .then((d: { role?: string }) => {
          if (!d.role) clearAuth();
        })
        .catch(() => {
          // Network error — don't logout, could be temporary
        });
    };

    pollRef.current = setInterval(check, 60_000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [role, token, clearAuth]);

  const setAuth = (r: Role, t: string) => {
    setRole(r);
    setToken(t);
    localStorage.setItem(LS_TOKEN, t);
    localStorage.setItem(LS_ROLE, r ?? "");
  };

  return (
    <AuthContext.Provider value={{ role, token, restoring, setAuth, clearAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
