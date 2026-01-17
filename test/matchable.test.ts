import { describe, expect, it } from "bun:test";
import { me } from "../src/matchable.ts";

describe("matchable - empty", () => {
  it("handles null and undefined", () => {
    const n = me(null);
    const u = me(undefined);

    expect(n.__recognizer__).toBe("empty");
    expect(u.__recognizer__).toBe("empty");
    expect(n.value).toBeNull();
    expect(u.value).toBeNull();

    expect(n.value_or("fallback")).toBe("fallback");
    expect(u.value_or(123)).toBe(123);
    expect(n.value_or_else(() => "lazy")).toBe("lazy");

    expect(n.match({ _: () => "ignored" })).toBeNull();
    expect(n.is("x" as never)).toBe(false);
    expect(n.not("x" as never)).toBe(false);
    expect(n.in(["x"] as never[])).toBe(false);
    expect(n.not_in(["x"] as never[])).toBe(false);

    expect(n.into()(() => "ignored")).toBeNull();
    expect(n.catch("x" as never)(() => "ignored")).toBeNull();
  });
});

describe("matchable - enum", () => {
  it("matches strings and uses default handler", () => {
    const m = me<"a" | "b">("a");
    expect(m.__recognizer__).toBe("enum");
    expect(m.value).toBe("a");
    expect(m.value_or("b")).toBe("a");
    expect(m.value_or_else(() => "b")).toBe("a");

    expect(
      m.match({
        a: () => "hit",
        _: () => "miss",
      }),
    ).toBe("hit");

    const m2 = me<"a" | "b">("b");
    expect(
      m2.match({
        a: () => "hit",
        _: () => "miss",
      }),
    ).toBe("miss");

    expect(m.is("a")).toBe(true);
    expect(m.not("a")).toBe(false);
    expect(m.in(["a", "b"])).toBe(true);
    expect(m.not_in(["a", "b"])).toBe(false);
    expect(m.not_in(["b"])).toBe(true);

    expect(m.into()((v) => v.toUpperCase())).toBe("A");
    expect(m.catch("a", "b")((v) => `${v}!`)).toBe("a!");
    expect(m2.catch("a")((v) => `${v}!`)).toBeNull();
  });

  it("matches booleans with string keys", () => {
    const b = me(true);
    expect(
      b.match({
        "true": () => "yes",
        _: () => "no",
      }),
    ).toBe("yes");
  });

  it("handles number keys and null/undefined enum values", () => {
    const n = me<1 | 2>(2);
    expect(
      n.match({
        1: () => "one",
        2: () => "two",
        _: () => "other",
      }),
    ).toBe("two");

    const n2 = me<1 | 2>(1);
    expect(
      n2.match({
        2: () => "two",
        _: () => "other",
      }),
    ).toBe("other");

    const e = me<"a" | null>(null);
    expect(e.__recognizer__).toBe("empty");
    expect(e.value_or("a")).toBe("a");
    expect(e.value_or_else(() => "a")).toBe("a");
    expect(e.match({ _: () => "default" })).toBeNull();

    const u = me<"a" | undefined>(undefined);
    expect(u.__recognizer__).toBe("empty");
    expect(u.value_or("a")).toBe("a");
    expect(u.value_or_else(() => "a")).toBe("a");
    expect(u.match({ _: () => "default" })).toBeNull();
  });
});

describe("matchable - union (Rust-enum style)", () => {
  it("matches by tag and supports defaults", () => {
    const m = me({ Circle: { r: 2 } });
    expect(m.__recognizer__).toBe("union");
    expect(m.tag).toBe("Circle");
    expect(m.value).toEqual({ r: 2 });

    const hit = m.match({
      Circle: (p) => p.r * 2,
      _: () => 0,
    });
    expect(hit).toBe(4);

    const miss = m.match({
      _: (p) => ("r" in (p as any) ? "payload" : "full"),
    });
    // default branch receives payload (value) for union
    expect(miss).toBe("payload");
  });

  it("handles in/not_in/is/not and into/catch edge cases", () => {
    const m = me<{ Items: number[] } | { Other: number[] }>({ Items: [1, 2] });
    expect(m.is("Items")).toBe(true);
    expect(m.not("Items")).toBe(false);
    expect(m.in(["Items", "Other"])).toBe(true);
    expect(m.not_in(["Other"])).toBe(true);

    expect(m.into()((p) => p.length)).toBe(2);
    expect(m.catch("Items")((p) => p[0])).toBe(1);
    expect(m.catch("Other")((p) => p[0])).toBeNull();

    const empty = me({ Items: [] as number[] });
    expect(empty.into()(() => "nope")).toBeNull();
    expect(empty.catch("Items")(() => "nope")).toBeNull();

    const nil = me({ Items: null as number[] | null });
    expect(nil.into()(() => "nope")).toBeNull();
    expect(nil.catch("Items")(() => "nope")).toBeNull();
  });

  it("throws when no handler exists", () => {
    const m = me<{ Items: number[] } | { Other: number[] }>({ Items: [1, 2] });
    expect(() => m.match({} as any)).toThrow();
  });

  it("treats undefined payload like empty for into/catch", () => {
    const u = me({ Items: undefined as number[] | undefined });
    expect(u.into()(() => "nope")).toBeNull();
    expect(u.catch("Items")(() => "nope")).toBeNull();
  });
});

describe("matchable - object", () => {
  it("is selected for non-Rust-enum objects", () => {
    const lower = me({ foo: 1 });
    expect(lower.__recognizer__).toBe("object");

    const multi = me({ Foo: 1, bar: 2 });
    expect(multi.__recognizer__).toBe("object");
  });

  it("supports into and catch key selection", () => {
    const m = me({ a: 1, b: 2, c: 3 });
    expect(m.into()((v) => v.a + v.b + v.c)).toBe(6);

    expect(m.catch("a", "b")(({ a, b }) => a + b)).toBe(3);

    const missing = me({ a: 1, b: undefined as number | undefined });
    expect(missing.catch("a", "b")(() => 123)).toBeNull();
  });
});

describe("matchable - discriminated object", () => {
  it("matches by tag and passes payload vs full object", () => {
    type Kinded =
      | { kind: "a"; x: number; y: number }
      | { kind: "b"; x: number };
    const d = me<Kinded>({ kind: "a", x: 1, y: 2 }).as("kind");
    const hit = d.match({
      a: (p) => ("kind" in p ? 0 : p.x + p.y),
      _: () => 0,
    });
    expect(hit).toBe(3);

    const miss = d.match({
      b: () => 0,
      _: (p) => ("kind" in p ? 1 : 2),
    });
    expect(miss).toBe(1);
  });

  it("supports in/not_in, into, catch, and boolean discriminants", () => {
    type Kinded =
      | { kind: "a"; x: number }
      | { kind: "b"; x: number };
    const d = me<Kinded>({ kind: "a", x: 1 }).as("kind");
    expect(d.in(["a", "b"])).toBe(true);
    expect(d.not_in(["b"])).toBe(true);
    expect(d.into()((p) => p.x)).toBe(1);
    expect(d.catch("a")((p) => p.x)).toBe(1);
    expect(d.catch("b")((p) => p.x)).toBeNull();

    const dNil = me({ kind: null as "a" | null, x: 1 }).as("kind");
    expect(dNil.into()(() => 1)).toBeNull();
    expect(dNil.catch("a")(() => 1)).toBeNull();

    type BoolKinded =
      | { flag: true; x: number }
      | { flag: false; x: number };
    const bool = me<BoolKinded>({ flag: true, x: 9 }).as("flag");
    expect(
      bool.match({
        "true": (p) => p.x,
        _: () => 0,
      }),
    ).toBe(9);
  });

  it("falls back to default when tag is null/undefined", () => {
    type K = { kind: "a"; x: number } | { kind: null; x: number };
    const dNull = me<K>({ kind: null, x: 1 }).as("kind");
    const rNull = dNull.match({
      a: () => 0,
      _: (p) => ("kind" in p ? 1 : 2),
    });
    expect(rNull).toBe(1);

    type KU = { kind: "a"; x: number } | { kind: undefined; x: number };
    const dU = me<KU>({ kind: undefined, x: 1 }).as("kind");
    const rU = dU.match({
      a: () => 0,
      _: (p) => ("kind" in p ? 1 : 2),
    });
    expect(rU).toBe(1);
  });

  it("throws when no handler exists", () => {
    const d = me({ kind: "a", x: 1 }).as("kind");
    expect(() => d.match({} as any)).toThrow(
      /match\(\): no handler for key=kind tag=a/,
    );
  });

  it("handles union type with shared discriminant key", () => {
    type X = { a: "A" } | { a: "B"; b: "x" };
    const dA = me<X>({ a: "A" }).as("a");
    const dB = me<X>({ a: "B", b: "x" }).as("a");

    const rA = dA.match({
      A: (p) => ("b" in p ? "bad" : "ok"),
      B: () => "bad",
      _: () => "bad",
    });
    expect(rA).toBe("ok");

    const rB = dB.match({
      A: () => "bad",
      B: (p) => p.b,
      _: () => "bad",
    });
    expect(rB).toBe("x");
  });
});

describe("matchable - object edge cases", () => {
  it("handles empty key list for catch()", () => {
    const m = me({ a: 1, b: 2 });
    expect(m.catch()((p) => Object.keys(p).length)).toBe(0);
  });

  it("routes uppercase single-key object to union, others to object", () => {
    const u = me({ A: 1 });
    const o1 = me({ "": 1 });
    const o2 = me({ "1": 2 });
    expect(u.__recognizer__).toBe("union");
    expect(o1.__recognizer__).toBe("object");
    expect(o2.__recognizer__).toBe("object");
  });
});
