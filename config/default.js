"use strict";

module.exports = {
  port: 5300,
  timeout: 10000,
  upstream: [
    {
      address: "192.168.1.128",
      port: 53,
      type: "udp"
    }
  ]
};
