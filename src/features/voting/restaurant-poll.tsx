import type { RestaurantPollView } from "@/features/trips/types";
import { createRestaurantPollAction, toggleRestaurantVoteAction } from "@/features/voting/actions";

export function RestaurantPoll({ tripId, polls, editable, defaultDate, timezone }: {
  tripId: string; polls: RestaurantPollView[]; editable: boolean; defaultDate: string; timezone: string;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="text-base font-semibold">음식점 투표</h2>
        <p className="text-sm text-muted-foreground">종료되면 최다 득표 음식점이 설정한 시각의 일정으로 자동 확정됩니다.</p>
      </div>
      {editable ? (
        <details className="rounded-lg border border-border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">새 투표 만들기</summary>
          <form action={createRestaurantPollAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="tripId" value={tripId} />
            <label className="space-y-1 text-sm sm:col-span-2"><span className="font-medium">투표 제목</span><input name="title" required maxLength={120} placeholder="첫째 날 점심 투표" className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
            <label className="space-y-1 text-sm"><span className="font-medium">일정 시각</span><input type="datetime-local" name="scheduledLocal" required defaultValue={`${defaultDate}T12:00`} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
            <label className="space-y-1 text-sm"><span className="font-medium">투표 종료 시각</span><input type="datetime-local" name="closesLocal" required defaultValue={`${defaultDate}T10:00`} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
            <p className="text-xs text-muted-foreground sm:col-span-2">시간대: {timezone} · 동률이면 먼저 등록한 후보를 선택합니다.</p>
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground sm:col-span-2">투표 만들기</button>
          </form>
        </details>
      ) : null}
      {polls.length === 0 ? <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">아직 만든 투표가 없습니다.</p> : (
        <div className="space-y-4">{polls.map((poll) => {
          const topVotes = Math.max(0, ...poll.candidates.map((candidate) => candidate.voteCount));
          return <article key={poll.id} className="space-y-3 rounded-lg border border-border p-3">
            <div><h3 className="font-semibold">{poll.title}</h3><p className="text-xs text-muted-foreground">일정 {new Date(poll.scheduledAt).toLocaleString("ko-KR", { timeZone: timezone })} · 종료 {new Date(poll.closesAt).toLocaleString("ko-KR", { timeZone: timezone })}</p><p className="text-xs font-medium text-primary">{poll.status === "open" ? "투표 진행 중" : poll.winnerItemId ? "투표 종료 · 일정 자동 확정" : "투표 종료 · 후보 없음"}</p></div>
            {poll.candidates.length === 0 ? <p className="text-sm text-muted-foreground">장소 검색에서 이 투표를 선택해 후보를 등록하세요.</p> : <ol className="space-y-2">{poll.candidates.map((candidate, index) => {
              const winner = poll.winnerItemId === candidate.id;
              const leader = poll.status === "open" && topVotes > 0 && candidate.voteCount === topVotes;
              return <li key={candidate.id} className="flex items-start justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"><div className="min-w-0"><p className="font-medium">{index + 1}. {candidate.title} {winner ? <span className="text-primary">· 확정</span> : leader ? <span className="text-primary">· 현재 1위</span> : null}</p><p className="text-sm text-muted-foreground">{candidate.cuisineType}{candidate.googleRating !== null ? ` · ★ ${candidate.googleRating.toFixed(1)}` : ""} · {candidate.voteCount}표</p>{candidate.closedOnDate === true ? <p className="text-xs font-medium text-danger">쉬는 날입니다</p> : null}</div>
                {poll.status === "open" ? <form action={toggleRestaurantVoteAction}><input type="hidden" name="tripId" value={tripId} /><input type="hidden" name="pollId" value={poll.id} /><input type="hidden" name="itemId" value={candidate.id} /><input type="hidden" name="remove" value={String(candidate.votedByMe)} /><button className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">{candidate.votedByMe ? "투표 취소" : "투표"}</button></form> : null}</li>;
            })}</ol>}
          </article>;
        })}</div>
      )}
    </section>
  );
}
