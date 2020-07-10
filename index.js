"use strict";

const _ = require("lodash");

const handlerFunction = h =>
  typeof h.handle === "function" ? h.handle.bind(h) : h;

function nextWrapper(h) {
  switch (h.length) {
    case 2:
      return (req, res, next) =>
        Promise.resolve(h(req, res))
          .then(next)
          .catch(e => next(e));
    case 3:
      return (req, res, next) =>
        Promise.resolve(h(req, res, next)).catch(e => next(e));
    default:
      throw new Error(
        `Handler must have an arity between 2 and 4, got ${h.length}`
      );
  }
}

const makeHandlers = middleware =>
  _.flatten(middleware)
    .map(handlerFunction)
    .map(nextWrapper);

const complete = new WeakSet();

class Donut {
  constructor(opt) {
    this.opt = Object.assign(
      {
        completionMethods: []
      },
      opt || {}
    );
    this.mh = [];
    this.eh = [];
  }

  use(...middleware) {
    const [eh, mh] = _.partition(
      _.flatten(middleware),
      h => typeof h === "function" && h.length === 4
    );
    this.mh.push(...makeHandlers(mh));
    this.eh.push(...eh);
    return this;
  }

  hook(pred, ...middleware) {
    const h = new this.constructor().use(...middleware);
    return this.use(async (req, res, next) => {
      if (!pred(req, res)) return next();
      await h.handle(req, res, next);
    });
  }

  markComplete(res) {
    complete.add(res);
    return this;
  }

  async handle(req, res, upNext) {
    const { mh, eh } = this;

    const isError = a => a && a !== "route";

    // TODO how to make methods on res that cancel next chaining

    const runMiddleware = async (mh, args, upNext, err) => {
      const queue = [];

      const next = arg => {
        if (isError(arg)) {
          if (err) throw err;
          return queue.push(async (req, res, next) =>
            runMiddleware([...eh], [arg, req, res], a => upNext(a || arg), arg)
          );
        }
        if (!mh.length || arg === "route") return upNext();
        queue.push(mh.shift());
      };

      next();

      while (queue.length) {
        if (complete.has(res)) break;
        const h = queue.shift();
        const n = _.once(next);
        try {
          await h(...args, n);
        } catch (e) {
          n(e);
        }
      }
    };

    return runMiddleware(
      [...mh],
      [req, res],
      upNext ||
        (err => {
          if (isError(err)) throw err;
        })
    );
  }
}

const donut = () => new Donut();
donut.Donut = Donut;

module.exports = donut;
