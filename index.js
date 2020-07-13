"use strict";

const _ = require("lodash");

const handlerFunction = h =>
  typeof h.handle === "function" ? h.handle.bind(h) : h;

function nextWrapper(h) {
  // prettier-ignore
  switch (h.length) {
    case 2:
      return async (req, res, next) => {
        try { await Promise.resolve(h(req, res)); } 
        catch (e) { next(e); }
      };

    case 3:
      return async (req, res, next) => {
        try { await Promise.resolve(h(req, res, next)); }
        catch (e) { next(e); }
      };

    case 4:
      return async (err, req, res, next) => {
        try { await Promise.resolve(h(err, req, res, next)); }
        catch (e) { next(e); }
      };

    default:
      throw new Error(
        `Handler must have an arity between 2 and 4, got ${h.length}`
      );
  }
}

class Donut {
  constructor(opt) {
    this.opt = Object.assign({ cooker: mw => mw }, opt || {});
    this.mw = [];
  }

  cook(middleware) {
    return this.opt.cooker(middleware);
  }

  use(...middleware) {
    const handlers = this.cook(_.flattenDeep(middleware))
      .map(handlerFunction)
      .map(nextWrapper);
    this.mw.push(...handlers);
    return this;
  }

  hook(pred, ...middleware) {
    const h = new this.constructor(this.opt).use(...middleware);
    return this.use((req, res, next) => {
      if (!pred(req, res)) return next();
      h.handle(req, res, next);
    });
  }

  handle(req, res, upNext) {
    const isError = h => typeof h === "function" && h.length === 4;

    const runChain = (chain, args, upNext, err) => {
      const [skip, ret] = err
        ? [h => !isError(h), () => upNext(err)]
        : [isError, upNext];

      while (chain.length && skip(chain[0])) chain.shift();

      if (!chain.length) return ret();

      const [h, ...tail] = chain;
      let inHandler = true;
      const pending = [];

      const doNext = arg => {
        if (arg === "route") return ret();
        if (arg) {
          if (err) throw err; // TODO
          return runChain(tail, [arg, ...args], upNext, arg);
        }
        return runChain(tail, args, upNext, err);
      };

      const next = _.once(arg => (inHandler ? pending.push(arg) : doNext(arg)));

      h(...args, next).then(() => {
        inHandler = false;
        if (pending.length) doNext(pending[0]);
      });
    };

    runChain(
      [...this.mw],
      [req, res],
      upNext ||
        (err => {
          if (err && err !== "route") throw err;
        })
    );
  }
}

const donut = () => new Donut();
donut.Donut = Donut;

module.exports = donut;
