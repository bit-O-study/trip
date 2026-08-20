export type InviteActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  invitePath?: string;
};

export const INVITE_IDLE: InviteActionState = { status: "idle" };
