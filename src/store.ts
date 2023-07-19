import { Action, Reducer, StoreEnhancer, PreloadedState, Store } from "redux";

export function createStore<S, A extends Action, Ext, StateExt>(
  reducer: Reducer<S, A>,
  enhancer?: StoreEnhancer<Ext, StateExt>
): Store<S & StateExt, A> & Ext;

export function createStore<S, A extends Action, Ext, StateExt>(
  reducer: Reducer<S, A>,
  preloadedState?: PreloadedState<S>,
  enhancer?: StoreEnhancer<Ext>
): Store<S & StateExt, A> & Ext;

export function createStore(reducer, initialState?, enhancer?) {
  if (typeof initialState === "function") {
    enhancer = initialState;
    initialState = undefined;
  }
  if (enhancer) return enhancer(createStore)(reducer, initialState);

  let state = initialState;
  const listeners = new Set<Function>();

  const store = {
    getState() {
      return state;
    },

    dispatch(action) {
      state = reducer(state, action);
      listeners.forEach((fn) => fn());
      return action;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  store.dispatch({ type: "" });
  return store;
}
