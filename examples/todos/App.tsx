import React from "react";
import ReactDOM from "react-dom";
import { Provider } from "react-redux";

import { store, useSelector } from "./store";

const App = () => {
  const todos = useSelector((state) => state.todos);

  const [text, setText] = React.useState("");

  return (
    <div>
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!text.trim()) return;

          todos.add(text.trim());
          setText("");
        }}
      >
        <input value={text} onChange={(ev) => setText(ev.target.value)} />
        <button>Add Todo</button>
      </form>

      <ul>
        {todos.getTodos().map((todo) => (
          <li
            key={todo.id}
            onClick={() => todos.toggle(todo.id)}
            style={{
              textDecoration: todo.completed ? "line-through" : "inherit",
            }}
          >
            {todo.text}
          </li>
        ))}
      </ul>
    </div>
  );
};

ReactDOM.render(
  <Provider store={store}>
    <App />
  </Provider>,
  document.getElementById("root")
);
