const express = require("express");
const { getPublicOrganizations } = require("../controllers/organizationController");

const router = express.Router();

router.get("/public", getPublicOrganizations);

module.exports = router;
