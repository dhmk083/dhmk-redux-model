import {
  createModel,
  build,
  Action,
  action,
  createRoot,
  createStore,
} from "./";

it("counter example", async () => {
  interface Counter {
    value: number;
    increment: Action<[step?: number]>;
    nested: {
      decrement: Action;
    };
    incrementAsync: () => Promise<void>;
  }

  const model = createModel<Counter>((self) => ({
    value: 0,
    increment: action((n = 1) => (s) => ({ value: s.value + n })),
    nested: {
      decrement: action(() => (s) => ({ value: s.value - 1 })),
    },
    incrementAsync: async () => {
      self().increment();
    },
  }));

  const root = createRootFromModel(model);
  const store = createStore(root.reducer, root.enhancer);

  expect(store.getState()).toMatchObject({
    value: 0,
    increment: expect.any(Function),
    nested: {
      decrement: expect.any(Function),
    },
    incrementAsync: expect.any(Function),
  });

  store.getState().increment(2);
  expect(store.getState().value).toBe(2);

  store.getState().nested.decrement();
  expect(store.getState().value).toBe(1);

  await store.getState().incrementAsync();
  expect(store.getState().value).toBe(2);
});

it("build", async () => {
  const createIncrementAsync = () => {
    type Trick = { increment };

    const self = build({} as Trick, () => ({
      incrementAsync: async () => self().increment(),
    }));

    return self.public();
  };

  const model = createModel(() => {
    const self = build(
      {
        value: 0,
      },
      (action) => ({
        ...createIncrementAsync(),
        increment: action((n = 1) => (s) => ({ value: s.value + n })),
        nested: {
          decrement: action(() => (s) => ({ value: s.value - 1 })),
        },
      })
    );

    return self;
  });

  const root = createRootFromModel(model);
  const store = createStore(root.reducer, root.enhancer);

  expect(store.getState()).toMatchObject({
    value: 0,
    increment: expect.any(Function),
    nested: {
      decrement: expect.any(Function),
    },
    incrementAsync: expect.any(Function),
  });

  store.getState().increment(2);
  expect(store.getState().value).toBe(2);

  store.getState().nested.decrement();
  expect(store.getState().value).toBe(1);

  await store.getState().incrementAsync();
  expect(store.getState().value).toBe(2);
});

it("reactions", () => {
  const root = createRootFromModel(
    createModel(() => build({ value: 0 })).config(() => ({
      reactions: (add) => [
        add(
          (a) => a.type === "test",
          () => () => ({ value: 1 })
        ),
      ],
    }))
  );
  const store = createStore(root.reducer, root.enhancer);

  expect(store.getState().value).toBe(0);
  store.dispatch({ type: "test" });
  expect(store.getState().value).toBe(1);
});

it("effects", () => {
  const cb = jest.fn();

  const root = createRootFromModel(
    createModel(() => build({ value: 0 })).config(() => ({
      effects: (add) => [add((a) => a.type === "test", cb)],
    }))
  );
  const store = createStore(root.reducer, root.enhancer);

  store.dispatch({ type: "test" });
  expect(cb).toBeCalledTimes(1);
});

it("hydration", () => {
  const root = createRootFromModel(
    createModel(() => build({ value: 0 }, () => ({ fn: () => 1 }))).config(
      () => ({
        hydration(raw: any) {
          return { ...raw, value: 1 };
        },
      })
    )
  );
  const store = createStore(root.reducer, { value: 0 }, root.enhancer);

  expect(store.getState()).toMatchObject({
    value: 1,
    fn: expect.any(Function),
  });
});

it("middleware", () => {
  const cb = jest.fn();

  const root = createRootFromModel(
    createModel(() => build({ value: 0 })).config(() => ({
      middleware: (api) => (next) => (action) => {
        cb();
        return next(action);
      },
    }))
  );
  const store = createStore(root.reducer, root.enhancer);

  store.dispatch({ type: "test" });
  expect(cb).toBeCalled();
});

it("dynamic update example", () => {
  const root = createRoot({
    one: createModel(() => build({ value: 0 })),
    two: createModel(() => build({ value: 0 })),
  });
  const store = createStore(root.reducer, root.enhancer);

  expect(store.getState()).toMatchObject({
    one: { value: 0 },
    two: { value: 0 },
  });

  root.update({ two: null });
  expect(store.getState()).toMatchObject({
    one: { value: 0 },
    two: null,
  });
});

function createRootFromModel(model) {
  const m = model.build([]);
  let s;

  return {
    reducer(s, a) {
      return m.reducer(s, a);
    },
    enhancer: (cs) => (r, i) => {
      const store = cs(r, i);
      s = store;

      const dispatch = (a) => {
        const res = store.dispatch(a);
        m.handleAction(a);
        return res;
      };

      const api = {
        ...store,
        dispatch(a) {
          return (m.handleMw ?? dispatch)(a);
        },
      };

      m.mount(api, dispatch);

      return api;
    },
    // update(model) {
    //   throw new Error("not implemented");
    // },
    getState() {
      return s.getState();
    },
  };
}

it("nested", () => {
  const counter = createModel(() => {
    const self = build({ value: 0 }, (action) => ({
      incrementAction: action(() => (s) => ({ value: s.value + 1 })),
      increment() {
        // to test both `action` and `self`
        self().incrementAction();
      },
    }));

    return self;
  });

  const root = createRoot({
    one: counter,
    two: {
      a: counter,
      b: {
        b1: counter,
      },
    },
  });

  const store = createStore(root.reducer, root.enhancer);

  expect(store.getState()).toMatchObject({
    one: { value: 0 },
    two: {
      a: { value: 0 },
      b: {
        b1: { value: 0 },
      },
    },
  });

  store.getState().one.increment();
  store.getState().two.a.increment();
  store.getState().two.b.b1.increment();

  expect(store.getState()).toMatchObject({
    one: { value: 1 },
    two: {
      a: { value: 1 },
      b: {
        b1: { value: 1 },
      },
    },
  });
});
