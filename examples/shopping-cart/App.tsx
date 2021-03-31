import React from "react";
import ReactDOM from "react-dom";
import { Provider } from "react-redux";

import { store, useSelector } from "./store";

const App = () => {
  const products = useSelector((state) => state.products);
  const cart = useSelector((state) => state.cart);

  return (
    <div>
      <h2>Shopping Cart Example</h2>
      <hr />

      <h3>Products</h3>
      <ul>
        {products.getProducts().map((product) => (
          <div key={product.id}>
            <p>
              {product.name} - {product.price} x {product.count}
            </p>
            <button
              onClick={() => cart.add(product.id)}
              disabled={!product.count}
            >
              Add to cart
            </button>
          </div>
        ))}
      </ul>
      <hr />

      <h3>Your Cart</h3>
      <ul>
        {cart.getItems().map((item) => (
          <div key={item.product.id}>
            <span>
              {item.product.name} x {item.count}
            </span>
          </div>
        ))}
      </ul>
      <p>Total: {cart.getTotal()}</p>
      <button onClick={cart.checkout} disabled={!cart.getItems().length}>
        Checkout
      </button>
    </div>
  );
};

ReactDOM.render(
  <Provider store={store}>
    <App />
  </Provider>,
  document.getElementById("root")
);
