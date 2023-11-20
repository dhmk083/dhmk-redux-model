# redux-model

Library that helps you to write concise and boilerplate-free models for redux store.

Inspired by [easy-peasy](https://github.com/ctrlplusb/easy-peasy) and [zustand](https://github.com/pmndrs/zustand).

## Install

```sh
npm install @dhmk/redux-model
```

## Examples

[Complete example](https://github.com/dhmk083/dhmk-redux-model/blob/main/examples/complete.ts)

### Javascript

```js
const modelA = createModel((self) => ({
  value: 0,
  increment: action(() => (s) => ({ value: s.value + 1 })),
  decrement: action(() =>
    produce((s) => {
      s.value--;
    })
  ),
  incrementAsync: () => {
    setTimeout(() => self().increment());
  },
}));

const modelB = createModel(...)

const root = createRoot({
  modelA,
  modelB,
})

const store = createStore(root.reducer, root.enhacer)
```

### Typescript

```ts
interface Counter {
  value: number;
  increment: Action;
  decrement: Action;
  incrementAsync: () => void;
}

const model = createModel<Counter>((self) => ({
  value: 0,
  increment: action(() => (s) => ({ value: s.value + 1 })),
  decrement: action(() =>
    produce((s) => {
      s.value--;
    })
  ),
  incrementAsync: () => {
    setTimeout(() => self().increment());
  },
}));
```

If you're not a fan of writing types, you can use a builder helper.

```ts
const model = createModel(() => {
  const self = build(
    {
      value: 0,
    },
    (action) => ({
      increment: action(() => (s) => ({ value: s.value + 1 })),
      decrement: action(() =>
        produce((s) => {
          s.value--;
        })
      ),
      incrementAsync: () => {
        setTimeout(() => self().increment());
      },
    })
  );

  return self;
});
```

### Usage with `createStore` function

```ts
const root = createRoot(...)

const store = createStore(root.reducer, root.enhacer)
```

### Usage with `configureStore` function (from redux-toolkit)

```ts
const root = createRoot(...)

const store = configureStore({
  reducer: root.reducer,
  enhancers: (e) => [root.enhancer].concat(e), // root.enhancer must come first
  middleware: (m) => m({ serializableCheck: false }) // need to turn this off, because we have functions in state
})
```

## API

### `createModel((self, context) => state)`

Takes a function which should return model's initial state. It's called with two arguments: a getter function which returns current model state in store and a context object. The context object has the following properties:

#### `context`

- `id` - unique model id

- `path` - array of string keys that defines location of the model state within global store state

- `dispatch` - store dispatch function

- `getState` - store getState function

#### `config((self, context) => config)`

You can add extra configuration for a model by using its `config` method.

- `reactions(add => [])`

Reactions are run synchronously after actions. Matcher can be a predicate function or a string type. If it returns `true` then reaction is invoked.

- `effects(add => [])`

Effects are run synchronously after an action has been dispatched and after all middleware, before returning result of the dispatched action. Matcher can be a predicate function or a string type. It it returns `true` then effect is invoked.

> Reactions and effects can utilize `ActionMatcher` type. For example:

```ts
declare const externalAction: ActionMatcher<[number]>
...
reactions: add => [
  add(externalAction, (action) => {
    // payload will be inferred as [number]
  })
]
...
```

- `hydration((mergedState, providedState) => nextState)`

Each model state gets a unique id upon creation. Whenever model's reducer receives a state argument with a different id (or undefined state), this function is called. The first argument is a new deeply merged state (model's initial state and the provided state) and the second argument is the provided state. It should return a full state object, which will be used then.

- `middleware(({dispatch, getState}) => next => action)`

Redux middleware localized to model. It means that `getState` returns model's state, not global.

> Example for redux-saga:

```ts
middleware: (api) => (next) => {
  function* saga() {
    yield takeEvery(self().increment.type, (action) => {
      console.log("action", action);
    });
  }

  const mw = createSagaMiddleware();
  const handler = mw(api)(next);
  mw.run(saga);
  return handler;
};
```

### `action((...args) => state => partialState)`

Declares an action and reducer pair. Must be pure.

### `build(stateA, (action, privateAction) => stateB)`

Typescript helper. Must be called synchronously inside `createModel` function.

### `createRoot(models)`

Takes an object with models and creates reducer and enhacer. It also returns `getState` function, so you can use it to create connections between models:

```ts
const { getState } = createRoot({
  modelA: createModelA(),
  modelB: createModelB(() => getState().modelA.property),
});
```

### `createStore(reducer, initialState?, enhancer?)`

Minimal redux store. It has no checks and warnings which original redux store has. Also, it misses observable symbol.

### `attach(fn, obj)`

Typescript helper. Alias for `Object.assign`. Use it together with `Attach` type. It allows for this handy pattern:

```ts
...
load: Attach<(id: number) => Promise<void>, {
  request: Action
  resolve: Action<[Data]>
  failure: Action<[Error]>
}>
...

...
load: attach((id) => {...}, {
  request: ...
  resolve: ...
  failure: ...
})
...

// then use it like this:
self().load(1)
self().load.request()
...
```

### `remountAction`

This action dispatches after root models were changed (after binding to store or calling `.update()` method). It has a single argument - an object with two maps of mounted and unmounted ids of models:

```ts
ModelAction<
  [
    {
      mount: Record<string, true>;
      unmount: Record<string, true>;
    }
  ]
>;
```

### `onMount(ctx)`

### `onUnmount(ctx)`

Helper predicates for reactions/effects. Example:

```ts
createModel(...).config((self, ctx) => ({
  reactions: add => [
    add(onMount(ctx), a => {
      // a is remountAction
    })
  ],
  effects: add => [
    add(onUnmount(ctx), a => {
      // a is remountAction
    })
  ]
}))
```

## Types

### `PrivateAction<Args, State?>`

Core action type. It's uncallable and only has `type` property that is a string.

### `Action<Args, State?>`

Extends `PrivateAction` and makes it callable.

### `StateOf<T>`

Returns state of a model

### `ModelAction<Args>`

Declares an action type which payload has Args type.

### `ActionMatcher<Args>`

Declares a type which matches actions with compatible parameters. For example:

```ts
declare const a1: Action;
declare const a2: Action<[number]>;
declare const a3: Action<[number, string]>;
declare const a4: Action<[string]>;

// expects an action which has at least one parameter of type `number`.
declare function test(a: ActionMatcher<[number]>);

test(a1); // error
test(a2); // ok
test(a3); // ok
test(a4); // error
```
