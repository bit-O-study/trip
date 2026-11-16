import { describe, expect, it } from "vitest";
import { regionName, restaurantName, restaurantSchema } from "./model";
describe("맛집 표시와 검증",()=>{
  it("한글을 먼저 표시하고 동일한 원문을 중복하지 않는다",()=>{
    expect(restaurantName({name:"우육면",original_name:"牛肉麵"})).toBe("우육면(牛肉麵)");
    expect(restaurantName({name:"牛肉麵",original_name:"牛肉麵"})).toBe("牛肉麵");
    expect(regionName("高雄市")).toBe(regionName("가오슝"));
    expect(regionName("서울")).toBe("서울");
  });
  it("좌표는 쌍으로 저장하고 범위를 검증한다",()=>{
    const input={name:"맛집",originalName:"",region:"서울",menu:"",note:"",address:"",latitude:null,longitude:null};
    expect(restaurantSchema.safeParse(input).success).toBe(true);
    expect(restaurantSchema.safeParse({...input,latitude:37}).success).toBe(false);
    expect(restaurantSchema.safeParse({...input,latitude:91,longitude:127}).success).toBe(false);
    expect(restaurantSchema.safeParse({...input,latitude:37,longitude:127}).success).toBe(true);
  });
});
