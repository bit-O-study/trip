import type { RestaurantCandidate } from "@/features/trips/types";
import {
  confirmRestaurantCandidateAction,
  toggleRestaurantVoteAction,
} from "@/features/voting/actions";

export function RestaurantPoll({
  tripId,
  candidates,
  editable,
}: {
  tripId: string;
  candidates: RestaurantCandidate[];
  editable: boolean;
}) {
  const topVotes = Math.max(0, ...candidates.map((candidate) => candidate.voteCount));
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="text-base font-semibold">음식점 투표</h2>
        <p className="text-sm text-muted-foreground">친구들과 후보를 비교하고 원하는 곳에 투표하세요.</p>
      </div>
      {candidates.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
          장소 검색에서 음식점을 골라 ‘투표 후보로 등록’하세요.
        </p>
      ) : (
        <ul className="space-y-2">
          {candidates.map((candidate) => {
            const leader = topVotes > 0 && candidate.voteCount === topVotes;
            return (
              <li key={candidate.id} className="rounded-lg border border-border px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {candidate.title} {leader ? <span className="text-primary">· 공동 1위</span> : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {candidate.cuisineType}
                      {candidate.googleRating !== null ? ` · ★ ${candidate.googleRating.toFixed(1)}` : ""}
                      {` · ${candidate.voteCount}표`}
                    </p>
                    {candidate.closedOnDate === true ? (
                      <p className="text-xs font-medium text-danger">쉬는 날입니다</p>
                    ) : candidate.closedOnDate === null ? (
                      <p className="text-xs text-muted-foreground">영업시간 미확인</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form action={toggleRestaurantVoteAction}>
                      <input type="hidden" name="tripId" value={tripId} />
                      <input type="hidden" name="itemId" value={candidate.id} />
                      <input type="hidden" name="remove" value={String(candidate.votedByMe)} />
                      <button className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
                        {candidate.votedByMe ? "투표 취소" : "투표"}
                      </button>
                    </form>
                    {editable ? (
                      <form action={confirmRestaurantCandidateAction}>
                        <input type="hidden" name="tripId" value={tripId} />
                        <input type="hidden" name="itemId" value={candidate.id} />
                        <button className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                          일정 확정
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
