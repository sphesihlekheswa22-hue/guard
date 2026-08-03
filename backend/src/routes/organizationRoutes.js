const express = require("express");
const { getPublicOrganizations } = require("../controllers/adminController");

const router = express.Router();

router.get("/public", getPublicOrganizations);

module.exports = router;
