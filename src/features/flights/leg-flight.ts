import { z } from "zod";
const endpoint = z.object({
  airport: z.string().regex(/^[A-Z]{3}$/),
  timezone: z.string().max(100).refine(value => { try { new Intl.DateTimeFormat("ko-KR",{timeZone:value}); return true; } catch { return false; } }),
  scheduledAt: z.iso.datetime({offset:true}).transform(value => new Date(value).toISOString()),
});
export const legFlightSchema = z.object({
  flightNumber:z.string().trim().min(2).max(12), airlineName:z.string().max(120).nullable(),
  departure:endpoint, arrival:endpoint,
}).refine(value => Date.parse(value.arrival.scheduledAt) >= Date.parse(value.departure.scheduledAt), "항공편 시각을 확인하세요.");
export type LegFlight = z.infer<typeof legFlightSchema>;
export function readLegFlight(value: unknown): LegFlight | null {
  const parsed = legFlightSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function flightTime(endpoint: LegFlight["departure"]) {
  return new Intl.DateTimeFormat("ko-KR",{timeZone:endpoint.timezone,month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(endpoint.scheduledAt));
}
