interface ModelInstance {
  id;
  reducer;
  mount(api, next?);
  dispose();
  handleAction(a);
  handleMw?: (a) => any;
}

export class _ModelInstance {
  reducer;

  constructor(x) {
    Object.assign(this, x);
  }
}

export class _Model {
  build!: (path: ReadonlyArray<string>) => ModelInstance;

  constructor(x) {
    Object.assign(this, x);
  }
}
