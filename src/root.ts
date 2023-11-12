import { isPlainObject, objectMap, mergeDeep } from "@dhmk/utils";
import { combineReducers, Reducer, StoreEnhancer, AnyAction } from "redux";
import { Model, Context, ModelAction, createModelAction } from "./model";
import { _Model, _ModelInstance } from "./common";

const isLazy = (obj, k) => !!Object.getOwnPropertyDescriptor(obj, k)?.get;

function objectMapDeep(x, fn, path = [] as any[], parent = x) {
  return isPlainObject(x)
    ? objectMap(x, (v, k) => objectMapDeep(v, fn, path.concat(k), x))
    : fn(x, path, parent);
}

export type RootState<T> = {
  [P in keyof T]: T[P] extends Model<infer S>
    ? S
    : T[P] extends Reducer<infer S>
    ? S
    : T[P] extends object
    ? RootState<T[P]>
    : T[P];
};

type Updater<T> = {
  [P in keyof T]?: T[P] extends Model<unknown>
    ? T[P] | null
    : T[P] extends object
    ? Updater<T[P]>
    : T[P];
};

interface Root<S> {
  reducer(s: RootState<S> | undefined, a: any): RootState<S>;
  enhancer: StoreEnhancer;
  update(s: Updater<S>): void;
  getState(): RootState<S>;
}

type RemountActionPayload = [
  {
    mount: Record<string, true>;
    unmount: Record<string, true>;
  }
];

export const remountAction =
  createModelAction<RemountActionPayload>("@dhmk/flux/remount");

export type RemountAction = ModelAction<RemountActionPayload>;

export const onMount =
  (ctx: Pick<Context, "id">) =>
  (a: AnyAction): a is RemountAction =>
    a.type === remountAction.type && a.payload[0].mount[ctx.id];

export const onUnmount =
  (ctx: Pick<Context, "id">) =>
  (a: AnyAction): a is RemountAction =>
    a.type === remountAction.type && a.payload[0].unmount[ctx.id];

export function createRoot<T>(configTree: T): Root<T>;
export function createRoot(configTree) {
  let modelsTree = createModelsTree(configTree);
  let reducer;
  let unboundState;
  let rawStore;
  let mwApi;
  let mwCtx = {
    start: (a) => {},
    end: (a) => {},
  };

  /**
   * Build normalized model tree.
   * Each leaf has at least _ModelInstance { reducer } shape.
   */
  function createModelsTree(x, path: string[] = []) {
    if (isPlainObject(x)) {
      const result = {};

      for (const k in x) {
        if (isLazy(x, k)) {
          Object.defineProperty(result, k, {
            get: () => {
              delete result[k];
              return (result[k] = createModelsTree(x[k], path.concat(k)));
            },
            enumerable: true,
            configurable: true,
          });
        } else {
          result[k] = createModelsTree(x[k], path.concat(k));
        }
      }

      return result;
    } else {
      const v = x;
      const norm =
        v instanceof _Model
          ? v.build(path)
          : typeof v === "function"
          ? new _ModelInstance({ reducer: v })
          : new _ModelInstance({ reducer: () => v });
      return norm;
    }
  }

  function getState() {
    if (mwApi) return mwApi.getState();

    return (unboundState ??= buildUnboundState(modelsTree));
  }

  function buildUnboundState(x) {
    if (isPlainObject(x)) {
      const result = {};

      for (const k in x) {
        if (isLazy(x, k)) {
          Object.defineProperty(result, k, {
            get() {
              delete result[k];
              return (result[k] = buildUnboundState(x[k]));
            },
            enumerable: true,
            configurable: true,
          });
        } else {
          result[k] = buildUnboundState(x[k]);
        }
      }

      return result;
    } else {
      return x.reducer(undefined, { type: "" });
    }
  }

  // recursive combineReducers
  function combineDeep(x) {
    if (x instanceof _ModelInstance) return x.reducer;

    return combineReducers(objectMap(x, (v) => combineDeep(v)));
  }

  function rebuild(raw) {
    const partTree = createModelsTree(raw);
    const nextTree = mergeDeep(modelsTree, partTree);

    // return oldTree for remount()
    const oldTree = modelsTree;

    reducer = combineDeep(nextTree);
    modelsTree = nextTree;

    return oldTree;
  }

  function remount(newTree, oldTree) {
    const actionHandlers: any[] = [];
    const mwHandlers: any[] = [];
    const mwMap = {};
    const mount = {};
    const unmount = {};

    function getFlatModels(tree) {
      const flat = {};

      tree &&
        objectMapDeep(tree, (v) => {
          if (v.id) flat[v.id] = v;
        });

      return flat;
    }

    const oldFlatModels = getFlatModels(oldTree);
    const newFlatModels = getFlatModels(newTree);
    const modelsToDispose: any[] = [];

    for (const id in oldFlatModels) {
      const newModel = newFlatModels[id];

      if (!newModel) {
        const oldModel = oldFlatModels[id];
        modelsToDispose.push(oldModel);

        unmount[id] = true;
      } else {
        actionHandlers.push(newModel.handleAction);

        if (newModel.handleMw) {
          mwHandlers.push(newModel.handleMw);
          mwMap[id] = mwHandlers.length;
        }
      }
    }

    for (const id in newFlatModels) {
      const newModel = newFlatModels[id];

      if (!oldFlatModels[id]) {
        actionHandlers.push(newModel.handleAction);

        if (newModel.handleMw) {
          // eslint-disable-next-line no-loop-func
          const next = (...args) => {
            const nextFnIndex = mwMap[id];
            if (!nextFnIndex) return;

            const nextFn = mwHandlers[nextFnIndex];
            return nextFn(...args);
          };

          newModel.mount(mwApi, next);

          mwHandlers.push(newModel.handleMw);
          mwMap[id] = mwHandlers.length;
        } else {
          newModel.mount(mwApi);
        }

        mount[id] = true;
      }
    }

    mwHandlers.push((a) => nextMwCtx.end(a));

    const nextMwCtx = {
      start: mwHandlers[0],
      end: (a) => {
        const res = rawStore.dispatch(a);
        actionHandlers.forEach((fn) => fn(a));
        return res;
      },
    };

    const oldMwCtx = mwCtx;

    if (!oldTree) {
      // initial mount - mwCtx is empty
      mwCtx = nextMwCtx;
    }

    mwApi.dispatch(remountAction({ mount, unmount }));
    modelsToDispose.forEach((x) => x.dispose());
    // unset old mw chain
    oldMwCtx.end = () => {};
    mwCtx = nextMwCtx;
  }

  return {
    reducer(s, a) {
      if (!reducer) {
        // lazy initialization
        rebuild(configTree);
      }

      return reducer(s, a);
    },

    enhancer: (createStore) => (reducer, preloadedState) => {
      const store = createStore(reducer, preloadedState);
      rawStore = store;

      mwApi = {
        ...store,
        dispatch(a) {
          return mwCtx.start(a);
        },
      };

      remount(modelsTree, undefined);

      return mwApi;
    },

    update(raw) {
      const oldTree = rebuild(raw);
      remount(modelsTree, oldTree);
    },

    getState,
  };
}
