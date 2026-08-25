import { describe, expect, it } from "vitest";
import { canTransitionInteraction, canTransitionSession } from "./index";

describe("session state machine", () => {
  it("allows a live session to pause and resume", () => {
    expect(canTransitionSession("LIVE", "PAUSED")).toBe(true);
    expect(canTransitionSession("PAUSED", "LIVE")).toBe(true);
  });

  it("keeps ended sessions final", () => {
    expect(canTransitionSession("ENDED", "LIVE")).toBe(false);
  });

  it("allows a locked interaction to reopen", () => {
    expect(canTransitionInteraction("LOCKED", "ACCEPTING")).toBe(true);
  });
});
