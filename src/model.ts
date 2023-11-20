import { isPlainObject, mergeDeep, getIn, AnyFunction } from "@dhmk/utils";
import { AnyAction, Middleware } from "redux";
import { _Model, _ModelInstance } from "./common";

const idSymbol = Symbol();
const actionSymbol = Symbol();

let g_builderSelf;
// let g_builderContext; // TODO?

const createId = () =>
  Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join("");

const isAction = (x) => x && x[actionSymbol];

type Exactly<T, U> = T & Record<Exclude<keyof U, keyof T>, never>;

type ReactionHelper = {
  <T, P extends Exactly<Partial<T>, P>, A extends AnyAction>(
    test: (a: AnyAction) => a is A,
    fn: (a: A) => Setter<T, P>
  ): { test: (a) => boolean; fn: (a) => Setter<T, P> };

  <T, P extends Exactly<Partial<T>, P>, A extends AnyAction>(
    test: ((a: A) => boolean) | string,
    fn: (a: A) => Setter<T, P>
  ): { test: (a) => boolean; fn: (a) => Setter<T, P> };

  <T, P extends Exactly<Partial<T>, P>, A extends any[]>(
    test: PrivateAction<A>,
    fn: (a: ModelAction<A>) => Setter<T, P>
  ): { test: (a) => boolean; fn: (a) => Setter<T, P> };
};

type EffectHelper = {
  <A extends AnyAction>(test: (a: AnyAction) => a is A, fn: (a: A) => any): {
    test: (a) => boolean;
    fn: (a) => any;
  };

  <A extends AnyAction>(
    test: ((a: A) => boolean) | string,
    fn: (a: A) => any
  ): { test: (a) => boolean; fn: (a) => any };

  <A extends any[]>(test: PrivateAction<A>, fn: (a: ModelAction<A>) => any): {
    test: (a) => boolean;
    fn: (a) => any;
  };
};

export type ModelAction<Args extends any[] = [], T extends string = string> = {
  type: T;
  payload: Args;
};

type ModelConfig<S> = {
  reactions: (
    add: ReactionHelper
  ) => { test: (a) => boolean; fn: (a) => Setter<S, Partial<S>> }[];

  effects: (add: EffectHelper) => { test: (a) => boolean; fn: (a) => any }[];

  middleware: Middleware<{}, S>;

  hydration: (raw: unknown, orig: unknown) => Partial<S>;
};

class _ActionCore<A extends any[], S = unknown> {
  type!: string;
  protected args?: A;
  protected state?: (s: S) => void;
}

export type ActionCore<A extends any[], S = unknown> = _ActionCore<A, S>;

const getKeys = (x) => {
  const res: any = [];
  for (const k in x) res.push(k);
  return res;
};

function _createModel(state, config?) {
  return new _Model({
    config(fn) {
      return _createModel(state, fn);
    },

    build(modelPath) {
      const modelId = createId();
      let stateId = createId();

      let mwApi;
      const api = {
        getState() {
          if (mwApi) return getIn(mwApi.getState(), modelPath);

          return initialState;
        },

        dispatch(a) {
          if (mwApi) return mwApi.dispatch(a);

          throw new Error("model is not bound");
        },
      };

      const self = api.getState;

      const context = {
        id: modelId,
        path: modelPath,
        getState() {
          return mwApi.getState();
        },
        dispatch: api.dispatch,
        // initialState
      };

      let initialState;

      g_builderSelf = self;
      const stateResult = state(self, context);
      g_builderSelf = undefined;
      const rawState =
        typeof stateResult === "function"
          ? stateResult.getInitialState()
          : stateResult;

      const {
        reactions: _reactions = () => [],
        effects: _effects = () => [],
        middleware: _middleware,
        hydration: _hydration = (x) => x,
      } = config?.(self, context) ?? {};

      const normalizedReducers = {};

      function processObject(x, path) {
        const keysAndSymbols: any[] = getKeys(x).concat(
          Object.getOwnPropertySymbols(x) as any
        );

        const res = {};

        for (const xk of keysAndSymbols) {
          if (typeof xk === "string") {
            const xp = path.concat(xk);
            const xv = x[xk];

            if (isAction(xv)) {
              const type = modelPath.concat(xp).join(".");

              // 1. keep reducer (note side effect)
              normalizedReducers[type] = xv;

              // 2. return action creator
              res[xk] = Object.assign(
                (...args) =>
                  api.dispatch({
                    type,
                    payload: args,
                  }),
                { type }
              );
            } else {
              res[xk] = walk(xv, xp);
            }
          } else res[xk] = x[xk];
        }

        return res;
      }

      function walk(x, path: any[] = []) {
        if (isPlainObject(x)) {
          return processObject(x, path);
        } else if (typeof x === "function") {
          if (!getKeys(x).length) return x;
          else return Object.assign(x.bind(null), processObject(x, path));
        } else return x;
      }

      initialState = walk(rawState);

      const addHelper = (t, fn) => ({
        test: typeof t.type === "string" ? t.type : t,
        fn,
      });

      const reactionsMap = {};
      const reactionsList: any[] = [];
      _reactions(addHelper).forEach((r: any) => {
        if (typeof r.test === "string")
          reactionsMap[r.test] = (reactionsMap[r.test] ?? []).concat(r.fn);
        else reactionsList.push(r);
      });

      const mergeIfNeeded = (prev, next) => {
        if (next[idSymbol]) return next;
        else return { ...prev, ...next };
      };

      const reducer = (state, action) => {
        state ??= initialState;

        if (state[idSymbol] !== stateId) {
          const unchangedState = state;
          if (state[idSymbol]) state = JSON.parse(JSON.stringify(state));
          state = mergeDeep(initialState, state);
          state = { ...state, ..._hydration(state, unchangedState) };
          stateId = state[idSymbol] = createId();
        }

        const reducer = normalizedReducers[action.type];
        if (reducer)
          state = mergeIfNeeded(state, reducer(...action.payload)(state));

        const rs = reactionsMap[action.type];
        if (rs)
          state = rs.reduce(
            (acc, r) => mergeIfNeeded(acc, r(action)(acc)),
            state
          );

        return reactionsList.reduce(
          (acc, r) =>
            r.test(action) ? mergeIfNeeded(acc, r.fn(action)(acc)) : acc,
          state
        );
      };

      const effectsMap = {};
      const effectsList: any[] = [];
      _effects(addHelper).forEach((ef: any) => {
        if (typeof ef.test === "string")
          effectsMap[ef.test] = (effectsMap[ef.test] ?? []).concat(ef.fn);
        else effectsList.push(ef);
      });

      let _handleMw;

      return new _ModelInstance({
        id: modelId,
        reducer,
        mount(api, next?) {
          if (mwApi) throw new Error("model has already been mounted");

          mwApi = api;

          if (_middleware) {
            _handleMw = _middleware(api)(next);
          }
        },
        dispose() {
          mwApi = undefined;
        },
        handleAction(a) {
          const efs = effectsMap[a?.type];
          efs && efs.forEach((ef) => ef(a));
          effectsList.forEach((ef) => ef.test(a) && ef.fn(a));
        },
        handleMw: _middleware ? (a) => _handleMw(a) : undefined,
      });
    },
  }) as any;
}

export function createModelAction<Args extends any[]>(
  type
): ((...args: Args) => ModelAction<Args>) & PrivateAction<Args> {
  return Object.assign(
    (...args: Args) => ({
      type,
      payload: args,
    }),
    { type }
  );
}

type Builder<T> = (() => Private<T>) & Model<T>;

class _ModelCore<T> {
  protected __modelTag?: T;
}

export type Model<T> = _ModelCore<T>;

export type ConfigurableModel<T> = Model<T> & {
  config: <K extends Partial<ModelConfig<T>>>(
    fn: (self: () => Private<T>, ctx: Context) => K
  ) => Model<T>;
};

export type PrivateAction<A extends any[] = [], S = unknown> = ActionCore<
  A,
  S
> & { __private?: true };

export type Action<A extends any[] = [], S = unknown> = ((...args: A) => void) &
  ActionCore<A, S>;

export type Setter<S, U> = ((s: S) => S) | ((s: S) => U);

export type ActionCreator<S> = <
  A extends any[],
  U extends Exactly<Partial<S>, U>
>(
  fn: (...args: A) => Setter<S, U>
) => Action<A, S>;

export type PrivateActionCreator<S> = <
  A extends any[],
  U extends Exactly<Partial<S>, U>
>(
  fn: (...args: A) => Setter<S, U>
) => PrivateAction<A, S>;

// ensures that actions are compatible with `S` state
type CheckActions<T, S> = {
  [P in keyof T]: T[P] extends ActionCore<infer A>
    ? ActionCore<A, S>
    : T[P] extends object
    ? CheckActions<T[P], S>
    : T[P];
};

export function build<A, B extends CheckActions<B, A & B>>(
  a: A,
  b?: (a: ActionCreator<A>, pa: PrivateActionCreator<A>) => B
): Builder<A & B> {
  if (!g_builderSelf)
    throw new Error(
      "`build` must be called synchronously inside `create` function"
    );

  const self = g_builderSelf;

  const initialState = mergeDeep<any>(a, b?.(action, action) ?? {});

  const builder = () => self() ?? initialState;
  builder.getInitialState = () => initialState;

  return builder;
}

export type StateOf<T> = T extends Model<infer M> ? M : unknown;

type AllowMore<A extends any[]> = [...A, ...unknown[]];

export type ActionMatcher<A extends any[] = []> = PrivateAction<AllowMore<A>>;

export type Context = {
  id: string;
  path: ReadonlyArray<string>;
  getState(): unknown;
  dispatch(a: AnyAction): unknown;
};

export function createModel<T extends Builder<unknown>>(
  state: () => T
): ConfigurableModel<Public<StateOf<T>>>;
export function createModel<T>(
  state: (self: () => Private<T>, ctx: Context) => Bind<T, T>
): ConfigurableModel<Public<T>>;
export function createModel(state) {
  return _createModel(state);
}

export function action<A extends any[], S>(
  fn: (...args: A) => (s: S) => Partial<S>
): Action<A, S> {
  return Object.assign(fn.bind(null), { [actionSymbol]: true }) as any;
}

export function _<T>(x: T): T {
  return x;
}

// ensures that private actions are uncallable
export type Public<T> = {
  [P in keyof T]: T[P] extends Action<any, any> & { __private?: false } // T[P] is not PrivateAction
    ? T[P]
    : T[P] extends PrivateAction<infer A, infer S>
    ? PrivateAction<A, S>
    : T[P] extends object
    ? (T[P] extends Function ? T[P] : {}) & Public<T[P]>
    : T[P];
};

// makes private actions callable
export type Private<T> = {
  [P in keyof T]: T[P] extends PrivateAction<infer A, infer S>
    ? Action<A, S> & T[P] // keep T[P] to distinguish private actions
    : T[P] extends object
    ? T[P] & Private<T[P]>
    : T[P];
};

type Bind<T, S> = {
  [P in keyof T]: T[P] extends PrivateAction<infer A, unknown>
    ? PrivateAction<A, S>
    : T[P] extends Action<infer A, unknown>
    ? Action<A, S>
    : T[P] extends Attach<infer A, infer B>
    ? keyof B extends never
      ? T[P]
      : Attach<A, Bind<B, S>>
    : T[P] extends object
    ? Bind<T[P], S>
    : T[P];
};

export type Attach<A extends AnyFunction, B extends object> = A & B;

export function attach<A extends AnyFunction, B extends object>(
  a: A,
  b: B
): Attach<A, B> {
  return Object.assign(a, b);
}

export const isModel = (x) => x instanceof _Model;
