# matchable

Tiny, type-safe helpers for matching enums, unions, and objects.

## Install
```bash
bun add @grahlnn/matchable
```

## Usage
```ts
import { me } from "@grahlnn/matchable";

const status = me<"idle" | "loading" | "error">("loading");

const label = status.match({
  idle: () => "Idle",
  loading: () => "Loading",
  _: () => "Error",
});
```
