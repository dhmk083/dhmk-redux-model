import { isModel, Model, Instance } from "./model";

const noop = () => {};

export type State<T> = {
  [P in keyof T]: T[P] extends Model<infer M>
    ? Instance<M>
    : T[P] extends (state: infer S, action: any) => any
    ? Exclude<S, undefined>
    : T[P];
};

function createModelsManager(models) {
  const attachedModels: any = {};
  let store;
  let isReducing;
  let reducerAction;
  let reducerPreviousState;
  let reducerNextState = {};
  let reducerEvaluatingModels = {};

  function evalModel(k) {
    let state = reducerNextState[k];

    if (!state) {
      if (reducerEvaluatingModels[k]) {
        return reducerPreviousState[k];
      }

      try {
        reducerEvaluatingModels[k] = true;
        state = reducerNextState[k] = attachedModels[k].reducer(
          reducerPreviousState[k],
          reducerAction
        );
      } finally {
        reducerEvaluatingModels[k] = false;
      }
    }

    return state;
  }

  function reducer(state, action) {
    reducerPreviousState = state;
    reducerAction = action;

    isReducing = true;
    reducerNextState = {};

    try {
      let hasChanged = state === undefined;

      for (const k in attachedModels) {
        const s = evalModel(k);
        if (state[k] !== s) hasChanged = true;
      }

      return hasChanged ? reducerNextState : state;
    } finally {
      isReducing = false;
      reducerPreviousState = undefined;
      reducerAction = undefined;
    }
  }

  function getModelState(k) {
    return isReducing ? evalModel(k) : store.getState()[k];
  }

  function updateModels(nextModels, force) {
    // detach
    for (const k in models) {
      if (attachedModels[k] && (models[k] !== nextModels[k] || force)) {
        attachedModels[k].detach();
        if (!nextModels[k]) delete attachedModels[k];
      }
    }

    // attach
    for (const k in nextModels) {
      if (models[k] !== nextModels[k] || force) {
        const entry = nextModels[k];

        attachedModels[k] = isModel(entry)
          ? (entry as any).attach(k, store.dispatch, () => getModelState(k))
          : { reducer: entry, handleAction: noop, detach: noop };
      }
    }

    models = nextModels;
    store.dispatch({ type: "@@modelsManager/update" });
  }

  function removeModel(key) {
    const { [key]: _, ...newModels } = models as any;
    updateModels(newModels, false);
  }

  return {
    reducer,

    middleware: () => (next) => (action) => {
      for (const k in attachedModels) {
        attachedModels[k].handleAction(action);
      }

      return next(action);
    },

    setStore(newStore) {
      store = newStore;
      updateModels(models, true);
    },

    add(key, model) {
      if (key in models) throw new Error("model already exists");

      updateModels({ ...models, [key]: model }, false);
      return () => removeModel(key);
    },

    remove: removeModel,

    replace(newModels) {
      updateModels(newModels, true);
    },
  };
}

type Models<T> = {
  [P in keyof T]: T[P] extends Model<any>
    ? T[P]
    : T[P] extends (state: any, action: any) => any
    ? T[P]
    : never;
};

type ModelsStore<T> = {
  getState: () => State<T>;
  dispatch;
  subscribe;
  replaceReducer;
  [Symbol.observable];
  addModel;
  removeModel;
  replaceModels;
};

export const createModelsStore = <C extends Function>(createStore: C) => <T>(
  models: Models<T>,
  ...args
): ModelsStore<T> => {
  const modelsManager = createModelsManager(models);
  const store = createStore(modelsManager.reducer, ...args);
  const dispatch = modelsManager.middleware()(store.dispatch);
  modelsManager.setStore({
    ...store,
    dispatch,
  });

  return {
    ...store,
    replaceReducer: undefined,
    dispatch,
    addModel: modelsManager.add,
    removeModel: modelsManager.remove,
    replaceModels: modelsManager.replace,
  };
};
