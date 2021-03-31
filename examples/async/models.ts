import produce from "immer";
import * as m from "../../src";

const defaultSubreddit = (id) => ({
  id,
  posts: [],
  lastUpdated: null,
  isLoading: false,
});

const reddit = (fetchPosts) =>
  m.model(
    {
      subreddits: {},

      getSubreddit: m.selector((self: any) => (id) =>
        self().subreddits[id] || defaultSubreddit(id)
      ),

      setLoading: m.action((id, isLoading) =>
        produce((state) => {
          const sub = state.subreddits[id] || defaultSubreddit(id);
          sub.isLoading = isLoading;
          state.subreddits[id] = sub;
        })
      ),

      setData: m.action((id, data, updatedAt) =>
        produce((state) => {
          const sub = state.subreddits[id] || defaultSubreddit(id);
          sub.isLoading = false;
          sub.updatedAt = updatedAt;
          sub.posts = data.data.children.map((x) => ({
            id: x.data.id,
            title: x.data.title,
            link: x.data.permalink,
          }));
          state.subreddits[id] = sub;
        })
      ),

      refresh: m.thunk<any, any, void>((self) => async (id, force = true) => {
        const sub = self().subreddits[id];

        if (!sub?.posts?.length || force) {
          self().setLoading(id, true);
          try {
            const data = await fetchPosts(id);
            self().setData(id, data, Date.now());
          } finally {
            self().setLoading(id, false);
          }
        }
      }),
    },
    {
      onAttach: () => {
        console.log("reddit ENTER");
        return () => console.log("reddit EXIT");
      },
    }
  );

export default {
  reddit: reddit((id) =>
    fetch(`https://www.reddit.com/r/${id}.json`).then((r) => r.json())
  ),
};
