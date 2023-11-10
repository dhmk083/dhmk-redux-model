import { configureStore } from "@reduxjs/toolkit";
import createSagaMiddleware from "redux-saga";
import { takeEvery } from "redux-saga/effects";
import logger from "redux-logger";
import { produce } from "immer";

import {
  createModel,
  createRoot,
  build,
  Action,
  PrivateAction,
  ActionMatcher,
  action,
  attach,
  Attach,
  onMount,
  onUnmount,
} from "../src";

// Using build(...).public() preserves private actions in return type.
// Use it in helper functions, which will be later composed inside createModel.
const createSimpleCounter = () =>
  build({ value: 0 }, (action, privateAction) => ({
    increment: action((step: number = 1) => (s) => ({ value: s.value + step })),
    reset: privateAction(() => () => ({ value: 0 })),
  })).public();

interface ModelA {
  value: number;
  increment: Action<[step?: number]>;
  incrementAsync: () => void;
  reset: PrivateAction;
  load: Attach<
    (n: number) => Promise<void>,
    {
      request: PrivateAction;
      success: PrivateAction<[data: number]>;
      failure: PrivateAction<[Error]>;
    }
  >;
}

const modelA = createModel<ModelA>((self) => ({
  ...createSimpleCounter(),
  incrementAsync() {
    setTimeout(self().increment);
  },
  load: attach(async (n) => {}, {
    request: action(() => (s) => s),
    success: action((data) => (s) => s),
    failure: action((error) => (s) => s),
  }),
})).config((self, ctx) => ({
  effects: (add) => [
    add(onMount(ctx), (a) => console.log("mounted")),
    add(onUnmount(ctx), (a) => console.log("unmounted")),
    add(
      () => true,
      (a) => console.log("mod-a", a)
    ),
  ],
}));

const modelB = (reset: ActionMatcher) =>
  createModel(() => {
    const self = build(createSimpleCounter(), (action, privateAction) => ({
      someAction: action(() =>
        produce((d) => {
          d.value = 123;
        })
      ),
      load: Object.assign(async (n: number) => {}, {
        request: privateAction(() => (s) => s),
        success: privateAction((data: number) => (s) => s),
        failure: privateAction((error: Error) => (s) => s),
      }),
    }));

    // calling self.public() is not required here, because we return a builder function
    return self;
  }).config((self) => ({
    reactions: (add) => [add(reset, () => () => ({ value: 0 }))],
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
    },
  }));

const root = createRoot({
  modelA,
  get modelB() {
    return modelB(root.getState().modelA.reset);
  },
});

const store = configureStore({
  preloadedState: {
    modelA: {
      value: 111,
    },
    modelB: {
      value: 222,
    },
  } as any,
  reducer: root.reducer,
  enhancers: (e) => [root.enhancer].concat(e),
  middleware: (m) =>
    m({ serializableCheck: false /* otherwise it will complain */ }).concat(
      logger
    ),
});

// unload `modelB` - it will be replaced with `null` in global state
// and `remount` action will be dispatched
// root.update({ modelB: null })

// load `modelB` - it will be replaced with another instance of `modelB`
// and `remount` action will be dispatched
// root.update({ modelB: modelB(root.getState().modelA.reset) })
