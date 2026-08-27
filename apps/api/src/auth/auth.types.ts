export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: "USER" | "ADMIN";
};
