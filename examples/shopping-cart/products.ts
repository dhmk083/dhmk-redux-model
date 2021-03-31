import produce from "immer";
import * as m from "../../src";

export type Product = {
  id: number;
  name: string;
  price: number;
  count: number;
};

export interface Products {
  byId: m.Private<Record<number, Product>>;
  allIds: m.Private<ReadonlyArray<number>>;

  getProducts: m.Selector<Products, [], ReadonlyArray<Product>>;
  getProduct: m.Selector<Products, [id: number], Product>;

  reserve: m.Action<Products, [id: number]>;
}

export default m.model<Products>({
  byId: {
    1: { id: 1, name: "bread", price: 10.99, count: 5 },
    2: { id: 2, name: "tomato", price: 5.75, count: 7 },
    3: { id: 3, name: "potato", price: 4, count: 3 },
    4: { id: 4, name: "milk", price: 2.99, count: 5 },
  },
  allIds: [1, 2, 3, 4],

  getProducts: m.selector((self) => () =>
    self().allIds.map((id) => self().byId[id])
  ),

  getProduct: m.selector((self) => (id) => self().byId[id]),

  reserve: m.action((id) =>
    produce((state) => {
      state.byId[id].count--;
    })
  ),
});
