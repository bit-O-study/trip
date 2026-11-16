// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { REQUEST_USER_HEADER, encodeRequestUser } from "./request-user";
const mocks=vi.hoisted(()=>({headers:vi.fn(),getUser:vi.fn()}));
vi.mock("next/headers",()=>({headers:mocks.headers}));
vi.mock("./server",()=>({createSupabaseServerClient:async()=>({auth:{getUser:mocks.getUser}})}));
import { getCurrentUser } from "./user";
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://api.example.com/trip");vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY","anon");});
afterEach(()=>vi.unstubAllEnvs());
it("reuses per-request display identity without another auth call or cross-user reuse",async()=>{
  for(const id of ["first","second"]){mocks.headers.mockResolvedValue(new Headers({[REQUEST_USER_HEADER]:encodeRequestUser({id,email:null})}));expect(await getCurrentUser()).toEqual({id,email:null});}
  expect(mocks.getUser).not.toHaveBeenCalled();
});
it("keeps anonymous and invalid contexts anonymous",async()=>{
  for(const value of [encodeRequestUser(null),"invalid"]){mocks.headers.mockResolvedValue(new Headers({[REQUEST_USER_HEADER]:value}));expect(await getCurrentUser()).toBeNull();}
  expect(mocks.getUser).not.toHaveBeenCalled();
});
it("validates through auth when running without proxy context",async()=>{
  mocks.headers.mockResolvedValue(new Headers());mocks.getUser.mockResolvedValue({data:{user:{id:"fallback",email:null}},error:null});
  expect(await getCurrentUser()).toEqual({id:"fallback",email:null});expect(mocks.getUser).toHaveBeenCalledOnce();
});