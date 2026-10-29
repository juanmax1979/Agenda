const express = require("express");
const auth = require("./auth");
const agenda = require("./agenda");
const admin = require("./admin");

const router = express.Router();
router.use("/auth", auth.router);
router.use("/agenda", agenda.router);
router.use("/admin", admin);

module.exports = router;
