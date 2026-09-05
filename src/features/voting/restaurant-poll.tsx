import type { RestaurantPollView } from "@/features/trips/types";
import { deleteRestaurantPollAction, toggleRestaurantVoteAction } from "@/features/voting/actions";
import { PollActionButton } from "@/features/voting/poll-action-button";
import { PollCreateForm } from "@/features/voting/poll-create-form";

type Props = { tripId: string; polls: RestaurantPollView[]; editable: boolean; defaultDate: string; timezone: string; detail?: boolean };

export function RestaurantPoll({ tripId, polls, editable, defaultDate, timezone, detail = false }: Props) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      {!detail ? <h2 className="text-base font-semibold">일정 투표</h2> : null}
      {editable && !detail ? (
        <details className="rounded-lg border border-border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">새 투표 만들기</summary>
          <PollCreateForm tripId={tripId} defaultDate={defaultDate} timezone={timezone} />
        </details>
      ) : null}
      {polls.length === 0 ? <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">아직 만든 투표가 없습니다.</p> : (
        <div className="space-y-3">{polls.map((poll) => {
          const topVotes = Math.max(0, ...poll.candidates.map((candidate) => candidate.voteCount));
          return <article key={poll.id} className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-3"><div>
              {detail ? <h1 className="text-xl font-semibold">{poll.title}</h1> : <h3 className="font-semibold"><a href={`/trips/${tripId}/polls/${poll.id}`} className="hover:underline">{poll.title}</a></h3>}
              <p className="text-xs text-muted-foreground">일정 {new Date(poll.scheduledAt).toLocaleString("ko-KR", { timeZone: timezone })} · 종료 {new Date(poll.closesAt).toLocaleString("ko-KR", { timeZone: timezone })}</p>
              <p className="text-xs font-medium text-primary">{poll.status === "open" ? "투표 진행 중" : poll.winnerItemId ? "투표 종료 · 일정 확정" : "투표 종료 · 후보 없음"}</p>
            </div>{poll.createdByMe ? <form action={deleteRestaurantPollAction}><input type="hidden" name="tripId" value={tripId} /><input type="hidden" name="pollId" value={poll.id} />{detail ? <input type="hidden" name="returnTo" value={`/trips/${tripId}`} /> : null}<PollActionButton idleLabel="삭제" pendingLabel="삭제 중…" ariaLabel={`${poll.title} 삭제`} className="shrink-0 rounded-lg border border-danger px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger hover:text-primary-foreground" /></form> : null}</div>
            {!detail ? <a href={`/trips/${tripId}/polls/${poll.id}`} className="inline-block text-sm font-medium text-primary hover:underline">투표 상세</a> : null}
            {detail ? poll.candidates.length === 0 ? <p className="text-sm text-muted-foreground">등록된 후보가 없습니다.</p> : <ol className="space-y-2">{poll.candidates.map((candidate, index) => {
              const winner = poll.winnerItemId === candidate.id;
              const leader = poll.status === "open" && topVotes > 0 && candidate.voteCount === topVotes;
              return <li key={candidate.id} className="flex items-start justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"><div className="min-w-0"><p className="font-medium">{index + 1}. {candidate.title} {winner ? <span className="text-primary">· 확정</span> : leader ? <span className="text-primary">· 현재 1위</span> : null}</p><p className="text-sm text-muted-foreground">{candidate.cuisineType}{candidate.googleRating !== null ? ` · ★ ${candidate.googleRating.toFixed(1)}` : ""} · {candidate.voteCount}표</p>{candidate.closedOnDate === true ? <p className="text-xs font-medium text-danger">쉬는 날입니다</p> : null}</div>{poll.status === "open" ? <form action={toggleRestaurantVoteAction}><input type="hidden" name="tripId" value={tripId} /><input type="hidden" name="pollId" value={poll.id} /><input type="hidden" name="itemId" value={candidate.id} /><input type="hidden" name="remove" value={String(candidate.votedByMe)} /><PollActionButton idleLabel={candidate.votedByMe ? "투표 취소" : "투표"} pendingLabel="반영 중…" className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground" /></form> : null}</li>;
            })}</ol> : null}
          </article>;
        })}</div>
      )}
    </section>
  );
}
