const isAdminRequest = (req) => {
  const token = req.headers["x-admin-token"];

  return Boolean(
    token &&
      process.env.ADMIN_TOKEN &&
      token === process.env.ADMIN_TOKEN,
  );
};

const requireAdmin = (req, res, next) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  next();
};

module.exports = {
  isAdminRequest,
  requireAdmin,
};
