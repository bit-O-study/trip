import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "링크를 열 수 없습니다",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ reason?: string }> };

export default async function ShareInvalidPage({ searchParams }: Props) {
  const { reason } = await searchParams;

  return (
    <main className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">링크를 열 수 없습니다</h1>
      {reason === "unconfigured" ? (
        <p className="text-sm text-muted-foreground">
          공유 기능이 아직 설정되지 않았습니다. 잠시 후 다시 시도하거나 링크를 만든
          사람에게 알려 주세요.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          만료됐거나 폐기된 공유 링크입니다. 링크를 만든 사람에게 새 링크를 요청하세요.
        </p>
      )}
    </main>
  );
}
