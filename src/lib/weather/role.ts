import { getCookie, setCookie } from "@tanstack/react-start/server";
import type { Role } from "./types";
import { ROLES } from "./types";

export function readRole(): Role {
  const raw = getCookie("hub_role");
  if (raw && (ROLES as readonly string[]).includes(raw)) return raw as Role;
  return "ADMIN";
}

export function writeRole(role: Role) {
  setCookie("hub_role", role, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
}

export function assertRole(role: Role, allowed: Role[]) {
  if (!allowed.includes(role)) {
    throw new Error("이 작업을 수행할 권한이 없습니다.");
  }
}
