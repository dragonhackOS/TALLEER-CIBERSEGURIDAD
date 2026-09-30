"use client";

import * as React from "react";

export interface AdminInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  totpEnabled: boolean;
}

const Ctx = React.createContext<AdminInfo | null>(null);

export function AdminProvider({ admin, children }: { admin: AdminInfo; children: React.ReactNode }) {
  return <Ctx.Provider value={admin}>{children}</Ctx.Provider>;
}

export function useAdmin(): AdminInfo {
  const a = React.useContext(Ctx);
  if (!a) throw new Error("useAdmin fuera de AdminProvider");
  return a;
}

/** Solo afecta la UI; el backend verifica SIEMPRE los permisos. */
export function useCan(permission: string): boolean {
  return useAdmin().permissions.includes(permission);
}
