"use strict";

const _ = require("lodash");

const handlerFunction = h =>
  typeof h.handle === "function" ? h.handle.bind(h) : h;

function nextWrapper(h) {
  switch (h.length) {
    case 2:
      return async (req, res, next) => {
        await Promise.resolve(h(req, res));
        next();
      };
    case 3:
      return h;
    default:
      throw new Error(`Handler must have an arity of 2 or 3, got ${h.length}`);
  }
}

const makeHandlers = middleware =>
  _.flatten(middleware)
    .map(handlerFunction)
    .map(nextWrapper);

class Donut {
  constructor() {
    this.mw = [];
  }

  use(...middleware) {
    this.mw.push(...makeHandlers(middleware));
    return this;
  }

  async runMiddleware(middleware, request, response, outerNext) {
    const mw = middleware.slice(0);
    const queue = [];
    const next = opt => {
      if (!mw.length || opt === "route") {
        if (outerNext) outerNext();
        return;
      }
      if (opt !== undefined) throw new Error(`Illegal value passed to next`);
      queue.push(mw.shift());
    };
    next();
    while (queue.length) {
      const h = queue.shift();
      await Promise.resolve(h(request, response, _.once(next)));
    }
  }

  hook(pred, ...middleware) {
    const handlers = makeHandlers(middleware);
    return this.use(async (req, res, next) => {
      if (!pred(req, res)) return next();
      await runMiddleware(handlers, req, res, next);
    });
  }

  async handle(request, response, outerNext) {
    this.runMiddleware(this.mw, request, response, outerNext);
  }
}

const donut = () => new Donut();

const app = donut();
app.use((request, response, next) => {
  console.log("m1", { request, response });
  next();
});

app.use((request, response) => {
  console.log("m2", { request, response });
});

const subApp = donut();
subApp.use((request, response) => {
  console.log("sm1", { request, response });
});

app.use(subApp);

app.use((request, response, next) => {
  console.log("m3", { request, response });
  next();
});

(async () => {
  try {
    await app.handle({}, {});
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
