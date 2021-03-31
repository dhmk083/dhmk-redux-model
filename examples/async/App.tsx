import React from "react";
import ReactDOM from "react-dom";
import { Provider } from "react-redux";

import { store, useSelector } from "./store";

const Picker = ({ value, onChange, options }) => (
  <div>
    <h1>{value}</h1>
    <select value={value} onChange={(ev) => onChange(ev.target.value)}>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  </div>
);

const App = () => {
  const [selectedSubreddit, setSelectedSubreddit] = React.useState("reactjs");
  const reddit = useSelector((state) => state.reddit);

  const subreddit = reddit.getSubreddit(selectedSubreddit);
  const { posts } = subreddit;
  const isEmpty = posts.length === 0;

  React.useEffect(() => {
    reddit.refresh(subreddit.id, isEmpty);
  }, [subreddit.id]);

  return (
    <div>
      <Picker
        value={selectedSubreddit}
        onChange={(value) => setSelectedSubreddit(value)}
        options={["reactjs", "frontend"]}
      />

      <div>
        Last updated:{" "}
        {subreddit.updatedAt ? (
          new Date(subreddit.updatedAt).toLocaleString()
        ) : (
          <span style={{ fontStyle: "italic", fontSize: "0.9em" }}>never</span>
        )}
        . <button onClick={() => reddit.refresh(subreddit.id)}>Refresh</button>
      </div>

      {isEmpty ? (
        subreddit.isLoading ? (
          <h2>Loading...</h2>
        ) : (
          <h2>Empty</h2>
        )
      ) : (
        <ul style={{ opacity: subreddit.isLoading ? 0.5 : 1 }}>
          {posts.map((post) => (
            <li key={post.id}>
              <a href={post.link}>{post.title}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

ReactDOM.render(
  <Provider store={store}>
    <App />
  </Provider>,
  document.getElementById("root")
);
