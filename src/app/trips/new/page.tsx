import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "새 여행",
};

export default function NewTripPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">새 여행</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          여행 이름, 도시, 기간을 정하면 날짜별 타임라인이 만들어집니다.
        </p>
      </div>

      {/*
        실제 폼은 구현 순서 4단계(여행 CRUD)에서 작성한다.
        인증(3단계)이 먼저 들어가야 owner_id를 채울 수 있다.
      */}
      <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          여행 생성 폼은 인증과 데이터베이스 연결 후 추가됩니다.
        </p>
      </div>
    </div>
  );
}
