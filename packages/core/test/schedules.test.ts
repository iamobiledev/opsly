import { describe, expect, it } from "vitest";
import { resolveOnCall } from "../src/schedules";

describe("schedule resolution", () => {
  it("rotates participants by rotation length", () => {
    const schedule = {
      id: "sched_1",
      timezone: "America/New_York",
      overrides: [],
      layers: [
        {
          id: "layer_1",
          startsAt: new Date("2026-06-01T00:00:00.000Z"),
          rotationLengthMinutes: 60,
          participants: [
            { userId: "alice", position: 0 },
            { userId: "bob", position: 1 }
          ]
        }
      ]
    };

    expect(resolveOnCall(schedule, new Date("2026-06-01T00:30:00.000Z"))).toEqual(["alice"]);
    expect(resolveOnCall(schedule, new Date("2026-06-01T01:30:00.000Z"))).toEqual(["bob"]);
  });

  it("uses overrides ahead of layer rotations", () => {
    const schedule = {
      id: "sched_1",
      timezone: "America/New_York",
      overrides: [
        {
          userId: "carol",
          startsAt: new Date("2026-06-01T00:00:00.000Z"),
          endsAt: new Date("2026-06-01T02:00:00.000Z")
        }
      ],
      layers: [
        {
          id: "layer_1",
          startsAt: new Date("2026-06-01T00:00:00.000Z"),
          rotationLengthMinutes: 60,
          participants: [{ userId: "alice", position: 0 }]
        }
      ]
    };

    expect(resolveOnCall(schedule, new Date("2026-06-01T01:00:00.000Z"))).toEqual(["carol"]);
  });
});
