"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { airportTimezone, isValidTimezone } from "@/features/flights/airports";
import { normalizeFlightNumber, type FlightSearchResult } from "@/features/flights/provider";
import { fail, withSubmittedValues, type ActionState } from "@/features/trips/action-state";
import { dbErrorMessage } from "@/features/trips/db-error";
import { getTrip } from "@/features/trips/queries";

const ARRIVAL_BEFORE_DEPARTURE =
  "도착 시각이 출발 시각보다 이릅니다. 각 공항의 현지 날짜와 시각을 확인하세요.";
import { zonedLocalToUtc } from "@/lib/datetime";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
 * 항공편을 일정에 넣는다.
 *
 * `flights` 는 여러 여행이 공유하는 엔티티이고, `itinerary_items.flight_snapshot`
 * 이 선택 시점의 사본을 갖는다. 장소와 같은 원칙이다 — 공급자 데이터가 바뀌거나
 * 사라져도 저장된 일정은 그대로 유지된다 (architecture.md §4).
 */

const endpointSchema = z.object({
  airport: z.string().trim().length(3).toUpperCase(),
  terminal: z.string().trim().max(20).nullable(),
  gate: z.string().trim().max(20).nullable(),
  timezone: z.string().trim().refine(isValidTimezone, "알 수 없는 시간대입니다"),
  scheduledAt: z.iso.datetime({ offset: true }),
  estimatedAt: z.iso.datetime({ offset: true }).nullable(),
  actualAt: z.iso.datetime({ offset: true }).nullable(),
});

const flightSchema = z.object({
  provider: z.enum(["kac_gw", "aerodatabox", "manual"]),
  providerFlightId: z.string().trim().max(120).nullable(),
  marketingFlightNumber: z.string().trim().min(2).max(12),
  operatingFlightNumber: z.string().trim().max(12).nullable(),
  airlineCode: z.string().trim().max(4).nullable(),
  operatingAirlineCode: z.string().trim().max(4).nullable(),
  airlineName: z.string().trim().max(120).nullable(),
  departure: endpointSchema,
  arrival: endpointSchema,
  status: z.enum([
    "scheduled", "delayed", "boarding", "departed",
    "landed", "cancelled", "diverted", "unknown",
  ]),
});

function text(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw : "";
}

/**
 * 공유 `flights` 행을 확보한다.
 *
 * authenticated 는 `flights` 에 직접 쓸 수 없다(마이그레이션 20261023000002).
 * 아무 로그인 사용자나 행을 만들고 모든 사람의 항공편을 열람할 수 있었기
 * 때문이다. 대신 이 여행의 편집 권한을 확인하는 `trip.save_flight` RPC 로 저장한다.
 */
async function ensureFlightRow(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tripId: string,
  flight: z.infer<typeof flightSchema>,
  numberInput: string,
  numberKey: string,
): Promise<{ id: string } | { error: string }> {
  const row = {
    provider: flight.provider,
    provider_flight_id: flight.providerFlightId,
    marketing_flight_number: flight.marketingFlightNumber,
    operating_flight_number: flight.operatingFlightNumber,
    flight_number_input: numberInput,
    flight_number_key: numberKey,
    airline_code: flight.airlineCode,
    operating_airline_code: flight.operatingAirlineCode,
    departure_airport: flight.departure.airport,
    departure_terminal: flight.departure.terminal,
    departure_gate: flight.departure.gate,
    departure_timezone: flight.departure.timezone,
    arrival_airport: flight.arrival.airport,
    arrival_terminal: flight.arrival.terminal,
    arrival_gate: flight.arrival.gate,
    arrival_timezone: flight.arrival.timezone,
    scheduled_departure: flight.departure.scheduledAt,
    estimated_departure: flight.departure.estimatedAt,
    actual_departure: flight.departure.actualAt,
    scheduled_arrival: flight.arrival.scheduledAt,
    estimated_arrival: flight.arrival.estimatedAt,
    actual_arrival: flight.arrival.actualAt,
    status: flight.status,
  };

  const saved = await supabase.rpc("save_flight", { p_trip_id: tripId, p_flight: row });
  if (saved.error || typeof saved.data !== "string") {
    return { error: dbErrorMessage("항공편을 저장하지 못했습니다", saved.error) };
  }
  return { id: saved.data };
}

async function saveFlight(
  tripId: string,
  flight: z.infer<typeof flightSchema>,
  numberInput: string,
  note: string,
): Promise<ActionState> {
  if (note.length > 2000) return fail("메모는 2000자 이내로 입력하세요.");
  const normalized = normalizeFlightNumber(numberInput);
  if (!normalized) return fail("편명을 확인하세요. 예: KE703");

  /*
   * 도착이 출발보다 이르면 저장하지 않는다. 일정 행의 end_at >= start_at 제약에 걸려
   * 영어 제약 오류가 그대로 보이던 경로다. 날짜변경선을 넘는 노선도 UTC 로는
   * 도착이 항상 뒤이므로, 여기 걸리면 현지 날짜·시간대를 잘못 넣은 것이다.
   */
  if (Date.parse(flight.arrival.scheduledAt) < Date.parse(flight.departure.scheduledAt)) {
    return fail(ARRIVAL_BEFORE_DEPARTURE, { arrivalLocal: [ARRIVAL_BEFORE_DEPARTURE] });
  }

  const trip = await getTrip(tripId);
  if (!trip) return fail("여행을 찾을 수 없습니다");
  if (trip.deletedAt) return fail("휴지통에 있는 여행입니다. 복구한 뒤 수정하세요.");

  const supabase = await createSupabaseServerClient();
  const flightRow = await ensureFlightRow(supabase, tripId, flight, normalized.input, normalized.key);
  if ("error" in flightRow) return fail(flightRow.error);

  const { data: sortOrder, error: sortError } = await supabase.rpc("next_sort_order", {
    p_trip_id: tripId,
    p_start_at: flight.departure.scheduledAt,
  });
  if (sortError) return fail(dbErrorMessage("순서를 계산하지 못했습니다", sortError));

  const snapshot = {
    ...flight,
    flightNumberInput: normalized.input,
    flightNumberKey: normalized.key,
    capturedAt: new Date().toISOString(),
  };

  const { error } = await supabase.from("itinerary_items").insert({
    trip_id: tripId,
    type: "flight",
    note: note.trim() || null,
    title: `${normalized.input} ${flight.departure.airport}→${flight.arrival.airport}`,
    start_at: flight.departure.scheduledAt,
    end_at: flight.arrival.scheduledAt,
    // 항공편은 출발 공항의 시간대로 읽는 것이 자연스럽다.
    timezone: flight.departure.timezone,
    location_text: `${flight.departure.airport} 공항`,
    flight_id: flightRow.id,
    // 선택 시점의 사본. 공급자 데이터가 바뀌어도 이 값은 그대로다.
    flight_snapshot: snapshot,
    sort_order: sortOrder,
    source: flight.provider === "manual" ? "manual" : "flight_api",
  });

  if (error) return fail(dbErrorMessage("일정에 추가하지 못했습니다", error));

  revalidatePath(`/trips/${tripId}`);
  return { status: "success", message: "항공편을 일정에 추가했습니다." };
}

/** 검색 결과에서 고른 항공편을 넣는다. 페이로드는 검색 응답 그대로다. */
export async function addFlightToTripAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tripId = text(formData, "tripId");
  if (!z.uuid().safeParse(tripId).success) return fail("올바르지 않은 여행입니다");

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text(formData, "payload"));
  } catch {
    return fail("요청이 올바르지 않습니다");
  }

  const parsed = flightSchema.safeParse(parsedJson);
  if (!parsed.success) {
    // 직접 단 메시지(한국어)만 보여 준다. zod 기본 메시지는 영어다.
    const issue = parsed.error.issues[0]?.message;
    return fail(issue && /[가-힣]/.test(issue) ? issue : "항공편 정보를 확인하세요");
  }

  const numberInput = text(formData, "flightNumberInput") || parsed.data.marketingFlightNumber;
  return withSubmittedValues(await saveFlight(tripId, parsed.data, numberInput, text(formData, "note")), formData);
}

const manualSchema = z.object({
  tripId: z.uuid(),
  flightNumber: z.string().trim().min(2, "편명을 입력하세요. 예: KE703").max(12, "편명은 12자 이내로 입력하세요"),
  departureAirport: z.string().trim().length(3, "3자 공항 코드를 입력하세요").toUpperCase(),
  arrivalAirport: z.string().trim().length(3, "3자 공항 코드를 입력하세요").toUpperCase(),
  departureLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "출발 시각을 입력하세요"),
  arrivalLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "도착 시각을 입력하세요"),
  departureTimezone: z.string().trim().optional().or(z.literal("")),
  arrivalTimezone: z.string().trim().optional().or(z.literal("")),
});

/**
 * 수동 입력.
 *
 * **이 경로는 공급자 설정과 무관하게 항상 동작해야 한다.** 자동 검색은 편의지
 * 필수 경로가 아니다 (architecture.md §1). 그래서 여기서는 외부 API 를 전혀
 * 부르지 않는다.
 *
 * 시간대는 사용자가 적은 값 → 공항 표 → 여행 시간대 순으로 정한다. 세 단계를
 * 두는 이유는 "모르니까 UTC" 로 조용히 저장하면 그 항공편의 시각이 전부
 * 어긋나기 때문이다.
 */
export async function addManualFlightAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // 실패하면 입력을 되살린다. React 19 는 액션이 끝나면 폼을 기본값으로 리셋한다.
  return withSubmittedValues(await addManualFlight(formData), formData);
}

async function addManualFlight(formData: FormData): Promise<ActionState> {
  const parsed = manualSchema.safeParse({
    tripId: text(formData, "tripId"),
    flightNumber: text(formData, "flightNumber"),
    departureAirport: text(formData, "departureAirport"),
    arrivalAirport: text(formData, "arrivalAirport"),
    departureLocal: text(formData, "departureLocal"),
    arrivalLocal: text(formData, "arrivalLocal"),
    departureTimezone: text(formData, "departureTimezone"),
    arrivalTimezone: text(formData, "arrivalTimezone"),
  });
  if (!parsed.success) {
    return fail("입력을 확인하세요", parsed.error.flatten().fieldErrors);
  }

  const trip = await getTrip(parsed.data.tripId);
  if (!trip) return fail("여행을 찾을 수 없습니다");

  const departureTimezone =
    (parsed.data.departureTimezone && isValidTimezone(parsed.data.departureTimezone)
      ? parsed.data.departureTimezone
      : null) ?? airportTimezone(parsed.data.departureAirport) ?? trip.timezone;
  const arrivalTimezone =
    (parsed.data.arrivalTimezone && isValidTimezone(parsed.data.arrivalTimezone)
      ? parsed.data.arrivalTimezone
      : null) ?? airportTimezone(parsed.data.arrivalAirport) ?? trip.timezone;

  let departureAt: string;
  let arrivalAt: string;
  try {
    // 각 시각은 **그 공항의** 현지 벽시계다. 하나의 시간대로 둘 다 읽으면
    // 시차가 있는 노선에서 비행시간이 엉뚱하게 계산된다.
    departureAt = zonedLocalToUtc(parsed.data.departureLocal, departureTimezone);
    arrivalAt = zonedLocalToUtc(parsed.data.arrivalLocal, arrivalTimezone);
  } catch (caught) {
    return fail(caught instanceof Error ? caught.message : "시각을 해석할 수 없습니다");
  }

  const flight: FlightSearchResult = {
    provider: "manual",
    providerFlightId: null,
    marketingFlightNumber: parsed.data.flightNumber.toUpperCase().replace(/[\s-]/g, ""),
    operatingFlightNumber: null,
    airlineCode: null,
    operatingAirlineCode: null,
    airlineName: null,
    departure: {
      airport: parsed.data.departureAirport,
      terminal: null,
      gate: null,
      timezone: departureTimezone,
      scheduledAt: departureAt,
      estimatedAt: null,
      actualAt: null,
    },
    arrival: {
      airport: parsed.data.arrivalAirport,
      terminal: null,
      gate: null,
      timezone: arrivalTimezone,
      scheduledAt: arrivalAt,
      estimatedAt: null,
      actualAt: null,
    },
    status: "scheduled",
    raw: {},
  };

  return saveFlight(parsed.data.tripId, flightSchema.parse(flight), parsed.data.flightNumber, text(formData, "note"));
}
