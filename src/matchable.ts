// matchable.ts
import isEqual from "fast-deep-equal";
import { call0, I, K } from "./comb.js";

type Nil = null | undefined;

type ToRecordKey<T> = T extends boolean
  ? `${T}` // true/false -> "true"/"false"
  : T extends string | number
    ? T
    : never;

type Handler<R, V = any> = {
  bivarianceHack(v: V): R;
}["bivarianceHack"];

/* =============================
 * Enum-like (primitive) matcher
 * ============================= */

type RequireAll<T extends string | number | boolean, R> = Record<
  ToRecordKey<T>,
  Handler<R, T>
>;

type RequireDefault<T extends string | number | boolean, R> =
  | (Partial<Record<ToRecordKey<T>, Handler<R, T>>> & { _: Handler<R, T> })
  | RequireAll<T, R>;

type MatchableEnum<T extends string | number | boolean> = {
  __recognizer__: "enum";
  value: T | Nil;

  value_or(fallback: T): T;
  value_or<F>(fallback: F): T | F;

  value_or_else(fallback: () => T): T;
  value_or_else<F>(fallback: () => F): T | F;

  match<R>(handlers: RequireDefault<T, R>): R;

  is(v: T): v is T;
  not(v: T): v is T;

  in(v: Array<T>): boolean;
  not_in(v: Array<T>): boolean;

  into(): <R>(fn: Handler<R, T>) => R | null;
  catch<L extends Array<T>>(
    ...arr_branch: L
  ): <R>(fn: Handler<R, L[number]>) => R | null;
};

function matchableEnum<T extends string | number | boolean>(
  value: T | Nil,
): MatchableEnum<T> {
  return {
    __recognizer__: "enum",
    value,

    value_or(fallback: any) {
      return (value ?? fallback) as any;
    },
    value_or_else(fallback: any) {
      return (value ?? fallback()) as any;
    },

    match<R>(h: RequireDefault<T, R>): R {
      const k = (
        typeof value === "boolean" ? String(value) : value
      ) as keyof typeof h;
      const handler = (k in h ? (h as any)[k] : (h as any)._) as Handler<R, T>;
      return handler(value as any);
    },

    is: (v: T): v is T => value === v,
    not: (v: T): v is T => value !== v,

    in(arr: Array<T>): boolean {
      return value != null ? arr.includes(value) : false;
    },
    not_in(arr: Array<T>): boolean {
      return !this.in(arr);
    },

    into() {
      const self = this;
      return function <R>(fn: Handler<R, T>): R | null {
        return self.value == null ? null : fn(self.value);
      };
    },

    catch<L extends Array<T>>(...arr_branch: L) {
      const self = this;
      return function <R>(fn: Handler<R, L[number]>): R | null {
        return self.value != null && self.in(arr_branch)
          ? fn(self.value as any)
          : null;
      };
    },
  };
}

/* =============================
 * Rust-enum-like (single-key object) matcher
 * ============================= */

type VariantTag<T> = T extends any ? keyof T : never;

type FullHandlers<T, R> = {
  [K in VariantTag<T>]: (payload: Extract<T, Record<K, any>>[K]) => R;
};

type DefaultHandlers<T, R> =
  | (Partial<FullHandlers<T, R>> & { _: (p: T[keyof T]) => R })
  | FullHandlers<T, R>;

type MatchableUnion<T extends Record<string, any>> = {
  [K in VariantTag<T>]: {
    __recognizer__: "union";
    tag: K;
    value: Extract<T, Record<K, any>>[K] | Nil;

    match<R>(h: DefaultHandlers<T, R>): R;

    is<L extends VariantTag<T>>(
      l: L,
    ): this is Extract<MatchableUnion<T>, { tag: L }>;
    not<L extends VariantTag<T>>(
      l: L,
    ): this is Extract<MatchableUnion<T>, { tag: L }>;

    in(arr: Array<VariantTag<T>>): boolean;
    not_in(arr: Array<VariantTag<T>>): boolean;

    into(): <R>(fn: (payload: Extract<T, Record<K, any>>[K]) => R) => R | null;
    catch<KS extends Array<VariantTag<T>>>(
      ...arr_branch: KS
    ): <R>(
      fn: (payload: Extract<T, Record<KS[number], any>>[KS[number]]) => R,
    ) => R | null;
  };
}[VariantTag<T>];

function matchableUnion<T extends Record<string, any>>(
  src: T,
): MatchableUnion<T> {
  const tag = Object.keys(src)[0] as VariantTag<T>;
  const payload = (src as any)[tag];

  return {
    __recognizer__: "union",
    tag,
    value: payload,

    match<R>(h: DefaultHandlers<T, R>) {
      const fn =
        (h as Partial<Record<typeof tag, (p: any) => R>>)[tag] ??
        (h as { _: (p: any) => R })._;
      return fn(payload);
    },

    is<L extends VariantTag<T>>(
      l: L,
    ): this is Extract<MatchableUnion<T>, { tag: L }> {
      return l === tag;
    },
    not<L extends VariantTag<T>>(
      l: L,
    ): this is Extract<MatchableUnion<T>, { tag: L }> {
      return l !== tag;
    },

    in(arr: Array<VariantTag<T>>): boolean {
      return arr.includes(tag);
    },
    not_in(arr: Array<VariantTag<T>>): boolean {
      return !this.in(arr);
    },

    into() {
      const self = this;
      return function <R>(fn: (p: any) => R): R | null {
        return self.value != null && !isEqual(self.value, [])
          ? fn(self.value)
          : null;
      };
    },

    catch<KS extends Array<VariantTag<T>>>(...arr_branch: KS) {
      const self = this;
      return function <R>(fn: (p: any) => R): R | null {
        return self.in(arr_branch) &&
          self.value != null &&
          !isEqual(self.value, [])
          ? fn(self.value)
          : null;
      };
    },
  } as any;
}

/* =============================
 * Empty matcher (null/undefined)
 * ============================= */

const emptyMatchable = {
  __recognizer__: "empty" as const,
  value: null as null,

  value_or: I,
  value_or_else: call0,

  match: K(null),

  is: K(false),
  not: K(false),

  catch: K(K(null)),
  not_in: K(false),
  into: K(K(null)),
  in: K(false),
};

type EmptyMatchable = typeof emptyMatchable;

/* =========================================================
 * Discriminated-object union matcher (explicit key required)
 * ========================================================= */

type OmitD<T, K extends PropertyKey> = T extends any ? Omit<T, K> : never;

type HasKeyInAll<U, K extends PropertyKey> = [U] extends [Record<K, any>]
  ? true
  : false;

type DiscTag<U, K extends PropertyKey> =
  U extends Record<K, infer V> ? V : never;

type DiscTagValue<U, K extends PropertyKey> = Extract<
  DiscTag<U, K>,
  string | number | boolean
>;

type DiscMember<U, K extends PropertyKey, V> = Extract<U, Record<K, V>>;

type DiscPayload<U, K extends PropertyKey, V> = OmitD<DiscMember<U, K, V>, K>;

type FromRecordKey<K, TV> = TV extends boolean
  ? K extends "true"
    ? true
    : K extends "false"
      ? false
      : never
  : K extends TV
    ? K
    : never;

type FullDiscHandlers<U, K extends PropertyKey, R> = {
  [RK in ToRecordKey<DiscTagValue<U, K>>]: Handler<
    R,
    DiscPayload<U, K, FromRecordKey<RK, DiscTagValue<U, K>>>
  >;
};

type DiscHandlersAll<U, K extends PropertyKey, R> = FullDiscHandlers<U, K, R>;

type DiscHandlersDefault<U, K extends PropertyKey, R> =
  Partial<FullDiscHandlers<U, K, R>> & {
    // 默认分支：收完整对象（含 discriminant）
    _: Handler<R, DiscMember<U, K, DiscTagValue<U, K>>>;
  };

type DiscHandlersAllOrNever<U, K extends PropertyKey, R> =
  HasKeyInAll<U, K> extends true
    ? DiscTagValue<U, K> extends never
      ? never
      : DiscHandlersAll<U, K, R>
    : never;

type DiscHandlersDefaultOrNever<U, K extends PropertyKey, R> =
  HasKeyInAll<U, K> extends true
    ? DiscTagValue<U, K> extends never
      ? never
      : DiscHandlersDefault<U, K, R>
    : never;

function _disc_key(v: any): string | number {
  return typeof v === "boolean" ? String(v) : v;
}

function _disc_payload(obj: any, key: PropertyKey): any {
  const out = { ...obj };
  delete (out as any)[key];
  return out;
}

type MatchableDisc<
  U extends Record<string, any>,
  K extends keyof U & string,
> = {
  __recognizer__: "disc";
  key: K;
  value: U;
  tag: DiscTagValue<U, K> | Nil;

  match<R>(h: DiscHandlersAllOrNever<U, K, R>): R;
  match<R>(h: DiscHandlersDefaultOrNever<U, K, R>): R;

  is<V extends DiscTagValue<U, K>>(v: V): boolean;
  not<V extends DiscTagValue<U, K>>(v: V): boolean;

  in(arr: Array<DiscTagValue<U, K>>): boolean;
  not_in(arr: Array<DiscTagValue<U, K>>): boolean;

  into(): <R>(fn: Handler<R, OmitD<U, K>>) => R | null;
  catch<L extends Array<DiscTagValue<U, K>>>(
    ...arr_branch: L
  ): <R>(fn: Handler<R, DiscPayload<U, K, L[number]>>) => R | null;
};

function matchableDisc<
  U extends Record<string, any>,
  const K extends keyof U & string,
>(value: U, key: K): MatchableDisc<U, K> {
  const tag = (value as any)[key] as any;

  return {
    __recognizer__: "disc",
    key,
    value,
    tag,

    match<R>(h: any): R {
      const t = tag;
      const rk = t == null ? null : _disc_key(t);
      const has = rk != null && rk in h;

      const fn = (has ? h[rk as any] : h._) as Function | undefined;
      if (!fn) {
        throw new Error(
          `match(): no handler for key=${String(key)} tag=${String(rk)}`,
        );
      }

      // 命中分支：给 payload（去掉 discriminant）
      if (has) return fn(_disc_payload(value, key));
      // 默认分支：给完整对象
      return fn(value);
    },

    is(v) {
      return tag === v;
    },
    not(v) {
      return tag !== v;
    },

    in(arr) {
      return tag != null ? arr.includes(tag) : false;
    },
    not_in(arr) {
      return !this.in(arr);
    },

    into() {
      const self = this;
      return function <R>(fn: Handler<R, any>): R | null {
        if (self.tag == null) return null;
        return fn(_disc_payload(self.value, self.key));
      };
    },

    catch(...arr_branch) {
      const self = this;
      return function <R>(fn: Handler<R, any>): R | null {
        if (self.tag == null) return null;
        if (!arr_branch.includes(self.tag as any)) return null;
        return fn(_disc_payload(self.value, self.key));
      };
    },
  };
}

/* =============================
 * Plain object matcher (+ explicit discriminant match)
 * ============================= */

type MatchableObj<T extends Record<string, any>> = {
  __recognizer__: "object";
  value: T;

  into(): <R>(fn: (props: T) => R) => R | null;

  catch<KS extends readonly (keyof T)[]>(
    ...keys: KS
  ): <R>(
    fn: (props: { [P in KS[number]]: NonNullable<T[P]> }) => R,
  ) => R | null;

  as<const K extends keyof T & string>(key: K): MatchableDisc<T, K>;

  match<const K extends keyof T & string, R>(
    key: K,
    handlers: DiscHandlersAllOrNever<T, K, R>,
  ): R;
  match<const K extends keyof T & string, R>(
    key: K,
    handlers: DiscHandlersDefaultOrNever<T, K, R>,
  ): R;
};

function matchableObj<T extends Record<string, any>>(
  value: T,
): MatchableObj<T> {
  return {
    __recognizer__: "object",
    value,

    into() {
      return (fn) => fn(value);
    },

    catch(...keys) {
      return (fn) => {
        if (keys.some((k) => (value as any)[k] == null)) return null;
        const picked: any = {};
        for (const k of keys) picked[k] = (value as any)[k];
        return fn(picked);
      };
    },

    as(key) {
      return matchableDisc(value, key);
    },

    match(key: any, handlers: any): any {
      return (matchableDisc(value as any, key as any) as any).match(handlers);
    },
  };
}

/* =============================
 * Type-level routing
 * ============================= */

type IsUnion<T, U = T> = T extends any
  ? [U] extends [T]
    ? false
    : true
  : never;

type IsSingleKeyObj<O extends Record<string, any>> =
  IsUnion<keyof O> extends true ? false : true;

type OnlyKey<O extends Record<string, any>> = keyof O extends infer K
  ? K
  : never;

type IsCapitalizedKey<K> = K extends string
  ? K extends Capitalize<K>
    ? true
    : false
  : false;

type IsRustEnumObj<O extends Record<string, any>> =
  IsSingleKeyObj<O> extends true ? IsCapitalizedKey<OnlyKey<O>> : false;

/** “联合里的每个成员都恰好 1 键” 且该键名首字母大写：才视作 Rust-enum 风格 */
type IsRustEnumUnion<U extends Record<string, any>> =
  Exclude<U extends any ? IsRustEnumObj<U> : never, true> extends never
    ? true
    : false;

type MatchableError<T> = {
  __matchable_error__: `❌ match() only supports string | number | boolean | Record<string, any>, but got: ${Extract<
    T,
    string | number | bigint | boolean | null | undefined
  >}`;
  value: T;
};

type _MatchableCore<T> = [T] extends [string | number | boolean]
  ? MatchableEnum<T>
  : [T] extends [Record<string, any>]
    ? IsRustEnumUnion<T> extends true
      ? MatchableUnion<T>
      : MatchableObj<T>
    : MatchableError<T>;

export type ME<T> =
  | ([T] extends [null] ? EmptyMatchable : never)
  | ([T] extends [undefined] ? EmptyMatchable : never)
  | _MatchableCore<NonNullable<T>>;

/* =============================
 * Public constructor
 * ============================= */

export function me<
  T extends string | number | boolean | Record<string, any> | null | undefined,
>(value: T): ME<T>;
export function me(value: any): any {
  if (value == null) return emptyMatchable;

  if (["string", "number", "boolean"].includes(typeof value)) {
    return matchableEnum(value);
  }

  // 默认仅 Rust-enum 风格：单键对象 + 键名首字母大写 => { Variant: payload }
  // 其他对象一律走 object；discriminated union 必须显式 .match(key, ...) 或 .as(key)
  const keys = Object.keys(value);
  const key = keys[0];
  if (keys.length === 1 && key != null && /^[A-Z]/.test(key)) {
    return matchableUnion(value);
  }

  return matchableObj(value);
}
