/**
 * 귀여운 로딩 화면 — 앱의 철도 여정 콘셉트에 맞춰 작은 기차가 칙칙폭폭 달린다.
 *
 * 색은 노선 색 토큰(--day-*)과 레일 토큰을 그대로 써서 라이트·다크 테마를 따른다.
 * 움직임은 CSS 로만 낸다(globals.css 의 .loader-*). `prefers-reduced-motion` 이면 멈춘 그림으로 보인다.
 * 스크린 리더에는 `role="status"` 와 문구만 읽힌다(그림은 aria-hidden).
 */
export function LoadingTrain({ label = "여행 가방 싸는 중", className = "" }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={`flex flex-col items-center justify-center gap-3 py-12 ${className}`}>
      <svg viewBox="0 0 220 120" width="220" height="120" aria-hidden="true" className="loader-scene overflow-visible">
        {/* 레일: 침목이 뒤로 흘러간다 */}
        <line x1="0" y1="102" x2="220" y2="102" className="loader-rail" strokeWidth="3" strokeLinecap="round" />
        <line x1="0" y1="108" x2="220" y2="108" className="loader-sleepers" strokeWidth="6" strokeDasharray="3 13" />

        <g className="loader-bob">
          {/* 뒤 칸: 짐 가방 */}
          <g>
            <rect x="8" y="58" width="42" height="34" rx="11" className="loader-car" />
            <rect x="21" y="66" width="16" height="12" rx="3" className="loader-bag" />
            <path d="M26 66v-3a3 3 0 0 1 6 0v3" fill="none" className="loader-bag-handle" strokeWidth="2" strokeLinecap="round" />
            <line x1="50" y1="80" x2="58" y2="80" className="loader-link" strokeWidth="3" strokeLinecap="round" />
            <circle cx="22" cy="94" r="7" className="loader-wheel" />
            <circle cx="22" cy="94" r="2.5" className="loader-hub" />
            <circle cx="38" cy="94" r="7" className="loader-wheel" />
            <circle cx="38" cy="94" r="2.5" className="loader-hub" />
          </g>

          {/* 앞 칸: 얼굴 있는 기관차 */}
          <g>
            <rect x="58" y="50" width="96" height="42" rx="15" className="loader-body" />
            <rect x="104" y="30" width="44" height="30" rx="10" className="loader-cabin" />
            <rect x="112" y="37" width="28" height="16" rx="6" className="loader-window" />
            <rect x="70" y="34" width="15" height="18" rx="4" className="loader-chimney" />
            <rect x="67" y="31" width="21" height="6" rx="3" className="loader-chimney" />
            {/* 얼굴 */}
            <g className="loader-face">
              <ellipse cx="84" cy="68" rx="4.6" ry="5.4" className="loader-eye" />
              <ellipse cx="108" cy="68" rx="4.6" ry="5.4" className="loader-eye" />
              <circle cx="85.2" cy="66.6" r="1.7" className="loader-glint" />
              <circle cx="109.2" cy="66.6" r="1.7" className="loader-glint" />
              <ellipse cx="73" cy="76" rx="5" ry="3" className="loader-blush" />
              <ellipse cx="119" cy="76" rx="5" ry="3" className="loader-blush" />
              <path d="M91 76q5 5 10 0" fill="none" className="loader-smile" strokeWidth="2.4" strokeLinecap="round" />
            </g>
            <circle cx="150" cy="78" r="4" className="loader-lamp" />
            <circle cx="80" cy="94" r="9" className="loader-wheel" />
            <circle cx="80" cy="94" r="3" className="loader-hub" />
            <g className="loader-spin"><line x1="80" y1="87" x2="80" y2="101" className="loader-spoke" strokeWidth="2" strokeLinecap="round" /></g>
            <circle cx="126" cy="94" r="9" className="loader-wheel" />
            <circle cx="126" cy="94" r="3" className="loader-hub" />
            <g className="loader-spin loader-spin-b"><line x1="126" y1="87" x2="126" y2="101" className="loader-spoke" strokeWidth="2" strokeLinecap="round" /></g>
          </g>
        </g>

        {/* 연기 */}
        <circle cx="78" cy="24" r="5" className="loader-puff loader-puff-1" />
        <circle cx="78" cy="24" r="4" className="loader-puff loader-puff-2" />
        <circle cx="78" cy="24" r="3" className="loader-puff loader-puff-3" />
      </svg>
      <p className="text-sm font-medium text-muted-foreground">
        {label}
        <span className="loader-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>
      </p>
    </div>
  );
}
