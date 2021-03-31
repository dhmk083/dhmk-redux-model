const TAG = Symbol();
const ACTION_TAG = "action";
const THUNK_TAG = "thunk";
const ACTION_ON_TAG = "actionOn";
const THUNK_ON_TAG = "thunkOn";
const SELECTOR_TAG = "selector";
const MODEL_TAG = "model";

const INITIALIZED_TAG = Symbol();

const isAction = (x) => x && x[TAG] === ACTION_TAG;
const isThunk = (x) => x && x[TAG] === THUNK_TAG;
const isSelector = (x) => x && x[TAG] === SELECTOR_TAG;

export const isModel = (x): x is Model<any> => x && x[TAG] === MODEL_TAG;

export const merge = <T = any, P extends Partial<T> = {}>(x: P) => (o: T) =>
  ({ ...o, ...x } as T);

export const bind = <T, R>(selector: (state: T) => R) => (
  self: () => T
) => () => selector(self());

const createReducer = ({ id, config, extraActions, prefix, self }) => (
  state,
  action
) => {
  let nextState = state;

  if (state?.[INITIALIZED_TAG] !== id) {
    nextState = reshape({ config, state, prefix, self });
  }

  const actionHandler = self.actionHandlers[action?.type];
  if (actionHandler) {
    nextState = actionHandler(...action.payload)(nextState);
  }

  for (const x of extraActions) {
    if (x.trigger(action)) {
      nextState = x.fn(action)(nextState);
    }
  }

  let hasChanged = state !== nextState;
  const childrenState = {};

  for (const k in self.childModels) {
    childrenState[k] = self.childModels[k].reducer(state?.[k], action);
    if (state && state[k] !== childrenState[k]) hasChanged = true;
  }

  nextState = hasChanged ? Object.assign({}, nextState, childrenState) : state;

  if (!nextState[INITIALIZED_TAG]) nextState[INITIALIZED_TAG] = id; // safe to mutate
  return nextState;
};

// mutates `self`
function reshape({ config, state, prefix, self }) {
  const nextState = {};
  self.actionHandlers = {};
  self.thunkHandlers = {};

  for (const k in config) {
    const entry = config[k];

    if (isAction(entry)) {
      self.actionHandlers[prefix + k] = entry.fn;

      nextState[k] = self.typed((...args) => {
        self.dispatch({
          type: self.prefix + k,
          payload: entry.prepare ? [entry.prepare(...args)] : args,
        });
      }, k);
    } else if (isThunk(entry)) {
      self.thunkHandlers[prefix + k] = entry(self);

      nextState[k] = self.typed((...args) => {
        self.dispatch({
          type: self.prefix + k,
          payload: args,
        });
      }, k);
    } else if (isSelector(entry)) {
      nextState[k] = entry(self);
    } else if (isModel(entry)) {
      if (!self.prefix) nextState[k] = entry();
    } else {
      nextState[k] = state && k in state ? state[k] : entry;
    }
  }

  return nextState;
}

export function model<C>(
  config: PrivateDefinition<C>,
  extra?: ExtraConfig
): Model<C> {
  const id = {}; // unique
  let onDetach;

  const self: any = () => self.getState();
  self.getState = () => initialState;
  self.prefix = undefined;
  self.dispatch = undefined;

  self.childModels = {};
  self.actionHandlers = {};
  self.thunkHandlers = {};

  const extraActions: any = [];
  const extraThunks: any = [];

  if (extra?.listeners) {
    for (const x of extra.listeners) {
      if (x[TAG] === ACTION_ON_TAG) {
        extraActions.push(x);
      } else if (x[TAG] === THUNK_ON_TAG) {
        extraThunks.push({
          trigger: x.trigger,
          fn: x.fn(self),
        });
      }
    }
  }

  self.typed = (fn, k) => {
    fn.toString = () => self.prefix + k;
    Object.defineProperty(fn, "type", { get: fn.toString });
    return fn;
  };

  const initialState: any = reshape({
    config,
    state: {},
    prefix: undefined,
    self,
  });

  self.attach = (name, dispatch, getState) => {
    if (self.prefix) throw new Error("already attached to " + self.prefix);

    self.prefix = name + "/";
    self.dispatch = dispatch;
    self.getState = getState;

    for (const k in config) {
      const entry = config[k];

      if (isModel(entry)) {
        self.childModels[k] = (entry as any).attach(
          self.prefix + k,
          self.dispatch,
          () => self()[k]
        );
      }
    }

    onDetach = extra?.onAttach?.() || (() => {});

    return {
      reducer: createReducer({
        id,
        config,
        extraActions,
        prefix: self.prefix,
        self,
      }),

      handleAction: (action) => {
        const thunkHandler = self.thunkHandlers[action?.type];
        if (thunkHandler) {
          thunkHandler(...action.payload);
        }

        for (const k in self.childModels) {
          self.childModels[k].handleAction(action);
        }

        for (const x of extraThunks) {
          if (x.trigger(action)) {
            x.fn(action);
          }
        }
      },

      detach: () => {
        self.prefix = undefined;
        self.dispatch = undefined;
        self.getState = () => initialState;

        for (const k in self.childModels) {
          self.childModels[k].detach();
        }
        self.childModels = {};

        onDetach();
      },
    };
  };

  self[TAG] = MODEL_TAG;
  return self;
}

type Brand<T, B> = T & { __brand: B };

enum PrivateTag {}
export type Private<T> = Brand<T, PrivateTag>;

export type Model<T> = {
  (): Instance<T>;
};

type PrivateModel<T> = {
  (): PrivateInstance<T>;
};

export type Instance<T> = {
  [P in keyof T]: T[P] extends Private<unknown>
    ? never
    : T[P] extends Action<infer T, infer A, any>
    ? (...args: A) => Instance<T>
    : T[P] extends Thunk<any, infer A, infer R>
    ? (...args: A) => R
    : T[P] extends Selector<any, infer A, infer R>
    ? (...args: A) => R
    : T[P] extends Model<infer M>
    ? Instance<M>
    : T[P];
};

export type PrivateInstance<T> = {
  [P in keyof T]: T[P] extends Private<infer Q>
    ? Q extends Action<infer T, infer A, any>
      ? (...args: A) => PrivateInstance<T>
      : Q extends Thunk<any, infer A, infer R>
      ? (...args: A) => R
      : Q extends Selector<any, infer A, infer R>
      ? (...args: A) => R
      : Q extends Model<infer T>
      ? PrivateInstance<T>
      : Q
    : T[P] extends Action<infer T, infer A, any>
    ? (...args: A) => PrivateInstance<T>
    : T[P] extends Thunk<any, infer A, infer R>
    ? (...args: A) => R
    : T[P] extends Selector<any, infer A, infer R>
    ? (...args: A) => R
    : T[P] extends PrivateModel<infer M>
    ? PrivateInstance<M>
    : T[P];
};

type PrivateDefinition<T> = {
  [P in keyof T]: T[P] extends Private<infer Q> ? Q : T[P];
};

type ExtraConfig = {
  onAttach?: () => (() => any) | void;
  listeners?: ReadonlyArray<ActionOn<any> | ThunkOn<any>>;
};

export type Action<T = any, A extends any[] = [], P = void> = P extends void
  ? {
      fn: (...args: A) => (state: PrivateInstance<T>) => PrivateInstance<T>;
      [TAG]: typeof ACTION_TAG;
    }
  : {
      prepare: (...args: A) => P;
      fn: (arg: P) => (state: PrivateInstance<T>) => PrivateInstance<T>;
      [TAG]: typeof ACTION_TAG;
    };

export function action<T = any, A extends any[] = []>(
  fn: (...args: A) => (state: PrivateInstance<T>) => PrivateInstance<T>
): Action<T, A, void>;
export function action<T, A extends any[] = any, P = void>(
  prepare: (...args: A) => P,
  fn: (arg: P) => (state: PrivateInstance<T>) => PrivateInstance<T>
): Action<T, A, P>;
export function action(f1, f2?: any) {
  return {
    prepare: f2 ? f1 : undefined,
    fn: f2 ? f2 : f1,
    [TAG]: ACTION_TAG,
  } as any;
}

export type Thunk<T = any, A extends any[] = [], R = any> = (
  self: PrivateModel<T>
) => (...args: A) => R;

export const thunk = <T = any, A extends any[] = [], R = any>(
  fn: (self: PrivateModel<T>) => (...args: A) => R
): Thunk<T, A, R> => {
  fn[TAG] = THUNK_TAG;
  return fn;
};

// like Thunk, but supposed to be pure
export type Selector<T = any, A extends any[] = [], R = any> = (
  self: PrivateModel<T>
) => (...args: A) => R;

export const selector = <T = any, A extends any[] = [], R = any>(
  fn: (self: PrivateModel<T>) => (...args: A) => R
): Selector<T, A, R> => {
  fn[TAG] = SELECTOR_TAG;
  return fn;
};

export type ActionOn<T = any, A = any> = {
  trigger: (action: any) => boolean;
  fn: (action: A) => (state: PrivateInstance<T>) => PrivateInstance<T>;
  [TAG]: typeof ACTION_ON_TAG;
};

export const actionOn = <T = any, A = any>(
  trigger: (action: any) => boolean,
  fn: (action: A) => (state: PrivateInstance<T>) => PrivateInstance<T>
): ActionOn<T, A> => ({
  trigger,
  fn,
  [TAG]: ACTION_ON_TAG,
});

export type ThunkOn<T = any, A = any> = {
  trigger: (action: any) => boolean;
  fn: (self: PrivateModel<T>) => (action: A) => any;
  [TAG]: typeof THUNK_ON_TAG;
};

export const thunkOn = <T = any, A = any>(
  trigger: (action: any) => boolean,
  fn: (self: PrivateModel<T>) => (action: A) => any
): ThunkOn<T, A> => ({
  trigger,
  fn,
  [TAG]: THUNK_ON_TAG,
});
