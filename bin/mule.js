"use strict";

const _ = require("lodash");
const Promise = require("bluebird");
const config = require("config");
const dns = require("native-dns-multisocket");
const donut = require("..");

const { NAME_TO_QCLASS, NAME_TO_QTYPE } = dns.consts;
const lookupMap = { type: NAME_TO_QTYPE, class: NAME_TO_QCLASS };
const { A } = NAME_TO_QTYPE;
const { IN } = NAME_TO_QCLASS;

const reSuffix = suff => new RegExp(`${_.escapeRegExp(suff)}$`);

const normRec = rec =>
  _.mapValues(rec, (val, key) =>
    _.castArray(val).map(v => {
      if (!isNaN(v) || !lookupMap[key]) return v;
      const nVal = lookupMap[key][v.toUpperCase()];
      if (nVal === undefined) throw new Error(`Unknown ${key} ${v}`);
      return nVal;
    })
  );

const makeRec = rec =>
  _.mapValues(normRec(rec), (val, key) => {
    if (!_.isArray(val)) return val;
    if (val.length === 0) return;
    if (val.length === 1) return val[0];
    throw new Error(`Illegal multivalue for ${key}`);
  });

const matchValue = (v, like) =>
  (like instanceof RegExp && like.test(v)) || like === v;

const matchValues = (v, like) => like.some(l => matchValue(v, l));

const matchObject = (obj, like) =>
  Object.entries(like).every(([k, v]) => matchValues(obj[k], v));

const makeMatcher = pred => {
  if (typeof pred === "function") return pred;

  if (_.isArray(pred)) {
    const preds = pred.map(makeMatcher);
    return (req, res) => preds.some(p => p(req, res));
  }

  const norm = normRec(pred);
  return (req, res) => req.question.some(q => matchObject(q, norm));
};

class DonutDNS extends donut.Donut {
  constructor(opt) {
    super(Object.assign({ upstream: [], timeout: 10000 }, opt || []));
  }

  hook(pred, ...middleware) {
    return super.hook(makeMatcher(pred), ...middleware);
  }

  async lookup(question, server, timeout) {
    if (_.isArray(server))
      return Promise.any(server.map(s => lookup(question, s)));

    return new Promise((resolve, reject) => {
      const answer = [];
      dns
        .Request({ question, server, timeout })
        .on("message", (err, msg) => {
          if (err) reject(err);
          answer.push(...msg.answer);
        })
        .on("end", () => resolve(answer))
        .send();
    });
  }

  async proxyRequest(req, res) {
    const { upstream, timeout } = this.opt;
    const answers = _.flatten(
      await Promise.map(req.question, q => this.lookup(q, upstream, timeout))
    );
    res.answer.push(...answers);
  }

  alias(fake, real) {
    const fm = reSuffix(fake);
    const rm = reSuffix(real);

    return this.hook({ class: "in", name: fm }, async (req, res) => {
      // For some reason a for loop that just changes the name causes
      // ;; Question section mismatch: got plinth.pike/A/IN
      req.question = req.question.map(q => ({
        ...q,
        name: q.name.replace(fm, real)
      }));

      await this.proxyRequest(req, res);

      res.answer = res.answer.map(a => ({
        ...a,
        name: a.name.replace(rm, fake)
      }));

      res.send();
    });
  }
}

const { upstream, timeout, port } = config;
const app = new DonutDNS({ upstream, timeout, port });

app.alias(".pike.bbc.co.uk", ".pike");
app.alias(".local.bbc.co.uk", ".pike");

app.hook(
  { type: "a", class: "in", name: ["arse.co.uk", /\.arse\.co\.uk$/] },
  (req, res, next) => {
    res.answer = [
      {
        name: "arse.co.uk",
        type: 16,
        class: 1,
        ttl: 60,
        data: ["Arse!"]
      }
    ];
    res.send();
  }
);

app.use(async (req, res) => {
  await proxyRequest(req, res);
  res.send();
});

dns
  .createServer()
  .on("listening", () => console.log(`server listening on ${config.port}`))
  .on("close", () => console.log("server closed"))
  .on("error", (err, buff, req, res) => console.error(err.stack))
  .on("socketError", (err, socket) => console.error(err))
  .on("request", app.handle.bind(app))
  .serve(config.port);
