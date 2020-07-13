"use strict";

require("tap").mochaGlobals();
const should = require("should");

const donut = require("../..");

const addOutcome = app =>
  app.use(
    (req, res) => res.resolve({ req, res }),
    (err, req, res, next) => res.resolve({ err, req, res })
  );

const runApp = async (app, req, res) => {
  const rv = await new Promise((resolve, reject) => {
    Object.assign(res, { resolve, reject });
    app.handle(req, res);
  });
  delete res.resolve;
  delete res.reject;
  return rv;
};

describe("donut", () => {
  it("should handle no middleware", async () => {
    const app = donut();
    app.handle({}, {});
  });

  it("should handle a simple chain", async () => {
    const app = donut();
    app
      .use((req, res, next) => {
        res.out.push("m1");
        next();
      })
      .use(
        (req, res, next) => {
          next();
          res.out.push("m2");
        },
        (req, res, next) => {
          res.out.push("m3");
          next();
        }
      );
    addOutcome(app);
    const res = { out: [] };
    await runApp(app, {}, res);
    res.out.should.deepEqual(["m1", "m2", "m3"]);
  });

  it("should handle errors", async () => {
    const app = donut();
    app
      .use((req, res, next) => {
        if (req.errorAt === 1) next({ e: 1 });
        next();
      })
      .use((req, res, next) => {
        if (req.errorAt === 2) throw { e: 2 };
        next();
      })
      .use((req, res, next) => {
        res.out.push("OK!");
        next();
      })
      .use((err, req, res, next) => {
        res.out.push("e1");
        next();
      })
      .use((err, req, res, next) => {
        res.err = err;
        next();
      });

    addOutcome(app);

    const tryIt = async errorAt => {
      const req = { errorAt };
      const res = { out: [] };
      await runApp(app, req, res);
      return res;
    };

    (await tryIt(0)).should.deepEqual({ out: ["OK!"] });
    (await tryIt(1)).should.deepEqual({ out: ["e1"], err: { e: 1 } });
    (await tryIt(2)).should.deepEqual({ out: ["e1"], err: { e: 2 } });
  });

  it("should throw on bad mw arity", () => {
    const app = donut();
    (() => app.use(req => {})).should.throw(/arity/);
  });

  it("should handle mounted apps", async () => {
    const app = donut();
    const stage1 = donut();
    const stage2 = donut();

    stage1.use((req, res, next) => {
      res.stages.push(1);
      next();
    });

    stage2.use((req, res, next) => {
      res.stages.push(2);
      next();
    });

    app.use(stage1, stage2);
    addOutcome(app);
    const res = { stages: [] };
    await runApp(app, {}, res);
    res.should.deepEqual({ stages: [1, 2] });
  });

  it('should handle next("route")', async () => {
    const app = donut();
    const stage1 = donut();
    const stage2 = donut();

    stage1
      .use((req, res, next) => {
        res.stages.push(1);
        next("route");
      })
      .use((req, res, next) => {
        res.stages.push(99999);
        next();
      });

    stage2.use((req, res, next) => {
      res.stages.push(2);
      next();
    });

    app.use(stage1, stage2);
    app.use((req, res, next) => {
      res.stages.push("main");
      next();
    });

    addOutcome(app);
    const res = { stages: [] };
    await runApp(app, {}, res);
    res.should.deepEqual({ stages: [1, 2, "main"] });
  });

  it("should support hooks", async () => {
    const app = donut();
    app
      .hook(
        (req, res) => req.dom === "hexten.net",
        (req, res, next) => {
          res.dom.push("hexten.com");
          next();
        }
      )
      .hook(
        (req, res) => req.kind === "a",
        (req, res, next) => {
          res.kind = "A";
          next();
        }
      )
      .hook(
        (req, res) => req.ttl < 60,
        (req, res, next) => {
          res.fast = true;
          next();
        }
      );

    addOutcome(app);

    const tests = [
      { req: {}, res: {}, want: {} },
      {
        req: { dom: "hexten.net", kind: "aaaa", ttl: 600 },
        res: { dom: [] },
        want: { dom: ["hexten.com"] }
      },
      {
        req: { dom: "hexten.net", kind: "a", ttl: 600 },
        res: { dom: [] },
        want: { dom: ["hexten.com"], kind: "A" }
      },
      {
        req: { dom: "rciss.us", kind: "a", ttl: 30 },
        res: { dom: [] },
        want: { dom: [], kind: "A", fast: true }
      }
    ];

    for (const { req, res, want } of tests) {
      await runApp(app, req, res);
      res.should.deepEqual(want);
    }
  });
});
