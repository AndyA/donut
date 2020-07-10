"use strict";

const Promise = require("bluebird");
const donut = require("..");

const app = donut();
if (0) {
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
}

app
  .use((req, res, next) => {
    res.out.push("m1");
    next();
  })
  .use(
    (req, res, next) => {
      res.out.push("m2");
      next();
    },
    (req, res, next) => {
      res.out.push("m3");
      next();
    }
  );

(async () => {
  try {
    const res = { out: [] };
    console.log(app);
    await app.handle({}, res);
    console.log(res);
    await Promise.delay(1000);
    console.log(res);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
