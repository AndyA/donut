"use strict";

require("tap").mochaGlobals();
const should = require("should");

const donut = require("../..");

describe("donut", () => {
  it("should handle no middleware", async () => {
    const app = donut();
    await app.handle({}, {});
  });

  it("should handle a simple chain", async () => {
    const app = donut();
    app
      .use((req, res, next) => {
        res.out.push("m1");
        next();
      })
      .use(
        (req, res) => {
          res.out.push("m2");
        },
        (req, res, next) => {
          res.out.push("m3");
          next();
        }
      );
    const res = { out: [] };
    await app.handle({}, res);
    res.out.should.deepEqual(["m1", "m2", "m3"]);
  });

  it("should handle errors", async () => {
    const app = donut();
    app
      .use((err, req, res, next) => {
        res.out.push("e1");
        next();
      })
      .use((req, res, next) => {
        if (req.errorAt === 1) next({ e: 1 });
        next();
      })
      .use((req, res) => {
        if (req.errorAt === 2) throw { e: 2 };
      })
      .use((req, res) => {
        res.out.push("OK!");
      })
      .use((err, req, res, next) => {
        res.err = err;
      });

    const tryIt = async errorAt => {
      const req = { errorAt };
      const res = { out: [] };
      await app.handle(req, res);
      return res;
    };

    (await tryIt(0)).should.deepEqual({ out: ["OK!"] });
    (await tryIt(1)).should.deepEqual({ out: ["e1"], err: { e: 1 } });
    (await tryIt(2)).should.deepEqual({ out: ["e1"], err: { e: 2 } });
  });
});
