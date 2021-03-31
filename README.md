# redux-model

Inspired by an awesome [easy-peasy](https://github.com/ctrlplusb/easy-peasy). Define self-contained models with methods on them and use without dispatch. Zero dependencies. Built on top of redux and compatible with it.

1. Install:

```
yarn add @dhmk/redux-model redux react-redux
```

2. Create models:

```ts
import * as m from "@dhmk/redux-model";
import produce from "immer"; // Optional. You can use any similar library or write reducer by yourself

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

interface Todos {
  byId: Record<number, Todo>;
  allIds: number[];

  getTodos: m.Selector<Todos, [], Todo[]>;

  toggle: m.Action<Todos, [id: number]>;

  add: m.Action<Todos, [text: string], { text: string; id: number }>;
}

const todos = m.model<Todos>({
  byId: {},
  allIds: [],

  getTodos: m.selector((self) => () =>
    self().allIds.map((id) => self().byId[id])
  ),

  // action is a pure function
  toggle: m.action((id) =>
    produce((state) => {
      state.byId[id].completed = !state.byId[id].completed;
    })
  ),

  // when an action needs to run side-effects
  // use a two step definition
  add: m.action(
    (text: string) => ({ text, id: Math.random() }), // action side-effects are placed here
    ({ text, id }) =>
      produce((state) => {
        state.allIds.push(id);
        state.byId[id] = { id, text, completed: false };
      })
  ),
});
```

3. Create store:

```ts
import { createStore } from "redux";
import { createModelsStore } from "../../src";

import models from "./models";

export const store = createModelsStore(createStore)(
  models /*, optional enhancer */
);

// hot reloading
if (process.env.NODE_END === "development" && (module as any).hot) {
  (module as any).hot.accept("./models", () => {
    store.replaceModels(require("./models").default);
  });
}
```

4. Use it the same way as with plain redux:

```ts
import { useSelector } from "react-redux";

const App = () => {
  const todos = useSelector((state) => state.todos);

  const [text, setText] = React.useState("");

  return (
    <div>
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!text.trim()) return;

          todos.add(text.trim());
          setText("");
        }}
      >
        <input value={text} onChange={(ev) => setText(ev.target.value)} />
        <button>Add Todo</button>
      </form>

      <ul>
        {todos.getTodos().map((todo) => (
          <li
            key={todo.id}
            onClick={() => todos.toggle(todo.id)}
            style={{
              textDecoration: todo.completed ? "line-through" : "inherit",
            }}
          >
            {todo.text}
          </li>
        ))}
      </ul>
    </div>
  );
};
```

See [examples](examples) for more.

# API

- createModelsStore(createStore)(models, enhancer?): ModelsStore

  `ModelsStore` is like a regualr redux store without `replaceReducer` method and with the following methods:

  - addModel(name, model)
  - removeModel(name)
  - replaceModels(models)

- model(config, extra?): Model

  `Model` is a function that returns model state:

  ```js
  const myModel = model({ id: 123, name: "model" });
  const { id, name } = myModel();
  ```

- model's `extra` argument:

  ```ts
  {
    onAttach: Function; // will be called when model is attached to store, may return a dispose function
    listeners: [ActionOn | ThunkOn]; // see below
  }
  ```

- action((...args) => state => nextState)

  This is actually an ordinary case reducer.
  Under the hood it compiles to action-reducer pair.
  Use it to modify state.
  Should be pure.
  It has a curried form only for convenience, both outer and inner functions are called atomically.

- action((...args) => newArgs, newArgs => state => nextState)

  An overload which enables side effects that will be applied before calling redux `dispatch()` function

- thunk(self => (...args) => any)

  For side-effects.
  Has a type.
  Dispatched like an ordinary action, thus can be tracked in debug tools.
  Outer function will be called once at initialization.

- selector(self => (...args) => any)

  Supposed to be pure.
  Outer function will be called once at initialization.

- actionOn(action => boolean, action => state => nextState)

  Modify state on action.
  Called after regular action handler.

- thunkOn(action => boolean, self => action => any)

  Perform side-effect on action.
  Outer function will be called once at initialization.

- merge(partialState)

  Helper to convert this:

  ```js
  action((arg) => (state) => ({ ...state, arg }));
  ```

  to this:

  ```js
  action((arg) => merge({ arg }));
  ```

- bind

  Helper to convert this:

  ```js
  selector((self) => {
    const sel = createSelector(
      (state) => state.allIds,
      (state) => state.byId,
      (ids, byId) => ids.map((id) => byId[id])
    );

    return () => sel(self());
  });
  ```

  to this:

  ```js
  selector(
    bind(
      createSelector(
        (state) => state.allIds,
        (state) => state.byId,
        (ids, byId) => ids.map((id) => byId[id])
      )
    )
  );
  ```
