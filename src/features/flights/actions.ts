"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { airportTimezone, isValidTimezone } from "@/features/flights/airports";
import { normalizeFlightNumber, type FlightSearchResult } from "@/features/flights/provider";
import { fail, type ActionState } from "@/features/trips/action-state";
import { getTrip } from "@/features/trips/queries";
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
 * authenticated 에는 INSERT 만 있고 UPDATE 가 없어(한 사용자가 공유 행을 바꾸지
 * 못하게) upsert 를 쓸 수 없다. 넣어 보고 중복이면 기존 행을 읽는다 —
 * `places` 와 같은 방식이다.
 */
async function ensureFlightRow(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
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
    raw: {},
  };

  const inserted = await supabase.from("flights").insert(row).select("id").single();
  if (!inserted.error) return { id: inserted.data.id };
  if (inserted.error.code !== "23505") {
    return { error: `항공편을 저장하지 못했습니다: ${inserted.error.message}` };
  }

  const existing = await supabase
    .from("flights")
    .select("id")
    .eq("flight_number_key", numberKey)
    .eq("scheduled_departure", flight.departure.scheduledAt)
    .maybeSingle();
  if (existing.error || !existing.data) {
    return { error: "이미 등록된 항공편을 찾지 못했습니다." };
  }
  return { id: existing.data.id };
}

async function saveFlight(
  tripId: string,
  flight: z.infer<typeof flightSchema>,
  numberInput: string,
): Promise<ActionState> {
  const normalized = normalizeFlightNumber(numberInput);
  if (!normalized) return fail("편명을 확인하세요. 예: KE703");

  const trip = await getTrip(tripId);
  if (!trip) return fail("여행을 찾을 수 없습니다");

  const supabase = await createSupabaseServerClient();
  const flightRow = await ensureFlightRow(supabase, flight, normalized.input, normalized.key);
  if ("error" in flightRow) return fail(flightRow.error);

  const { data: sortOrder, error: sortError } = await supabase.rpc("next_sort_order", {
    p_trip_id: tripId,
    p_start_at: flight.departure.scheduledAt,
  });
  if (sortError) return fail(`순서를 계산하지 못했습니다: ${sortError.message}`);

  const snapshot = {
    ...flight,
    flightNumberInput: normalized.input,
    flightNumberKey: normalized.key,
    capturedAt: new Date().toISOString(),
  };

  const { error } = await supabase.from("itinerary_items").insert({
    trip_id: tripId,
    type: "flight",
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

  if (error) return fail(`일정에 추가하지 못했습니다: ${error.message}`);

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
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "항공편 정보를 확인하세요");

  const numberInput = text(formData, "flightNumberInput") || parsed.data.marketingFlightNumber;
  return saveFlight(tripId, parsed.data, numberInput);
}

const manualSchema = z.object({
  tripId: z.uuid(),
  flightNumber: z.string().trim().min(2).max(12),
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

  const { raw: _raw, ...withoutRaw } = flight;
  return saveFlight(parsed.data.tripId, withoutRaw, parsed.data.flightNumber);
}
