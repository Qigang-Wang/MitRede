import { Test } from "@nestjs/testing";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("reports that the API is available", async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    const response = module.get(HealthController).check();

    expect(response.status).toBe("ok");
    expect(response.service).toBe("mitrede-api");
    expect(Number.isNaN(Date.parse(response.timestamp))).toBe(false);
  });
});
