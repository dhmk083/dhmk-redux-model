import products from "./products";
import cart from "./cart";

export default {
  products,
  cart: cart(products, (a) => a?.type === "auth/logout"), // for example, clear cart on user logout
};
