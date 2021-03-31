import { createSelectorHook } from "react-redux";
import { createStore } from "redux";
import { createModelsStore, State } from "../../src";

import models from "./models";

export const useSelector = createSelectorHook<State<typeof models>>();

export const store = createModelsStore(createStore)(models);

if (process.env.NODE_END === "development" && (module as any).hot) {
  (module as any).hot.accept("./models", () => {
    store.replaceModels(require("./models").default);
  });
}
