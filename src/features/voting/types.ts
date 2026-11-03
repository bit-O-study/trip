export type InviteActionState = {
  status: "idle" | "error" | "success" | "revoked";
  message?: string;
  invitePath?: string;
  /** 방금 만든 초대의 id. 그 링크 하나만 폐기할 때 쓴다. */
  inviteId?: string;
  /** 폐기 결과: 이번에 폐기된 초대 id 목록. */
  revokedIds?: string[];
};

export const INVITE_IDLE: InviteActionState = { status: "idle" };
