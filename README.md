Ergonomic functional programming helpers.

## Install
```bash
bun add @grahlnn/fn
```

## Usage
```ts
import { me } from "@grahlnn/fn";

const status = me<"idle" | "loading" | "error">("loading");

const label = status.match({
  idle: () => "Idle",
  loading: () => "Loading",
  _: () => "Error",
});

import { Ok, Err } from "@grahlnn/fn";

const result = Ok(42);
const error = Err("Something went wrong");

result.isOk(); // true
result.isErr(); // false
```
