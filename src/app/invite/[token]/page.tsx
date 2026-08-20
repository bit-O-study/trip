import { acceptVoteInviteAction } from "@/features/voting/actions";

type Props = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">음식점 투표 초대</h1>
      <p className="text-sm text-muted-foreground">
        초대를 수락하면 음식점 후보를 보고 투표할 수 있습니다.
      </p>
      <form action={acceptVoteInviteAction}>
        <input type="hidden" name="token" value={token} />
        <button className="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground">
          초대 수락하고 투표하기
        </button>
      </form>
    </main>
  );
}
