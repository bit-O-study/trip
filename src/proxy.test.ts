// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { REQUEST_USER_HEADER, encodeRequestUser } from "./lib/supabase/request-user";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), options: null as unknown as {cookies:{setAll:(rows:Array<{name:string;value:string;options:object}>)=>void}} }));
vi.mock("@supabase/ssr", () => ({createServerClient: (_url: string, _key: string, options: typeof mocks.options) => {mocks.options=options;return {auth:{getUser:mocks.getUser}};}}));
import { proxy } from "./proxy";
beforeEach(() => {vi.resetAllMocks();vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://api.example.com/trip");vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY","anon");vi.stubEnv("SUPABASE_INTERNAL_URL","");});
afterEach(() => vi.unstubAllEnvs());
const request = (path: string) => new NextRequest("https://trip.example.com"+path,{headers:{[REQUEST_USER_HEADER]:encodeRequestUser({id:"forged",email:"fake@example.com"})}});
it("forwards only verified identity and preserves refreshed cookies", async () => {
  mocks.getUser.mockImplementation(async()=>{mocks.options.cookies.setAll([{name:"session",value:"refreshed",options:{httpOnly:true}}]);return {data:{user:{id:"real",email:"real@example.com"}},error:null};});
  const response=await proxy(request("/"));
  expect(mocks.getUser).toHaveBeenCalledOnce();
  expect(response.headers.get("x-middleware-request-"+REQUEST_USER_HEADER)).toBe(encodeRequestUser({id:"real",email:"real@example.com"}));
  expect(response.headers.get(REQUEST_USER_HEADER)).toBeNull();
  expect(response.headers.get("x-middleware-request-cookie")).toContain("session=refreshed");
  expect(response.cookies.get("session")?.value).toBe("refreshed");
});
it("cannot authenticate a protected request using a forged context", async()=>{
  mocks.getUser.mockResolvedValue({data:{user:null},error:new Error("invalid")});
  const response=await proxy(request("/trips/private"));
  expect(response.status).toBe(307);expect(response.headers.get("location")).toContain("/login");
});
it("clears forged identities on public paths and keeps shared pages private",async()=>{
  mocks.getUser.mockRejectedValue(new Error("offline"));
  const response=await proxy(request("/s/shared"));
  expect(response.headers.get("x-middleware-request-"+REQUEST_USER_HEADER)).toBe(encodeRequestUser(null));
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});