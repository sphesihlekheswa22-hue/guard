const USER_ROLES = ["reporter", "authority", "ngo", "officer", "ngo_worker", "admin"];

module.exports = {
  USER_ROLES,
  USER_ROLE_SET: new Set(USER_ROLES)
};
