import { InviteAcceptForm } from "@/features/voting/invite-accept-form";

type Props = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
      <h1 className="text-3xl font-bold tracking-tight">여행 초대</h1>
      <p className="text-sm text-muted-foreground">
        초대를 수락하면 이 여행에 참여해 일정을 보고, 음식점 후보에 투표할 수 있습니다.
        초대한 사람이 정한 권한(편집 또는 보기)으로 참여하게 됩니다.
      </p>
      <InviteAcceptForm token={token} />
    </main>
  );
}
