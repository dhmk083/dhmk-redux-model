import { createSelector } from "reselect";
import produce from "immer";
import * as m from "../../src";

import { Product, Products } from "./products";

interface Cart {
  productIds: m.Private<ReadonlyArray<number>>;
  countByIds: m.Private<Record<number, number>>;

  getItems: m.Selector<
    Cart,
    [],
    ReadonlyArray<{ product: Product; count: number }>
  >;

  getTotal: m.Selector<Cart, [], number>;

  add: m.Thunk<Cart, [id: number]>;

  checkout: m.Action<Cart>;

  addItem: m.Private<m.Action<Cart, [id: number]>>;
}

const createCart = (products: m.Model<Products>, clearOn) =>
  m.model<Cart>(
    {
      productIds: [],
      countByIds: {},

      getItems: m.selector(
        m.bind(
          createSelector(
            (state) => state.productIds,
            (state) => state.countByIds,
            (ids, counts) =>
              ids.map((id) => ({
                product: products().getProduct(id),
                count: counts[id],
              }))
          )
        )
      ),

      getTotal: m.selector(
        m.bind(
          createSelector(
            (state) => state.getItems(),
            (items) =>
              items.reduce(
                (sum, item) => sum + item.product.price * item.count,
                0
              )
          )
        )
      ),

      add: m.thunk((self) => (id) => {
        if (products().getProduct(id).count > 0) {
          products().reserve(id);
          self().addItem(id);
        }
      }),

      checkout: m.action(() => m.merge({ productIds: [], countByIds: {} })),

      addItem: m.action((id) =>
        produce((state) => {
          const count = state.countByIds[id] || 0;
          if (!count) state.productIds.push(id);
          state.countByIds[id] = count + 1;
        })
      ),
    },
    {
      listeners: [
        m.actionOn<Cart>(clearOn, () =>
          m.merge({ productIds: [], countByIds: {} })
        ),
      ],
    }
  );

export default createCart;
