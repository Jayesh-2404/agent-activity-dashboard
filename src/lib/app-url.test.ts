import { describe, expect, it } from "vitest";
import { appOrigin } from "./app-url";

describe("appOrigin", () => {
  it("uses the request origin when APP_URL is unset or blank", () => {
    expect(appOrigin(undefined, "http://localhost:3112")).toBe("http://localhost:3112");
    expect(appOrigin("   ", "http://localhost:3112")).toBe("http://localhost:3112");
  });

  it("uses the configured origin and strips paths and trailing slashes", () => {
    expect(appOrigin("http://localhost:3000/", "http://localhost:3112")).toBe("http://localhost:3000");
    expect(appOrigin("https://activity.example/base/", "http://localhost:3112")).toBe(
      "https://activity.example",
    );
  });
});
