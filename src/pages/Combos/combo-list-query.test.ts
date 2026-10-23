import { describe, expect, it } from "vitest";
import {
  parseComboListQuery,
  serializeComboListQuery,
  toComboListApiQuery
} from "./combo-list-query";

describe("combo list URL boundary", () => {
  it("keeps defaults implicit and translates URL search and attention for the backend", () => {
    const query = parseComboListQuery(
      new URLSearchParams("q=+giày+&attention=1&status=PUBLISH&page=2&unknown=x")
    );
    expect(query).toEqual({ q: "giày", status: "PUBLISH", attention: true, page: 2 });
    expect(serializeComboListQuery(query).toString()).toBe(
      "q=gi%C3%A0y&status=PUBLISH&attention=1&page=2"
    );
    expect(toComboListApiQuery(query)).toEqual({
      search: "giày",
      status: "PUBLISH",
      attention: "true",
      page: 2,
      pageSize: 20
    });
    const defaults = parseComboListQuery(new URLSearchParams());
    expect(defaults).toEqual({ q: "", status: "ACTIVE_SET", attention: false, page: 1 });
    expect(serializeComboListQuery(defaults).toString()).toBe("");
    expect(toComboListApiQuery(defaults)).toEqual({ page: 1, pageSize: 20 });
  });

  it.each([
    "q=a&q=b&status=DRAFT&status=PUBLISH&attention=1&attention=1&page=2&page=3",
    "q=%FF&status=toString&attention=true&page=-2",
    `q=${"a".repeat(101)}&status=invalid&attention=0&page=9007199254740992`
  ])("rejects malformed or repeated filter values: %s", value => {
    expect(parseComboListQuery(new URLSearchParams(value))).toEqual({
      q: "",
      status: "ACTIVE_SET",
      attention: false,
      page: 1
    });
  });
});
