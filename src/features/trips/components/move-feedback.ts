import type { ToastInput } from "@/components/ui/toast";
import { undoMoveAction } from "@/features/trips/actions";
import type { MoveResult } from "@/features/trips/reorder";

type Context = {
  tripId: string;
  itemId: string;
  show: (toast: ToastInput) => void;
};

/**
 * 순서·날짜 이동 결과를 사용자에게 알린다.
 *
 * 이동하면 날짜가 바뀌며 시작 시각이 함께 조정될 수 있고, 놓은 자리가 틀렸을 수도 있다.
 * 서버는 되돌릴 계획(undo)을 돌려주므로 알림에 "되돌리기" 를 단다.
 * 카드 안의 문구는 카드가 다시 그려지면 사라지기 때문에 알림은 카드 밖(전역)에 띄운다.
 */
export function reportMove(result: MoveResult, { tripId, itemId, show }: Context): string {
  if (result.status === "error") {
    show({ message: result.message, tone: "error" });
    return result.message;
  }
  if (result.status === "unchanged") return "이미 같은 위치에 있습니다.";

  const message =
    result.fromStartAt === result.toStartAt
      ? "일정을 이동했습니다."
      : "일정을 이동했습니다. 날짜가 바뀌어 시작 시각도 함께 조정됐어요.";
  show({
    message,
    actionLabel: "되돌리기",
    onAction: async () => {
      const data = new FormData();
      data.set("tripId", tripId);
      data.set("itemId", itemId);
      data.set("startAt", result.undo.startAt);
      if (result.undo.afterItemId) data.set("afterItemId", result.undo.afterItemId);
      try {
        const undone = await undoMoveAction(data);
        show(
          undone.status === "error"
            ? { message: undone.message, tone: "error" }
            : { message: "원래 자리로 되돌렸습니다." },
        );
      } catch {
        show({ message: "되돌리지 못했습니다. 다시 시도하세요.", tone: "error" });
      }
    },
  });
  return message;
}
