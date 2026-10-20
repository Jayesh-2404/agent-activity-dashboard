import { describe, expect, it } from "vitest";
import { hasNextPage, isRepositoryName } from "./github";

describe("hasNextPage", () => {
  it("reads the next relation from GitHub's Link header", () => {
    expect(
      hasNextPage(
        '<https://api.github.com/repositories/1/commits?per_page=30&page=2>; rel="next", ' +
          '<https://api.github.com/repositories/1/commits?per_page=30&page=4>; rel="last"',
      ),
    ).toBe(true);
  });

  it("reports no next page when only previous or last links exist", () => {
    expect(
      hasNextPage('<https://api.github.com/repositories/1/commits?page=1>; rel="prev"'),
    ).toBe(false);
    expect(
      hasNextPage('<https://api.github.com/repositories/1/commits?page=1>; rel="first"'),
    ).toBe(false);
    expect(hasNextPage("")).toBe(false);
    expect(hasNextPage(null)).toBe(false);
  });
});

describe("isRepositoryName", () => {
  it("accepts repository names GitHub allows", () => {
    expect(isRepositoryName("vercel/next.js")).toBe(true);
    expect(isRepositoryName("owner/.github")).toBe(true);
    expect(isRepositoryName("my-org/my_repo")).toBe(true);
  });

  it("rejects path segments that escape the repository route", () => {
    expect(isRepositoryName("../..")).toBe(false);
    expect(isRepositoryName("./repo")).toBe(false);
    expect(isRepositoryName("owner/..")).toBe(false);
  });

  it("rejects malformed values", () => {
    expect(isRepositoryName("owner")).toBe(false);
    expect(isRepositoryName("owner/repo/extra")).toBe(false);
    expect(isRepositoryName("owner/repo?x=1")).toBe(false);
  });
});
