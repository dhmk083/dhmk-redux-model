import produce from "immer";
import * as m from "../../src";

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

export default {
  todos,
};
